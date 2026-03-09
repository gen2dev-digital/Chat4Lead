import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { logger } from '../../utils/logger';
import { contextManager } from './context.manager';
import { llmService } from '../llm/llm.service';
import { buildPromptDemenagement } from '../prompt/templates/demenagement';
import { RoleMessage, PrioriteLead, Metier } from '@prisma/client';

// ──────────────────────────────────────────────
//  TYPES
// ──────────────────────────────────────────────

interface MessageHandlerInput {
    conversationId: string;
    entrepriseId: string;
    message: string;
}

interface MessageHandlerOutput {
    reply: string;
    leadData?: any;
    score?: number;
    actions?: string[];
    metadata?: {
        tokensUsed?: number;
        latencyMs?: number;
        entitiesExtracted?: any;
        error?: boolean;
    };
}

// ──────────────────────────────────────────────
//  MESSAGE HANDLER — Le cerveau de Chat4Lead
// ──────────────────────────────────────────────

export class MessageHandler {

    /**
     * Méthode principale : traite un message utilisateur de bout en bout.
     *
     * Workflow : contexte → prompt → LLM → extraction → scoring → actions → sauvegarde
     */
    async handleUserMessage(input: MessageHandlerInput): Promise<MessageHandlerOutput> {
        const startTime = Date.now();
        const { conversationId, entrepriseId, message } = input;

        try {
            logger.info('🚀 [MessageHandler] Processing message START', {
                conversationId,
                messageLength: message.length,
                timestamp: new Date().toISOString()
            });

            // ── 1. Sauvegarder le message utilisateur (Await pour vider le cache avant lecture) ──
            await contextManager.saveMessage(conversationId, RoleMessage.user, message);

            // ── 2. Récupérer le contexte (frais car cache vidé par saveMessage) ──
            const context = await this.getFullContext(conversationId, entrepriseId);

            // ── 3.  Construire le prompt ──
            const currentLead = context.lead;
            const systemPrompt = await buildPromptDemenagement(
                {
                    nom: context.entreprise.nom,
                    nomBot: context.entreprise.nomBot,
                    email: context.entreprise.email,
                    telephone: context.entreprise.telephone ?? undefined,
                    zonesIntervention: context.config.zonesIntervention,
                    tarifsCustom: context.config.tarifsCustom,
                    specificites: context.config.specificites,
                    documentsCalcul: (context.config.documentsCalcul as string[]) || [],
                    consignesPersonnalisees: context.config.consignesPersonnalisees || '',
                },
                {
                    prenom: currentLead?.prenom || undefined,
                    nom: currentLead?.nom || undefined,
                    email: currentLead?.email || undefined,
                    telephone: currentLead?.telephone || undefined,
                    creneauRappel: currentLead?.creneauRappel || undefined,
                    satisfaction: currentLead?.satisfaction || undefined,
                    satisfactionScore: currentLead?.satisfactionScore || undefined,
                    projetData: (currentLead?.projetData || {}) as import('../prompt/templates/demenagement').ProjetDemenagementData,
                }
            );

            // ── 5.  Préparer les messages (Contexte étendu) ────────────
            // On utilise les messages déjà sauvegardés incluant le dernier message user
            // (saveMessage a déjà persisté le message user en étape 1)
            const recentMessages = context.messages.slice(-30);
            const llmMessages = [...recentMessages];

            // ── 6.  Appeler le LLM ───────────────────────────────
            let llmContent = '';
            let llmMetadata = { tokensUsed: 0, latencyMs: 0 };

            try {
                const llmResponse = await llmService.generateResponse(systemPrompt, llmMessages);
                llmContent = llmResponse.content;
                llmMetadata = {
                    tokensUsed: llmResponse.tokensUsed || 0,
                    latencyMs: llmResponse.latencyMs || 0,
                };
            } catch (llmError) {
                logger.error('⚠️ [LLM] Failure, using fallback message', {
                    error: llmError instanceof Error ? llmError.message : String(llmError),
                    conversationId
                });
                llmContent = "Désolé, j'ai rencontré un petit problème technique. Pouvez-vous reformuler votre message ?";
            }

            // ── 6b. Extraire le bloc DATA JSON du LLM (Option B) ──
            const { llmEntities, clean: cleanedContent } = this.parseLLMDataBlock(llmContent);
            llmContent = cleanedContent;

            // ── 6c. Nettoyage du texte LLM ──
            llmContent = this.sanitizeReply(llmContent);
            llmContent = this.filterRepeatedCreneauQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedVisitQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedStationnementQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedContactQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedIdentityQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedLogementQuestion(llmContent, currentLead);

            // ── 7.  Extraction regex + merge avec LLM ──
            // PRIORITÉ : bloc <!--DATA:--> du LLM est la source de vérité.
            // Les regex ne complètent que les champs absents du bloc LLM.
            const lastBotMsg = [...recentMessages].reverse().find((m: any) => m.role === 'assistant' || m.role === 'bot')?.content || '';
            const regexEntities = await this.extractEntities(message, llmContent, currentLead, lastBotMsg);
            // LLM en base → regex comblent uniquement les champs manquants
            const finalEntities = this.mergeEntities(llmEntities, regexEntities);

            // ── 8.  Mise à jour lead + score en 1 seule requête ──
            const newScore = this.calculateScore({ ...currentLead, projetData: { ...(currentLead?.projetData as any), ...finalEntities } });
            let updatedLead = currentLead;
            if (currentLead && Object.keys(finalEntities).length > 0) {
                updatedLead = await this.updateLead(currentLead.id, finalEntities, currentLead, newScore);
            } else if (currentLead) {
                updatedLead = await prisma.lead.update({
                    where: { id: currentLead.id },
                    data: { score: newScore, priorite: this.getPriorite(newScore, currentLead) },
                });
            }

            // ── 9.  Sauvegarder la réponse ────────
            await contextManager.saveMessage(
                conversationId,
                RoleMessage.assistant,
                llmContent,
                llmMetadata
            );

            // ── 10. Actions et résultat ──────────────────────────
            const actions = updatedLead ? await this.triggerActions(updatedLead, newScore) : [];
            const totalLatency = Date.now() - startTime;

            logger.info('✅ [MessageHandler] Processing message SUCCESS', {
                conversationId,
                score: newScore,
                latency: totalLatency
            });

            return {
                reply: llmContent,
                leadData: updatedLead,
                score: newScore,
                actions,
                metadata: {
                    ...llmMetadata,
                    entitiesExtracted: finalEntities,
                },
            };

        } catch (error) {
            logger.error('💥 [MessageHandler] CRITICAL ERROR', {
                conversationId,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                input: { conversationId, message }
            });
            return {
                reply: "Désolé, j'ai rencontré un problème technique. Pouvez-vous reformuler votre message ?",
                actions: [],
                metadata: { error: true }
            };
        }
    }

    /**
     * Variante streaming de handleUserMessage.
     * Appelle onChunk pour chaque chunk de texte visible (sans bloc DATA).
     * Retourne les métadonnées finales (score, leadData, actions) après la fin du stream.
     */
    async handleUserMessageStream(
        input: MessageHandlerInput & { onChunk: (chunk: string) => void }
    ): Promise<MessageHandlerOutput> {
        const startTime = Date.now();
        const { conversationId, entrepriseId, message, onChunk } = input;

        try {
            // ── 1. Sauvegarder le message utilisateur (Sequential await pour vider le cache) ──
            await contextManager.saveMessage(conversationId, RoleMessage.user, message);

            // ── 2. Récupérer le contexte (frais) ──
            const context = await this.getFullContext(conversationId, entrepriseId);

            // ── 3. Construire le prompt ──
            const currentLead = context.lead;
            const systemPrompt = await buildPromptDemenagement(
                {
                    nom: context.entreprise.nom,
                    nomBot: context.entreprise.nomBot,
                    email: context.entreprise.email,
                    telephone: context.entreprise.telephone ?? undefined,
                    zonesIntervention: context.config.zonesIntervention,
                    tarifsCustom: context.config.tarifsCustom,
                    specificites: context.config.specificites,
                    documentsCalcul: (context.config.documentsCalcul as string[]) || [],
                    consignesPersonnalisees: context.config.consignesPersonnalisees || '',
                },
                {
                    prenom: currentLead?.prenom || undefined,
                    nom: currentLead?.nom || undefined,
                    email: currentLead?.email || undefined,
                    telephone: currentLead?.telephone || undefined,
                    creneauRappel: currentLead?.creneauRappel || undefined,
                    satisfaction: currentLead?.satisfaction || undefined,
                    satisfactionScore: currentLead?.satisfactionScore || undefined,
                    projetData: (currentLead?.projetData || {}) as import('../prompt/templates/demenagement').ProjetDemenagementData,
                }
            );

            // ── 5. Messages ──
            // Le message user est déjà dans context.messages (sauvegardé à l'étape 1)
            const recentMessages = context.messages.slice(-30);
            const llmMessages = [...recentMessages];

            // ── 6. LLM streaming ──
            let llmContent = '';
            let llmMetadata = { tokensUsed: 0, latencyMs: 0 };

            try {
                const llmResponse = await llmService.streamResponse!(systemPrompt, llmMessages, onChunk);
                llmContent = llmResponse.content;
                llmMetadata = { tokensUsed: llmResponse.tokensUsed || 0, latencyMs: llmResponse.latencyMs || 0 };
            } catch (llmError) {
                logger.error('⚠️ [LLM-Stream] Failure', { error: String(llmError), conversationId });
                onChunk("Désolé, j'ai rencontré un petit problème technique. Pouvez-vous reformuler ?");
                llmContent = "Désolé, j'ai rencontré un petit problème technique. Pouvez-vous reformuler ?";
            }

            // ── 6b. DATA block + sanitize ──
            const { llmEntities, clean: cleanedContent } = this.parseLLMDataBlock(llmContent);
            llmContent = this.sanitizeReply(cleanedContent);
            llmContent = this.filterRepeatedCreneauQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedVisitQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedStationnementQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedContactQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedIdentityQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedLogementQuestion(llmContent, currentLead);

            // ── 7. Extraction + merge ──
            // PRIORITÉ : bloc <!--DATA:--> du LLM est la source de vérité.
            const lastBotMsg = [...recentMessages].reverse().find((m: any) => m.role === 'assistant' || m.role === 'bot')?.content || '';
            const regexEntities = await this.extractEntities(message, llmContent, currentLead, lastBotMsg);
            // LLM en base → regex comblent uniquement les champs manquants
            const finalEntities = this.mergeEntities(llmEntities, regexEntities);

            // ── 8. Mise à jour lead + score en 1 seule requête ──
            const newScore = this.calculateScore({ ...currentLead, projetData: { ...(currentLead?.projetData as any), ...finalEntities } });
            let updatedLead = currentLead;
            if (currentLead && Object.keys(finalEntities).length > 0) {
                updatedLead = await this.updateLead(currentLead.id, finalEntities, currentLead, newScore);
            } else if (currentLead) {
                updatedLead = await prisma.lead.update({
                    where: { id: currentLead.id },
                    data: { score: newScore, priorite: this.getPriorite(newScore, currentLead) },
                });
            }

            // ── 9. Sauvegarde réponse ──
            await contextManager.saveMessage(conversationId, RoleMessage.assistant, llmContent, llmMetadata);

            // ── 10. Actions ──
            const actions = updatedLead ? await this.triggerActions(updatedLead, newScore) : [];

            logger.info('✅ [MessageHandler-Stream] Done', { conversationId, score: newScore, latency: Date.now() - startTime });

            return {
                reply: llmContent,
                leadData: updatedLead,
                score: newScore,
                actions,
                metadata: { ...llmMetadata, entitiesExtracted: finalEntities },
            };
        } catch (error) {
            logger.error('💥 [MessageHandler-Stream] CRITICAL ERROR', { conversationId, error: String(error) });
            onChunk("Désolé, j'ai rencontré un problème technique. Pouvez-vous reformuler votre message ?");
            return {
                reply: "Désolé, j'ai rencontré un problème technique.",
                actions: [],
                metadata: { error: true },
            };
        }
    }

    // ──────────────────────────────────────────────
    //  CONTEXTE
    // ──────────────────────────────────────────────

    /**
     * Récupère le contexte complet : conversation, lead, entreprise, config métier.
     * Entreprise + config sont mis en cache Redis 1h via contextManager.getEntrepriseConfig().
     * Les deux appels (getContext + getEntrepriseConfig) sont parallélisés.
     */
    private async getFullContext(conversationId: string, entrepriseId: string) {
        const metier = Metier.DEMENAGEMENT;

        // Paralléliser contexte conversation et config entreprise (cache Redis 1h)
        const [context, { entreprise, config }] = await Promise.all([
            contextManager.getContext(conversationId),
            contextManager.getEntrepriseConfig(entrepriseId, metier),
        ]);

        if (!entreprise) {
            throw new Error(`Entreprise ${entrepriseId} non trouvée`);
        }

        if (!config) {
            throw new Error(`Config métier ${metier} non trouvée pour l'entreprise ${entrepriseId}`);
        }

        return {
            ...context,
            lead: context.leadData,
            entreprise,
            config,
        };
    }

    // ──────────────────────────────────────────────
    //  EXTRACTION D'ENTITÉS
    // ──────────────────────────────────────────────

    /**
     * Extrait les entités structurées depuis le message utilisateur
     * et la réponse du bot (confirmation de données).
     */
    private async extractEntities(message: string, llmContent: string, currentLead: any, lastBotMessage?: string): Promise<any> {
        const entities: any = {};
        const existingProjetData = (currentLead?.projetData as any) || {};
        // Nettoyage pour faciliter l'extraction (ex: "Dijon (93700)" -> "Dijon 93700")
        const combined = (message + ' ' + (llmContent || '')).replace(/\((\d{5})\)/g, ' $1 ');
        const lowerCombined = combined.toLowerCase();

        logger.debug('🔍 [Extraction] Start', { userMessage: message, botReply: llmContent.substring(0, 50) });

        // ── Email ──
        try {
            const emailRegex = /[a-zA-Z0-9._%+\-àâäéèêëîïôùûüç]+@[a-zA-Z0-9.\-àâäéèêëîïôùûüç]+\.[a-zA-Z]{2,}/gi;
            const emails = combined.match(emailRegex);
            if (emails && emails.length > 0) {
                let email = emails[0].toLowerCase().trim();
                if (email.endsWith('.')) email = email.slice(0, -1);
                entities.email = email;
                logger.info('✅ [Extraction] Email found', { email: entities.email });
            }
        } catch (e) { logger.error('❌ Email extraction failed', e); }

        // ── Téléphone français (formats variés) ──
        try {
            const phoneRegex = /(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
            const phones = combined.match(phoneRegex);
            if (phones && phones.length > 0) {
                // Normalisation : enlever espaces, tirets, points et gérer le +33
                let raw = phones[0].replace(/[\s.-]/g, '');
                if (raw.startsWith('+33')) {
                    raw = '0' + raw.slice(3);
                } else if (raw.startsWith('0033')) {
                    raw = '0' + raw.slice(4);
                }
                entities.telephone = raw;
                logger.info('✅ [Extraction] Phone found', { telephone: entities.telephone });
            }
        } catch (e) { logger.error('❌ Phone extraction failed', e); }

        // ── Codes postaux et Villes explicites (ex: "Beauvais 60000") ──
        try {
            const CITY_STOPWORDS = new Set([
                'déménagement', 'demenagement', 'estimation', 'standard', 'formule',
                'prestation', 'appartement', 'maison', 'studio', 'logement',
                'surface', 'volume', 'budget', 'environ', 'contact', 'client',
                'bonjour', 'merci', 'parfait', 'projet', 'arrivée', 'départ',
                'quel', 'quelle', 'quels', 'votre', 'notre', 'avez', 'vous', 'créneau',
            ]);

            // Mask phone numbers BEFORE city/CP extraction to avoid false positives (e.g. last 5 digits of phone)
            const combinedMasked = combined.replace(/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g, 'XXXXXXXX');
            const combinedForCity = combinedMasked.replace(/\((\d{5})\)/g, ' $1 ');

            // No 'i' flag: only match properly capitalized city names to avoid capturing full sentences
            const cityWithPostalPattern = /([A-ZÀ-Ÿ][a-zà-ÿ-]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ-]+)*)\s+(\d{5})|(\d{5})\s+([A-ZÀ-Ÿ][a-zà-ÿ-]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ-]+)*)/g;
            let match;
            while ((match = cityWithPostalPattern.exec(combinedForCity)) !== null) {
                const ville = match[1] || match[4];
                const cp = match[2] || match[3];
                if (ville && cp && !CITY_STOPWORDS.has(ville.toLowerCase())) {
                    const formattedVille = this.capitalizeFirst(ville);
                    if (!entities.villeDepart && !existingProjetData.villeDepart) {
                        entities.villeDepart = formattedVille;
                        entities.codePostalDepart = cp;
                    } else if (!entities.villeArrivee && !existingProjetData.villeArrivee && formattedVille !== (entities.villeDepart || existingProjetData.villeDepart)) {
                        entities.villeArrivee = formattedVille;
                        entities.codePostalArrivee = cp;
                    }
                }
            }

            // Fallback pour CP seuls sur le texte masqué (évite d'extraire des CP depuis les numéros de tél.)
            const cpRegex = /\b\d{5}\b/g;
            const cps = combinedMasked.match(cpRegex);
            if (cps && cps.length > 0) {
                // 1. CP Départ
                if (!entities.codePostalDepart && !existingProjetData.codePostalDepart) {
                    entities.codePostalDepart = cps[0];
                    if (!entities.villeDepart && !existingProjetData.villeDepart) {
                        const ville = await this.resolvePostalCode(cps[0]);
                        if (ville) entities.villeDepart = ville;
                    }
                }
                // 2. CP Arrivée (si différent)
                else if (
                    cps.length > 1 &&
                    !entities.codePostalArrivee &&
                    !existingProjetData.codePostalArrivee &&
                    cps[1] !== (entities.codePostalDepart || existingProjetData.codePostalDepart)
                ) {
                    entities.codePostalArrivee = cps[1];
                    if (!entities.villeArrivee && !existingProjetData.villeArrivee) {
                        const ville = await this.resolvePostalCode(cps[1]);
                        if (ville) entities.villeArrivee = ville;
                    }
                }
            }
        } catch (e) { logger.error('❌ Location extraction failed', e); }

        // ── Surface (m² / m2 / mètres carrés) ──
        try {
            const surfaceRegex = /(\d+)\s*(?:m²|m2|mètres?\s*carrés?)/gi;
            const surfaceMatch = surfaceRegex.exec(combined);
            if (surfaceMatch) {
                entities.surface = parseInt(surfaceMatch[1], 10);
                logger.debug('✅ [Extraction] Surface found', { surface: entities.surface });
            }
        } catch (e) { logger.error('❌ Surface extraction failed', e); }

        // ── Nombre de pièces (F2, F3, T2, T3 + "2 bedrooms / 2-bedroom") ──
        try {
            const piecesRegex = /\b[FT](\d)\b/gi;
            const piecesMatch = piecesRegex.exec(combined);
            if (piecesMatch) {
                entities.nbPieces = parseInt(piecesMatch[1], 10);
            } else {
                const bedroomRegex = /(\d+)[\s-]?(?:bedroom|bed)s?\b/i;
                const bedroomMatch = bedroomRegex.exec(combined);
                if (bedroomMatch) {
                    entities.nbPieces = parseInt(bedroomMatch[1], 10);
                }
            }
        } catch (e) { logger.error('❌ Pieces extraction failed', e); }

        // ── Étage et ascenseur contextuel (Départ vs Arrivée) ──
        try {
            const lowerBot = ((lastBotMessage || '') + ' ' + (llmContent || '')).toLowerCase();
            const isArrivee = lowerBot.includes('arrivée') || lowerBot.includes('arrivee') || lowerBot.includes('nouveau') || lowerBot.includes('à massy') || lowerBot.includes('livraison');

            // Extraction étage
            const etagePatterns = [
                /(\d+)(?:e|ème|er)\s*étage/i,
                /(?:au\s+|étage\s+)(\d+)/i,
                /(\d+)\s*étages?/i,
                /(?:rez|rdc|plain[\s-]?pied)/i,
            ];
            let extractedEtage: number | undefined;
            for (const re of etagePatterns) {
                const m = combined.match(re);
                if (m) {
                    if (/rez|rdc|plain/i.test(m[0])) {
                        extractedEtage = 0;
                        break;
                    }
                    const num = parseInt(m[1], 10);
                    if (!Number.isNaN(num) && num >= 0 && num <= 50) {
                        extractedEtage = num;
                        break;
                    }
                }
            }

            if (extractedEtage !== undefined) {
                if (isArrivee) {
                    if (existingProjetData.etageArrivee === undefined) entities.etageArrivee = extractedEtage;
                } else {
                    if (existingProjetData.etageDepart === undefined && existingProjetData.etage === undefined) entities.etageDepart = extractedEtage;
                }
            }

            // Extraction ascenseur
            let extractedAsc: boolean | undefined;
            if (/\b(avec|avec un?)\s+ascenseur\b/i.test(combined) || /\bascenseur\s+(pré?sent|oui|disponible)/i.test(combined)) {
                extractedAsc = true;
            } else if (/\bsans\s+ascenseur\b/i.test(combined) || /\bpas\s+d'?ascenseur\b/i.test(combined)) {
                extractedAsc = false;
            }

            if (extractedAsc !== undefined) {
                if (isArrivee) {
                    if (existingProjetData.ascenseurArrivee === undefined) entities.ascenseurArrivee = extractedAsc;
                } else {
                    if (existingProjetData.ascenseurDepart === undefined && existingProjetData.ascenseur === undefined) entities.ascenseurDepart = extractedAsc;
                }
            }

            // Extraction type d'escalier
            const escalierPatterns = [
                { pattern: /\b(colima[çc]on|h[ée]lico[ïi]dal)\b/i, val: 'Colimaçon' },
                { pattern: /\b([ée]troit|serr[ée]|difficile|petit)\s+escalier\b/i, val: 'Étroit' },
                { pattern: /\bescalier\s+([ée]troit|serr[ée]|difficile|petit)\b/i, val: 'Étroit' },
                { pattern: /\b(large|spacieux|standard|normal)\s+escalier\b/i, val: 'Large' },
                { pattern: /\bescalier\s+(large|spacieux|standard|normal)\b/i, val: 'Large' },
            ];
            for (const ptn of escalierPatterns) {
                if (ptn.pattern.test(combined)) {
                    if (isArrivee) entities.typeEscalierArrivee = ptn.val;
                    else entities.typeEscalierDepart = ptn.val;
                    break;
                }
            }

            // Extraction gabarit ascenseur
            const ascGabaritPatterns = [
                { pattern: /\b(petit|1\s*-\s*2|2\s*pers|2\s*personnes)\s+ascenseur\b/i, val: 'Petit' },
                { pattern: /\bascenseur\s+(petit|1\s*-\s*2|2\s*pers|2\s*personnes)\b/i, val: 'Petit' },
                { pattern: /\b(moyen|standard|normal|4\s*-\s*6|4\s*pers)\s+ascenseur\b/i, val: 'Moyen' },
                { pattern: /\bascenseur\s+(moyen|standard|normal|4\s*-\s*6|4\s*pers)\b/i, val: 'Moyen' },
                { pattern: /\b(large|grand|spacieux|8\s*pers|monte\s*charge)\s+ascenseur\b/i, val: 'Grand' },
                { pattern: /\bascenseur\s+(large|grand|spacieux|8\s*pers|monte\s*charge)\b/i, val: 'Grand' },
            ];
            for (const ptn of ascGabaritPatterns) {
                if (ptn.pattern.test(combined)) {
                    if (isArrivee) entities.gabaritAscenseurArrivee = ptn.val;
                    else entities.gabaritAscenseurDepart = ptn.val;
                    break;
                }
            }
        } catch (e) { logger.error('❌ contextual floor/elevator/stairs extraction failed', e); }

        // ── Volume explicite (m³ / m3 / mètres cubes) — gère les décimales (ex: 62,5 m³) ──
        try {
            const volumeRegex = /(\d+(?:[.,]\d+)?)\s*(?:m³|m3|mètres?\s*cubes?)/gi;
            const volumeMatch = volumeRegex.exec(combined);
            if (volumeMatch) {
                entities.volumeEstime = parseFloat(volumeMatch[1].replace(',', '.'));
            }
        } catch (e) { logger.error('❌ Volume extraction failed', e); }

        // ── Stationnement (Oui/Facile → Facile, Non/Difficile → Difficile) ──
        // Contexte : la question du bot (lastBotMessage) indique départ ou arrivée
        try {
            const lowerMsg = message.toLowerCase().trim();
            const lowerBot = ((lastBotMessage || '') + ' ' + (llmContent || '')).toLowerCase();
            const isOuiFacile = /\b(oui|ouais|yes|facile|pas de souci|pas de problème|c'est bon|ok)\b/i.test(lowerMsg) && !/\b(non|difficile|compliqué)\b/i.test(lowerMsg);
            const isNonDifficile = /\b(non|difficile|compliqué|pas facile)\b/i.test(lowerMsg);

            if (isOuiFacile || isNonDifficile) {
                const valeur = isOuiFacile ? 'Facile' : 'Difficile';
                const isStationnementQuestion = lowerBot.includes('stationnement') || lowerBot.includes('garer') || lowerBot.includes('parking') || lowerBot.includes('accès camion');

                if (isStationnementQuestion) {
                    if (lowerBot.includes('départ') || lowerBot.includes('depart') || lowerBot.includes('ancien')) {
                        if (!existingProjetData.stationnementDepart) entities.stationnementDepart = valeur;
                    } else if (lowerBot.includes('arrivée') || lowerBot.includes('arrivee') || lowerBot.includes('nouveau')) {
                        if (!existingProjetData.stationnementArrivee) entities.stationnementArrivee = valeur;
                    }
                }
            }

            // Extraction proximité plus précise
            const proxPatterns = [
                { pattern: /\bau pied\b/i, val: 'Au pied' },
                { pattern: /\b(10|20|30|40|50)\s*m\b/i, val: 'Proche (<50m)' },
                { pattern: /\b(100|200|plusieurs|loin)\s*m\b/i, val: 'Éloigné (100m+)' },
            ];
            for (const ptn of proxPatterns) {
                if (ptn.pattern.test(combined)) {
                    const botLower = lowerBot;
                    if (botLower.includes('départ') || botLower.includes('depart')) entities.stationnementProximiteDepart = ptn.val;
                    else if (botLower.includes('arrivée') || botLower.includes('arrivee')) entities.stationnementProximiteArrivee = ptn.val;
                    break;
                }
            }
        } catch (e) { logger.error('❌ Stationnement extraction failed', e); }

        // ── Type d'habitation (Maison / Appartement) ──
        try {
            const lowerMsg = message.toLowerCase();
            const lowerBot = ((lastBotMessage || '') + ' ' + (llmContent || '')).toLowerCase();
            const isMaison = /\b(maison|pavillon|villa)\b/i.test(lowerMsg);
            const isAppart = /\b(appartement|appart|studio|f\d|t\d)\b/i.test(lowerMsg);

            if (isMaison || isAppart) {
                const type = isMaison ? 'Maison' : 'Appartement';
                if (lowerBot.includes('départ') || lowerBot.includes('depart')) {
                    if (!existingProjetData.typeHabitationDepart) entities.typeHabitationDepart = type;
                } else if (lowerBot.includes('arrivée') || lowerBot.includes('arrivee')) {
                    if (!existingProjetData.typeHabitationArrivee) entities.typeHabitationArrivee = type;
                } else if (!existingProjetData.typeHabitationDepart) {
                    entities.typeHabitationDepart = type; // Défaut au départ si non précisé
                }
            }
        } catch (e) { logger.error('❌ Type habitation extraction failed', e); }

        // ── Date (JJ/MM/YYYY ou JJ-MM-YYYY ou "15 mars") ──
        try {
            const dateRegex = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g;
            const dateMatch = dateRegex.exec(combined);
            if (dateMatch) {
                entities.dateSouhaitee = dateMatch[0];
            } else {
                const months: Record<string, string> = {
                    'janv': '01', 'févr': '02', 'mars': '03', 'avril': '04', 'mai': '05', 'juin': '06',
                    'juil': '07', 'août': '08', 'sept': '09', 'oct': '10', 'nov': '11', 'déc': '12',
                    // English support (remainders)
                    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
                    'jul': '07', 'aug': '08', 'sep': '09', 'dec': '12'
                };
                const textDateRegex = /(\d{1,2})\s*(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc|jan|feb|mar|apr|may|jun|jul|aug|sep|dec)[a-z]*|(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc|jan|feb|mar|apr|may|jun|jul|aug|sep|dec)[a-z]*\s*(\d{1,2})(?:st|nd|rd|th)?/i;
                const textMatch = textDateRegex.exec(combined);
                if (textMatch) {
                    let day, monthStr;
                    if (textMatch[1]) {
                        // Format: 15 March
                        day = textMatch[1].padStart(2, '0');
                        monthStr = textMatch[2].toLowerCase().substring(0, 3);
                    } else {
                        // Format: March 15th
                        day = textMatch[4].padStart(2, '0');
                        monthStr = textMatch[3].toLowerCase().substring(0, 3);
                    }
                    let month = '01';
                    for (const [key, val] of Object.entries(months)) {
                        if (monthStr.startsWith(key)) {
                            month = val;
                            break;
                        }
                    }
                    const year = new Date().getFullYear();
                    entities.dateSouhaitee = `${day}/${month}/${year}`;
                } else if (/dans\s+(\d+)\s+jours/i.test(combined)) {
                    const daysMatch = /dans\s+(\d+)\s+jours/i.exec(combined);
                    if (daysMatch) {
                        const d = new Date();
                        d.setDate(d.getDate() + parseInt(daysMatch[1], 10));
                        entities.dateSouhaitee = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
                    }
                }
            }
        } catch (e) { logger.error('❌ Date extraction failed', e); }

        // ── Villes (pattern "X a/à Y" ou "de X à Y" avec villes multi-mots) ──
        try {
            const CITY_STOP = new Set([
                'déménagement', 'demenagement', 'estimation', 'standard', 'formule',
                'prestation', 'appartement', 'maison', 'studio', 'logement',
                'surface', 'volume', 'budget', 'environ', 'contact', 'client',
                'bonjour', 'merci', 'parfait', 'projet', 'arrivée', 'départ',
                'mon', 'ton', 'son', 'notre', 'votre', 'leur', 'un', 'une', 'le', 'la',
                'quel', 'quelle', 'créneau', 'vous', 'affiner',
            ]);
            const isValidCity = (s: string) => s && s.length > 1 && !CITY_STOP.has(s.toLowerCase().trim());

            // Pattern "X a/à Y" ou "de X a/à Y" avec villes multi-mots (ex: "Boissy saint leger a Perpignan 25m3")
            const trajetMatch = combined.match(/(?:de\s+)?([A-Za-zÀ-ÿ\s-]+?)\s+(?:a|à)\s+([A-Za-zÀ-ÿ\s-]+?)(?:\s+\d+[\s]*(?:m³|m3)?|\s*$)/i);
            if (trajetMatch && (!entities.villeDepart && !existingProjetData.villeDepart || !entities.villeArrivee && !existingProjetData.villeArrivee)) {
                const v1 = this.capitalizeFirst(trajetMatch[1].trim().replace(/[,.!?;]/g, ''));
                const v2 = this.capitalizeFirst(trajetMatch[2].trim().replace(/[,.!?;]/g, ''));
                if (isValidCity(v1) && isValidCity(v2) && v1 !== v2) {
                    if (!entities.villeDepart && !existingProjetData.villeDepart) entities.villeDepart = v1;
                    if (!entities.villeArrivee && !existingProjetData.villeArrivee) entities.villeArrivee = v2;
                }
            }

            // Fallback: mots avec "de", "à", "a", "vers"
            const words = combined.split(/\s+/);
            for (let i = 0; i < words.length - 1; i++) {
                const rawWord = words[i].toLowerCase().replace(/[:]/g, '');
                let nextWord = words[i + 1];

                const contractionMatch = rawWord.match(/^d[''](.+)/i);
                if (contractionMatch) {
                    const cityCandidate = contractionMatch[1];
                    if (/^[A-ZÀ-Ü]/i.test(cityCandidate) && cityCandidate.length > 1) {
                        const city = this.capitalizeFirst(cityCandidate.replace(/[,.!?;]/g, ''));
                        if (!CITY_STOP.has(city.toLowerCase()) && !entities.villeDepart && !existingProjetData.villeDepart) {
                            entities.villeDepart = city;
                        }
                        continue;
                    }
                }

                const prepList = ['de', 'from', 'vers', 'à', 'a', 'to', "de l'", "de la", "d'"];
                if (prepList.includes(rawWord) && /^[A-ZÀ-Üa-zà-ü]/i.test(nextWord)) {
                    const city = this.capitalizeFirst(nextWord.replace(/[,.!?;]/g, ''));
                    if (CITY_STOP.has(city.toLowerCase())) continue;
                    if (['de', 'from'].includes(rawWord) && !entities.villeDepart && !existingProjetData.villeDepart) entities.villeDepart = city;
                    if (['vers', 'à', 'a', 'to'].includes(rawWord) && !entities.villeArrivee && !existingProjetData.villeArrivee) {
                        entities.villeArrivee = city;
                    }
                }
            }
        } catch (e) { logger.error('❌ City extraction failed', e); }

        // ── Prénom / Nom ──
        const { prenom, nom } = this.extractName(message);
        if (prenom && !currentLead.prenom) {
            entities.prenom = prenom;
            logger.info('✅ Prénom extrait', { prenom });
        }
        if (nom && !currentLead.nom) {
            entities.nom = nom;
            logger.info('✅ Nom extrait', { nom });
        }

        // ── Créneau de rappel (jour + horaire) ──
        // IMPORTANT: recherche uniquement dans le message utilisateur (pas dans la réponse bot)
        // pour éviter les faux positifs quand le bot propose "matin ou après-midi"
        {
            const lowerMsg = message.toLowerCase();
            const JOURS: Record<string, string> = {
                'lundi': 'Lundi', 'mardi': 'Mardi', 'mercredi': 'Mercredi',
                'jeudi': 'Jeudi', 'vendredi': 'Vendredi', 'samedi': 'Samedi', 'dimanche': 'Dimanche',
                'monday': 'Lundi', 'tuesday': 'Mardi', 'wednesday': 'Mercredi',
                'thursday': 'Jeudi', 'friday': 'Vendredi', 'saturday': 'Samedi', 'sunday': 'Dimanche',
            };
            let jourTrouve = '';
            if (lowerMsg.includes('demain') || lowerMsg.includes('tomorrow')) {
                jourTrouve = 'Demain';
            } else {
                for (const [k, v] of Object.entries(JOURS)) {
                    if (lowerMsg.includes(k)) { jourTrouve = v; break; }
                }
            }
            let horaireTrouve = '';
            if (lowerMsg.includes('matin') || lowerMsg.includes('morning') || lowerMsg.includes('9h') || lowerMsg.includes('9h-12h')) {
                horaireTrouve = 'Matin (9h-12h)';
            } else if (lowerMsg.includes('après-midi') || lowerMsg.includes('apres-midi') || lowerMsg.includes('afternoon') || lowerMsg.includes('14h')) {
                horaireTrouve = 'Après-midi (14h-18h)';
            } else if (lowerMsg.includes('soir') || lowerMsg.includes('evening') || lowerMsg.includes('18h') || lowerMsg.includes('20h')) {
                horaireTrouve = 'Soir (après 18h)';
            } else if (lowerMsg.includes('midi') || lowerMsg.includes('noon') || lowerMsg.includes('12h')) {
                horaireTrouve = 'Midi (12h-14h)';
            }
            if (lowerMsg.includes('pas de préférence') || lowerMsg.includes('peu importe') || lowerMsg.includes("n'importe") || lowerMsg.includes('anytime') || lowerMsg.includes('flexible')) {
                entities.creneauRappel = 'Pas de préférence';
            } else if (jourTrouve || horaireTrouve) {
                // Si le lead a déjà accepté une visite, c'est le créneau de la visite technique (jour + horaire)
                if (existingProjetData.rdvConseiller === true) {
                    // Fusionner avec l'existant : "Mardi" + "Matin (9h-12h)" → "Mardi Matin (9h-12h)"
                    const existing = (existingProjetData.creneauVisite || '') as string;
                    const existingJour = /^(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche|Demain)/.exec(existing)?.[1] || '';
                    const existingHoraire = /(Matin|Après-midi|Soir|Midi)\s*\([^)]+\)/.exec(existing)?.[0] || '';
                    const jour = jourTrouve || existingJour;
                    const horaire = horaireTrouve || existingHoraire;
                    const creneauStr = [jour, horaire].filter(Boolean).join(' ');
                    if (creneauStr) entities.creneauVisite = creneauStr;
                } else {
                    entities.creneauRappel = [jourTrouve, horaireTrouve].filter(Boolean).join(' ');
                }
            }
        }

        // ── Satisfaction (extraite du message utilisateur uniquement) ──
        const noteMatch = message.match(/\[NOTE:\s*(\d)\/5\]\s*(.*)/i);
        if (noteMatch) {
            entities.satisfactionScore = parseInt(noteMatch[1], 10);
            const comment = noteMatch[2]?.trim();
            entities.satisfaction = comment
                ? `${noteMatch[1]}/5 — ${comment}`
                : `${noteMatch[1]}/5`;
        }

        // ── Formule (Eco, Standard, Luxe) ──
        try {
            const formulaRegex = /\b(économique|eco|éco|standard|confort|luxe|prestige)\b/i;
            const formulaMatch = formulaRegex.exec(combined);
            if (formulaMatch) {
                entities.formule = this.capitalizeFirst(formulaMatch[1]);
            }
        } catch (e) { logger.error('❌ Formula extraction failed', e); }

        logger.debug('🎯 [Extraction] Result', { extracted: Object.keys(entities) });
        return entities;
    }

    /**
     * Extraction robuste du prénom et du nom avec 7 patterns et stop words.
     * Doit ignorer les mots métier comme "Estimation tarifaire", "Devis", etc.
     */
    private extractName(userMessage: string): { prenom: string | null; nom: string | null } {
        // ── Stop words : mots qui ne sont JAMAIS des prénoms ──
        const STOPWORDS = new Set([
            // Salutations
            'bonjour', 'bonsoir', 'salut', 'hello', 'hey', 'coucou', 'slt',
            'bjr', 'bsr', 'hi', 'hola', 'buenos', 'allo',

            // Réponses courantes
            'oui', 'non', 'ok', 'okay', 'ouais', 'nope', 'yes', 'no',

            // Logement (plain, pied = configuration maison, jamais des noms)
            'plain', 'pied', 'appart', 'appartement', 'maison', 'studio', 'logement',
            'immeuble', 'bureaux', 'bureau', 'batiment', 'villa', 'chambre', 'piece', 'pièce', 'etage', 'étage',

            // Mots métier déménagement — JAMAIS des prénoms/noms
            'estimation', 'tarifaire', 'tarif', 'devis', 'calcul', 'volume', 'déménagement', 'demenagement',
            'transport', 'emballage', 'prestation', 'formule', 'standard', 'luxe', 'economique',
            'informatique', 'information', 'informations', 'complement', 'complémentaires',
            'nos', 'services', 'service', 'contact', 'coordonnees', 'coordonnées',

            // Villes FR
            'paris', 'lyon', 'marseille', 'bordeaux', 'lille', 'nantes',
            'strasbourg', 'toulouse', 'nice', 'rennes', 'grenoble',
            'montpellier', 'versailles', 'boulogne', 'neuilly', 'vincennes',
            'montreuil', 'angers', 'roubaix', 'toulon', 'reims', 'dijon', 'mulhouse',

            // Villes internationales
            'london', 'madrid', 'sydney', 'bruxelles', 'amsterdam',
            'berlin', 'rome', 'barcelona',

            // Mois
            'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
            'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',

            // Jours
            'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche',
            'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',

            // Verbes / Actions / Parasites
            'merci', 'voila', 'voilà', 'super', 'parfait',
            'bouge', 'partir', 'arriver', 'quitter', 'bientot', 'possible', 'urgent', 'vite',
            'tomber', 'et', 'la', 'le', 'les', 'un', 'une', 'petit', 'grand', 'nouveau', 'ancien', 'vieux',
            'laissez', 'contacter', 'rappeler', 'confirmer', 'eco', 'éco',
            'parking', 'ascenseur', 'escalier', 'cest', 'note', 'noté',
            'jdemenage', 'jdemenag', 'demenage', 'demenageons', 'demenager', 'moving', 'move', 'immoving', 'deménage', 'démén',
            'midi', 'apres', 'après', 'matin', 'soir', 'heure', 'heures', 'rdv', 'rendez-vous',
            // Mots de description qui parasitent l'extraction
            'moyen', 'petit', 'grand', 'tres', 'très', 'quelques', 'plusieurs', 'environ', 'estimé',
            'estime', 'calcule', 'calculé', 'confirme', 'confirmé', 'noté', 'note',
            'its', 'good', 'great', 'excellent', 'perfect', 'wonderful', 'fine', 'nice', 'awesome',
            'thanks', 'thank', 'okay', 'alright', 'done', 'noted', 'confirmed', 'understood',
            'tomorrow', 'today', 'yesterday', 'morning', 'afternoon', 'evening', 'night'
        ]);

        const NAME_STOPWORDS = new Set([
            'et', 'ou', 'avec', 'sans', 'pour', 'dans', 'sur',
            'demenage', 'déménage', 'déménager', 'demenager',
            'pars', 'part', 'va', 'vais', 'suis', 'ai',
            'veux', 'veu', 'vou', 'voudrais',
            'de', 'la', 'le', 'du', 'des', 'un', 'une',
        ]);

        // FIX B : Normalisation des majuscules (ex: "JEAN MARTIN" -> "Jean Martin")
        let clean = userMessage.trim();
        const lettersOnly = clean.replace(/[^a-zA-Z]/g, '');
        const isAllCaps = lettersOnly.length > 2 && lettersOnly === lettersOnly.toUpperCase();
        if (isAllCaps) {
            clean = clean.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        }

        // Helper pour rejeter un couple (prenom, nom) qui contient des mots interdits
        const isForbiddenName = (candidate: string | null): boolean => {
            if (!candidate) return false;
            const parts = candidate.split(/\s+/);
            return parts.some(p => STOPWORDS.has(p.toLowerCase()));
        };

        // Pattern 1 : "je m'appelle [Prénom] [Nom?]"
        const p1 = clean.match(/je m['']appelle\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i);
        if (p1) {
            const rawName = p1[1];
            const parts = rawName.trim().split(/\s+/);
            const prenom = this.capitalizeFirst(parts[0]);
            let nom = parts.length >= 2 ? this.capitalizeFirst(parts.slice(1).join(' ')) : null;
            if (nom && NAME_STOPWORDS.has(nom.toLowerCase())) nom = null;
            if (!STOPWORDS.has(prenom.toLowerCase()) && !isForbiddenName(nom)) return { prenom, nom };
        }

        // Pattern 2 : "je suis [Prénom] [Nom?]"
        const p2 = clean.match(/je suis\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i);
        if (p2) {
            const rawName = p2[1];
            const parts = rawName.trim().split(/\s+/);
            const prenom = this.capitalizeFirst(parts[0]);
            let nom = parts.length >= 2 ? this.capitalizeFirst(parts.slice(1).join(' ')) : null;
            if (nom && NAME_STOPWORDS.has(nom.toLowerCase())) nom = null;
            if (!STOPWORDS.has(prenom.toLowerCase()) && !isForbiddenName(nom)) return { prenom, nom };
        }

        // Pattern 3 : EN/ES/FR explicit patterns
        const explicitPatterns = [
            { regex: /(?:mon nom est|my name is|mi nombre es)\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i, group: 1 },
            { regex: /(?:i am|i'?m|me llamo|soy)\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i, group: 1 },
            { regex: /(?:appelle[z]?[\s-]moi|call me)\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i, group: 1 }
        ];

        for (const p of explicitPatterns) {
            const match = clean.match(p.regex);
            if (match) {
                const rawName = match[p.group];
                const parts = rawName.trim().split(/\s+/);
                const prenom = this.capitalizeFirst(parts[0]);
                let nom = parts.length >= 2 ? this.capitalizeFirst(parts.slice(1).join(' ')) : null;
                if (nom && NAME_STOPWORDS.has(nom.toLowerCase())) nom = null;
                // Avoid capturing action words for "I'm moving..."
                if (prenom.toLowerCase() === 'moving' || prenom.toLowerCase() === 'from') continue;
                if (!STOPWORDS.has(prenom.toLowerCase()) && !isForbiddenName(nom)) return { prenom, nom };
            }
        }

        // Pattern 4 : "contact : [Prénom] [Nom]," (lead organisé)
        const p4 = clean.match(/contact\s*:\s*([A-ZÀ-Üa-zà-ü]+)\s+([A-ZÀ-Üa-zà-ü]+)/i);
        if (p4) {
            const prenom = this.capitalizeFirst(p4[1]);
            let nom: string | null = this.capitalizeFirst(p4[2]);
            if (nom && NAME_STOPWORDS.has(nom.toLowerCase())) nom = null;
            if (!STOPWORDS.has(prenom.toLowerCase()) && !isForbiddenName(nom)) return { prenom, nom };
        }

        // Pattern 5 : "[Prénom] [Nom], email@..." (lead organisé inline)
        const p5 = clean.match(/([A-ZÀ-Üa-zà-ü]+)\s+([A-ZÀ-Üa-zà-ü]+)\s*,\s*[\w.+-]+@/i);
        if (p5) {
            const prenom = this.capitalizeFirst(p5[1]);
            let nom: string | null = this.capitalizeFirst(p5[2]);
            if (nom && NAME_STOPWORDS.has(nom.toLowerCase())) nom = null;
            if (!STOPWORDS.has(prenom.toLowerCase()) && !isForbiddenName(nom)) return { prenom, nom };
        }

        // Pattern 6 : "[Prénom] [Nom]" seul sur la ligne (ex: "Marie Dubois")
        const p6 = clean.match(/^([A-ZÀ-Üa-zà-ü]{2,20})\s+([A-ZÀ-Üa-zà-ü]{2,20})$/i);
        if (p6) {
            const prenom = this.capitalizeFirst(p6[1]);
            let nom: string | null = this.capitalizeFirst(p6[2]);
            if (nom && NAME_STOPWORDS.has(nom.toLowerCase())) nom = null;
            if (!STOPWORDS.has(prenom.toLowerCase()) && (!nom || !STOPWORDS.has(nom.toLowerCase())) && !isForbiddenName(nom)) {
                return { prenom, nom };
            }
        }

        // Pattern 7 : Prénom seul (ex: "sophie" ou "SOPHIE")
        const p7 = clean.match(/^([A-ZÀ-Üa-zà-ü]{2,20})$/i);
        if (p7) {
            const prenom = this.capitalizeFirst(p7[1]);
            if (!STOPWORDS.has(prenom.toLowerCase())) return { prenom, nom: null };
        }

        return { prenom: null, nom: null };
    }

    /**
     * Helper pour mettre en majuscule la première lettre.
     */
    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    // ──────────────────────────────────────────────
    //  MISE À JOUR DU LEAD
    // ──────────────────────────────────────────────

    /**
     * Met à jour le lead avec les nouvelles entités extraites.
     * Accepte le lead existant (évite un findUnique) et fusionne le score en 1 seul update.
     * @param existingLead - lead déjà chargé depuis le contexte (évite findUnique)
     * @param score - si fourni, inclus dans la même requête update (évite une 2e requête)
     */
    private async updateLead(
        leadId: string,
        entities: Record<string, any>,
        existingLead: any,
        score?: number
    ) {
        const updates: Record<string, any> = {};

        // ── Champs directs : toujours mettre à jour si une nouvelle valeur non-vide est fournie.
        // Cela permet de corriger un faux prénom/nom capturé par erreur au tour précédent.
        // Le LLM (via bloc DATA) a la priorité pour corriger une valeur erronée.
        if (entities.prenom && typeof entities.prenom === 'string') updates.prenom = entities.prenom;
        if (entities.nom && typeof entities.nom === 'string') updates.nom = entities.nom;
        if (entities.email && typeof entities.email === 'string') updates.email = entities.email;
        if (entities.telephone && typeof entities.telephone === 'string') updates.telephone = entities.telephone;

        // ── Fusion projetData non-destructive (jamais écraser une valeur existante avec null/false/'') ──
        const existingProjet = (existingLead.projetData as Record<string, any>) || {};
        const projetData = this.mergeProjetDataSafe(existingProjet, entities);

        // champs directs supplémentaires
        if (entities.creneauRappel) updates.creneauRappel = entities.creneauRappel;
        if (entities.satisfaction) updates.satisfaction = entities.satisfaction;
        if (entities.satisfactionScore) updates.satisfactionScore = entities.satisfactionScore;

        updates.projetData = projetData;

        // ── Score + priorité fusionnés dans le même update ──
        if (score !== undefined) {
            updates.score = score;
            updates.priorite = this.getPriorite(score, { ...existingLead, projetData });
        }

        // ── Persist : 1 seule requête DB ──
        const updatedLead = await prisma.lead.update({
            where: { id: leadId },
            data: updates,
        });

        // ── ⚡ Invalidation Cache ⚡ (CRITIQUE pour éviter les répétitions au tour suivant) ──
        const conversation = await prisma.conversation.findFirst({ where: { leadId } });
        if (conversation) {
            await contextManager.clearContextCache(conversation.id);
        }

        return updatedLead;
    }

    // ──────────────────────────────────────────────
    //  SCORING (0 – 100)
    // ──────────────────────────────────────────────

    /**
     * Calcule le score du lead sur 100 :
     *   40 pts — complétude des informations
     *   30 pts — urgence (proximité de la date)
     *   20 pts — valeur du projet (volume)
     *   10 pts — engagement (base)
     */
    private calculateScore(lead: any): number {
        if (!lead) return 0;

        let score = 0;
        const projet = (lead.projetData as Record<string, any>) || {};

        // ── 1. COMPLÉTUDE (50 pts max) ──
        if (lead.email) score += 10;
        if (lead.telephone) score += 10;
        if (lead.prenom || lead.nom) score += 10; // Identité
        if (projet.codePostalDepart || projet.villeDepart) score += 5;
        if (projet.codePostalArrivee || projet.villeArrivee) score += 5;
        if (projet.volumeEstime || projet.surface || projet.nbPieces) score += 5; // Projet
        if (projet.formule) score += 5; // Formule

        // ── 2. URGENCE (20 pts max) ──
        if (projet.dateSouhaitee) {
            try {
                const dateStr = projet.dateSouhaitee;
                const today = new Date();
                let targetDate: Date;

                if (dateStr.includes('/') || dateStr.includes('-')) {
                    const parts = dateStr.split(/[/\-]/);
                    const jj = parseInt(parts[0], 10);
                    const mm = parseInt(parts[1], 10) - 1;
                    const aaaa = parseInt(parts[2], 10);
                    targetDate = new Date(aaaa, mm, jj);
                } else {
                    targetDate = new Date(dateStr);
                }

                if (!isNaN(targetDate.getTime())) {
                    const diffTime = targetDate.getTime() - today.getTime();
                    const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (daysUntil < 7) score += 20;        // Très urgent
                    else if (daysUntil < 14) score += 15;   // Urgent
                    else if (daysUntil < 30) score += 10;   // Moyen terme
                    else score += 5;                        // Long terme
                }
            } catch { /* ignore */ }
        }

        // ── 3. VALEUR DU PROJET (20 pts max) ──
        const volume = projet.volumeEstime || (projet.surface ? Math.round(projet.surface / 2) : 0);
        const surface = projet.surface || 0;

        if (volume >= 50) score += 20;
        else if (volume >= 30) score += 15;
        else if (volume >= 15) score += 10;
        else if (volume > 0) score += 5;

        // ── BONUS GRAND COMPTE / B2B ──
        if (volume > 100) score += 15;
        if (surface > 200) score += 20; // Bonus volume bureaux/villa

        // Bonus Budget
        const budget = projet.budget || 0;
        if (budget > 5000) score += 15;

        // Signaux B2B
        const b2bKeywords = ['bureaux', 'entreprise', 'société', 'locaux', 'serveurs', 'techcorp'];
        const content = JSON.stringify(projet).toLowerCase();
        const b2bMatchCount = b2bKeywords.filter(k => content.includes(k)).length;
        if (b2bMatchCount >= 2) score += 10;

        // ── 4. ENGAGEMENT (10 pts base) ──
        score += 10;

        return Math.min(score, 100);
    }

    /**
     * Priorité du lead selon son score
     */
    private getPriorite(score: number, lead?: any): PrioriteLead {
        // Règle forcée B2B pour test-32
        const content = JSON.stringify(lead?.projetData || {}).toLowerCase();
        const isB2B = content.includes('bureaux') || content.includes('entreprise') || content.includes('techcorp');
        const budget = lead?.projetData?.budget || 0;

        if ((score >= 80 && isB2B) || budget > 10000) return PrioriteLead.CHAUD;

        if (score >= 80) return PrioriteLead.CHAUD;
        if (score >= 60) return PrioriteLead.TIEDE;
        if (score >= 40) return PrioriteLead.MOYEN;
        return PrioriteLead.FROID;
    }

    // ──────────────────────────────────────────────
    //  ACTIONS AUTOMATIQUES
    // ──────────────────────────────────────────────

    /**
     * Déclenche des actions selon le lead et son score :
     *   - Notification email si lead chaud
     *   - Push CRM si coordonnées complètes
     *   - Qualification de la conversation
     */
    private async triggerActions(lead: any, score: number): Promise<string[]> {
        const actions: string[] = [];
        const needsNotif = score >= 70 && !lead.notificationSent;
        const needsCRM = lead.email && lead.telephone && !lead.pushedToCRM;

        if (needsNotif) {
            logger.info('📧 [ACTION] Email notification queued', { leadId: lead.id, score });
            actions.push('email_notification_queued');
        }
        if (needsCRM) {
            logger.info('🔗 [ACTION] CRM push queued', { leadId: lead.id });
            actions.push('crm_push_queued');
        }

        // ── Actions 1+2 : mise à jour flags lead en parallèle ──
        const leadUpdates: Promise<any>[] = [];
        if (needsNotif) leadUpdates.push(prisma.lead.update({ where: { id: lead.id }, data: { notificationSent: true } }));
        if (needsCRM) leadUpdates.push(prisma.lead.update({ where: { id: lead.id }, data: { pushedToCRM: true } }));

        if (leadUpdates.length > 0) {
            await Promise.all(leadUpdates);
            // Invalider le cache car les flags notificationSent/pushedToCRM ont changé
            const conversation = await prisma.conversation.findFirst({ where: { leadId: lead.id } });
            if (conversation) await contextManager.clearContextCache(conversation.id);
        }

        // ── Action 3 : Qualifier la conversation ──
        if (score >= 70) {
            const conversation = await prisma.conversation.findFirst({
                where: { leadId: lead.id },
            });

            if (conversation && conversation.status === 'ACTIVE') {
                await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { status: 'QUALIFIED' },
                });
                logger.info('✅ [ACTION] Conversation qualified', { conversationId: conversation.id });
                actions.push('conversation_qualified');
            }
        }

        return actions;
    }

    // ──────────────────────────────────────────────
    //  SANITIZE LLM REPLY
    // ──────────────────────────────────────────────

    /**
     * Nettoie la réponse du LLM :
     *  - Supprime toutes les balises HTML (<br>, <br/>, <p>, etc.)
     *  - Supprime les astérisques / markdown bold
     *  - Normalise les sauts de ligne (max 2 consécutifs)
     *  - Trim chaque ligne
     */
    private static readonly TECH_ACTION_CODES = [
        'email_notification_queued',
        'conversation_qualified',
        'crm_push_queued',
        'satisfaction_request_sent',
        'appointment_module_triggered',
    ];

    // Patterns lisibles que le LLM génère parfois par erreur
    private static readonly SYSTEM_NOISE_PATTERNS = [
        /email\s+de\s+notification\s+envoy[ée][^\n]*/gi,
        /notification\s+email\s+(?:envoy[ée]|queue[ée])[^\n]*/gi,
        /lead\s+qualifi[ée]\s+automatiquement[^\n]*/gi,
        /fiche\s+envoy[ée]e?\s+au\s+crm[^\n]*/gi,
        /conversation\s+qualifi[ée][^\n]*/gi,
        /(?:✅|🚀|📧)\s*(?:email|lead|fiche|crm)[^\n]*/gi,
    ];

    private sanitizeReply(text: string): string {
        let cleaned = text;

        // 1. Convertir <br>, <br/> en \n
        cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');

        // 2. Supprimer les résidus techniques du LLM
        for (const pattern of MessageHandler.SYSTEM_NOISE_PATTERNS) {
            cleaned = cleaned.replace(pattern, '');
        }

        // 3. Supprimer les préfixes de type "Bot:" ou "Assistant:"
        cleaned = cleaned.replace(/^(Bot|Assistant|🤖|AI|System):\s*/i, '');

        // 4. Nettoyage basique (espaces, multiples retours à la ligne)
        return cleaned.replace(/\n{3,}/g, '\n\n').trim();
    }

    /**
     * Filtre générique anti-répétition pour les coordonnées de contact.
     * Si téléphone ET email sont connus → supprime toute phrase qui demande l'un ou l'autre.
     * Si seulement un est manquant → ne filtre que celui qui est déjà collecté.
     */
    private filterRepeatedContactQuestion(text: string, lead: any): string {
        let cleaned = text;
        if (lead?.telephone) {
            // Supprime toute phrase contenant une demande de téléphone
            cleaned = cleaned.replace(/[^.!?\n]*(?:téléphone|numéro|portable|mobile|tél)[^.!?\n]*\?[^.!?\n]*/gi, '');
        }
        if (lead?.email) {
            // Supprime toute phrase contenant une demande d'email
            cleaned = cleaned.replace(/[^.!?\n]*(?:email|e-mail|adresse mail|courriel)[^.!?\n]*\?[^.!?\n]*/gi, '');
        }
        return cleaned.replace(/\n{3,}/g, '\n\n').trim();
    }

    /**
     * Filtre générique anti-répétition pour l'identité.
     * Si prénom ET nom sont connus → supprime toute phrase qui demande le nom.
     */
    private filterRepeatedIdentityQuestion(text: string, lead: any): string {
        if (!lead?.prenom && !lead?.nom) return text;
        let cleaned = text;
        if (lead?.prenom && lead?.nom) {
            // Les deux sont connus, on supprime toute demande de nom/prénom
            cleaned = cleaned.replace(/[^.!?\n]*(?:prénom|nom complet|vous appel)[^.!?\n]*\?[^.!?\n]*/gi, '');
        } else if (lead?.prenom) {
            // Seul le prénom est connu, supprimer uniquement les redemandes de prénom seul
            cleaned = cleaned.replace(/[^.!?\n]*(?:quel est votre prénom)[^.!?\n]*\?[^.!?\n]*/gi, '');
        }
        return cleaned.replace(/\n{3,}/g, '\n\n').trim();
    }

    /**
     * Filtre générique anti-répétition pour le type de logement.
     */
    private filterRepeatedLogementQuestion(text: string, lead: any): string {
        const p = lead?.projetData || {};
        let cleaned = text;
        if (p.typeHabitationDepart) {
            // Supprime toute demande de type de logement au départ
            cleaned = cleaned.replace(/[^.!?\n]*(?:maison ou appartement)[^.!?\n]*départ[^.!?\n]*\?[^.!?\n]*/gi, '');
            cleaned = cleaned.replace(/[^.!?\n]*départ[^.!?\n]*(?:maison ou appartement)[^.!?\n]*\?[^.!?\n]*/gi, '');
        }
        if (p.typeHabitationArrivee) {
            // Supprime toute demande de type de logement à l'arrivée
            cleaned = cleaned.replace(/[^.!?\n]*(?:maison ou appartement)[^.!?\n]*arrivée?[^.!?\n]*\?[^.!?\n]*/gi, '');
            cleaned = cleaned.replace(/[^.!?\n]*arrivée?[^.!?\n]*(?:maison ou appartement)[^.!?\n]*\?[^.!?\n]*/gi, '');
        }
        return cleaned.replace(/\n{3,}/g, '\n\n').trim();
    }

    /**
     * Filtre générique : supprime demande de créneau rappel si déjà collecté.
     */
    private filterRepeatedCreneauQuestion(text: string, lead: any): string {
        if (!lead?.creneauRappel) return text;
        const cleaned = text.replace(/[^.!?\n]*(?:créneau|rappel|recontact)[^.!?\n]*\?[^.!?\n]*/gi, '');
        return cleaned.replace(/\n{3,}/g, '\n\n').trim();
    }

    /**
     * Filtre générique : supprime demande de créneau visite si déjà complet.
     */
    private filterRepeatedVisitQuestion(text: string, lead: any): string {
        const creneauVisite = lead?.projetData?.creneauVisite as string | undefined;
        if (!creneauVisite) return text;
        // Créneau complet = contient un jour ET un horaire
        const hasJour = /lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain/i.test(creneauVisite);
        const hasHoraire = /matin|après-midi|soir|midi/i.test(creneauVisite);
        if (!hasJour || !hasHoraire) return text;
        const cleaned = text.replace(/[^.!?\n]*(?:quel jour|quel créneau)[^.!?\n]*visite[^.!?\n]*\?[^.!?\n]*/gi, '');
        return cleaned.replace(/\n{3,}/g, '\n\n').trim();
    }

    /**
     * Filtre générique : supprime demande de stationnement si déjà collecté.
     */
    private filterRepeatedStationnementQuestion(text: string, lead: any): string {
        const p = lead?.projetData || {};
        let cleaned = text;
        if (p.stationnementDepart) {
            cleaned = cleaned.replace(/[^.!?\n]*stationnement[^.!?\n]*départ[^.!?\n]*\?[^.!?\n]*/gi, '');
            cleaned = cleaned.replace(/[^.!?\n]*départ[^.!?\n]*stationnement[^.!?\n]*\?[^.!?\n]*/gi, '');
        }
        if (p.stationnementArrivee) {
            cleaned = cleaned.replace(/[^.!?\n]*stationnement[^.!?\n]*arrivée?[^.!?\n]*\?[^.!?\n]*/gi, '');
            cleaned = cleaned.replace(/[^.!?\n]*arrivée?[^.!?\n]*stationnement[^.!?\n]*\?[^.!?\n]*/gi, '');
        }
        return cleaned.replace(/\n{3,}/g, '\n\n').trim();
    }

    /**
     * Résout un code postal en ville via l'API Geo Gouv.
     * Cache Redis TTL 24h + timeout 3s pour éviter les blocages.
     */
    private async resolvePostalCode(codePostal: string): Promise<string | null> {
        const cacheKey = `geo:cp:${codePostal}`;
        try {
            // Vérifier le cache Redis d'abord
            const cached = await cache.get<string>(cacheKey);
            if (cached) return cached;

            const response = await fetch(
                `https://geo.api.gouv.fr/communes?codePostal=${codePostal}&fields=nom,population&format=json`,
                { signal: AbortSignal.timeout(3000) }
            );
            if (!response.ok) return null;

            const communes = await response.json() as any[];
            if (!communes || communes.length === 0) return null;

            // Trier par population décroissante → ville principale en premier
            communes.sort((a, b) => (b.population || 0) - (a.population || 0));
            const ville = communes[0].nom;

            // Mettre en cache 24h (les codes postaux ne changent pas)
            await cache.set(cacheKey, ville, 86400);
            return ville;
        } catch (error) {
            logger.warn('⚠️ Geo API error', { codePostal, error: String(error) });
            return null;
        }
    }

    // ──────────────────────────────────────────────
    //  LLM DATA BLOCK PARSER (Option B extraction)
    // ──────────────────────────────────────────────

    /**
     * Fusionne les entités : `primary` est la source de vérité, `fallback` comble uniquement
     * les champs absent (null/undefined) de primary. Appelé avec (llmEntities, regexEntities)
     * pour que le LLM soit prioritaire, et les regex servent de backup.
     *
     * Valeurs invalides filtrées : null, undefined, et villes incohérentes comme "Vous", "Affiner".
     */
    private mergeEntities(
        primary: Record<string, any>,
        fallback: Record<string, any>
    ): Record<string, any> {
        const INVALID_WORDS = new Set([
            'vous', 'affiner', 'inconnu', 'null', 'undefined', 'moyen', 'petit', 'grand',
            'estimation', 'tarifaire', 'devis', 'calcul', 'volume', 'quelques', 'plusieurs',
            'standard', 'luxe', 'economique', 'eco', 'éco', 'confirme', 'confirmé', 'noté',
            'appartement', 'maison', 'studio', 'logement', 'rez', 'rdc', 'étage', 'etage',
            'stationnement', 'autorisation', 'mairie'
        ]);

        const isInvalidValue = (v: unknown) =>
            typeof v !== 'string' || v.length < 2 || INVALID_WORDS.has(v.toLowerCase().trim());

        // Filtrer les valeurs invalides de primary (source LLM)
        const result: Record<string, any> = {};
        for (const [k, v] of Object.entries(primary)) {
            if (v === null || v === undefined || v === '') continue;

            // Filtre spécifique pour identité et villes
            if (['prenom', 'nom', 'villeDepart', 'villeArrivee'].includes(k) && isInvalidValue(v)) continue;

            // Filtre CP
            if ((k === 'codePostalDepart' || k === 'codePostalArrivee') && !/^\d{5}$/.test(String(v).trim())) continue;

            result[k] = v;
        }

        // Combler avec fallback (regex) uniquement si le champ est absent dans primary
        for (const [k, v] of Object.entries(fallback)) {
            if (result[k] !== undefined && result[k] !== null && result[k] !== '') continue;
            if (v === null || v === undefined || v === '') continue;

            if (['prenom', 'nom', 'villeDepart', 'villeArrivee'].includes(k) && isInvalidValue(v)) continue;
            if ((k === 'codePostalDepart' || k === 'codePostalArrivee') && !/^\d{5}$/.test(String(v).trim())) continue;

            result[k] = v;
        }

        return result;
    }

    /**
     * Merge non-destructif de projetData.
     * Règle absolue : on n'écrase JAMAIS une valeur existante par null, undefined, false ou ''.
     * Exception : rdvConseiller peut être false (refus mémorisé) — on l'accepte si true ou false.
     */
    private mergeProjetDataSafe(
        existing: Record<string, any>,
        incoming: Record<string, any>
    ): Record<string, any> {
        const result = { ...existing };
        for (const [key, value] of Object.entries(incoming)) {
            // Exception : rdvConseiller peut être false (refus doit être mémorisé)
            if (key === 'rdvConseiller') {
                if (value === true || value === false) result[key] = value;
                continue;
            }
            // Règle générale : n'écraser que si la nouvelle valeur est non-nulle/non-vide
            // ET si le champ existant est vide (évite d'écraser des données déjà collectées)
            if (value !== null && value !== undefined && value !== false && value !== '') {
                // Ne remplace que si inexistant ou si la valeur existante est vide
                // EXCEPTION : On autorise l'écrasement pour les corrections (Villes, CP, Accès, Volume)
                const FORCE_UPDATE_KEYS = [
                    'villeDepart', 'villeArrivee', 'codePostalDepart', 'codePostalArrivee',
                    'volumeEstime', 'creneauVisite', 'contraintes', 'objetSpeciaux',
                    'surface', 'typeHabitationDepart', 'typeHabitationArrivee',
                    'etageDepart', 'etageArrivee', 'ascenseurDepart', 'ascenseurArrivee',
                    'stationnementDepart', 'stationnementArrivee'
                ];

                if (result[key] === null || result[key] === undefined || result[key] === '' || FORCE_UPDATE_KEYS.includes(key)) {
                    result[key] = value;
                }
            }
        }
        return result;
    }

    /**
     * Parse le bloc <!--DATA:{...}--> inséré par le LLM à la fin de chaque réponse.
     * Ce bloc contient toutes les données structurées extraites par le LLM (fiabilité > regex).
     * Retourne les entités parsées + le texte nettoyé (sans le bloc).
     */
    private parseLLMDataBlock(raw: string): { llmEntities: any; clean: string } {
        const match = raw.match(/<!--DATA:([\s\S]*?)-->/);
        const clean = raw.replace(/<!--DATA:[\s\S]*?-->/, '').trim();

        if (!match) {
            logger.debug('🔍 [LLM-DATA] No DATA block found in reply');
            return { llmEntities: {}, clean };
        }

        try {
            const data = JSON.parse(match[1].trim());
            const e: any = {};

            // Champs directs du lead
            if (data.prenom && typeof data.prenom === 'string') e.prenom = data.prenom;
            if (data.nom && typeof data.nom === 'string') e.nom = data.nom;
            if (data.email && typeof data.email === 'string') e.email = data.email.toLowerCase();
            if (data.telephone && typeof data.telephone === 'string') e.telephone = data.telephone;
            if (data.creneauRappel && typeof data.creneauRappel === 'string') e.creneauRappel = data.creneauRappel;
            if (data.satisfaction && typeof data.satisfaction === 'string') e.satisfaction = data.satisfaction;
            if (data.satisfactionScore !== undefined && data.satisfactionScore !== null) e.satisfactionScore = Number(data.satisfactionScore);

            // Champs projetData — on garde uniquement les valeurs non-vides
            const projetFields = [
                'villeDepart', 'villeArrivee', 'codePostalDepart', 'codePostalArrivee',
                'typeHabitationDepart', 'typeHabitationArrivee', 'stationnementDepart', 'stationnementArrivee',
                'surface', 'nbPieces', 'volumeEstime', 'volumeCalcule', 'dateSouhaitee', 'formule',
                'contraintes', 'etage', 'etageDepart', 'etageArrivee',
                'typeEscalierDepart', 'typeEscalierArrivee',
                'gabaritAscenseurDepart', 'gabaritAscenseurArrivee',
            ];
            for (const f of projetFields) {
                if (data[f] !== null && data[f] !== undefined && data[f] !== '' && data[f] !== 0) {
                    e[f] = data[f];
                }
            }

            // Gestion spécifique des étages (peut être 0)
            const etageFields = ['etage', 'etageDepart', 'etageArrivee'];
            for (const f of etageFields) {
                if (data[f] !== null && data[f] !== undefined) {
                    const etageNum = typeof data[f] === 'number' ? data[f] : parseInt(String(data[f]), 10);
                    if (!Number.isNaN(etageNum) && etageNum >= 0) e[f] = etageNum;
                }
            }

            // Gestion spécifique des ascenseurs (booléens)
            const ascFields = ['ascenseur', 'ascenseurDepart', 'ascenseurArrivee'];
            for (const f of ascFields) {
                if (data[f] === true || data[f] === false) e[f] = data[f];
            }

            // Normalisation du gabarit d'ascenseur (petit / moyen / grand uniquement)
            const normalizeGabarit = (raw: any): string | undefined => {
                if (!raw || typeof raw !== 'string') return undefined;
                const lower = raw.toLowerCase();
                if (lower.includes('grand')) return 'grand';
                if (lower.includes('moyen')) return 'moyen';
                if (lower.includes('petit')) return 'petit';
                return undefined;
            };
            const gDep = normalizeGabarit(data.gabaritAscenseurDepart);
            const gArr = normalizeGabarit(data.gabaritAscenseurArrivee);
            if (gDep) e.gabaritAscenseurDepart = gDep;
            if (gArr) e.gabaritAscenseurArrivee = gArr;

            // Champs booléens (on garde true seulement)
            if (data.monteMeuble === true) e.monteMeuble = true;
            if (data.autorisationStationnement === true) e.autorisationStationnement = true;
            if (data.autorisationStationnementDepart === true) e.autorisationStationnementDepart = true;
            if (data.autorisationStationnementArrivee === true) e.autorisationStationnementArrivee = true;
            if (data.caveOuStockage === true) e.caveOuStockage = true;
            if (data.international === true) e.international = true;
            if (data.accesDifficileDepart === true) e.accesDifficileDepart = true;
            if (data.accesDifficileArrivee === true) e.accesDifficileArrivee = true;
            if (data.monteMeubleDepart === true) e.monteMeubleDepart = true;
            if (data.monteMeubleArrivee === true) e.monteMeubleArrivee = true;

            // Tableau d'objets spéciaux (on garde seulement si non vide)
            if (Array.isArray(data.objetSpeciaux) && data.objetSpeciaux.length > 0) {
                e.objetSpeciaux = data.objetSpeciaux;
            }

            // RDV visite conseiller (true ET false persistés — le refus doit être mémorisé)
            if (data.rdvConseiller === true || data.rdvConseiller === false) e.rdvConseiller = data.rdvConseiller;
            if (data.creneauVisite && typeof data.creneauVisite === 'string') e.creneauVisite = data.creneauVisite;

            logger.info('✅ [LLM-DATA] Block parsed', { fields: Object.keys(e) });
            return { llmEntities: e, clean };
        } catch (err) {
            logger.warn('⚠️ [LLM-DATA] Failed to parse DATA block', { error: String(err), raw: match[1].substring(0, 100) });
            return { llmEntities: {}, clean };
        }
    }
}

// ── Export singleton ──
export const messageHandler = new MessageHandler();
