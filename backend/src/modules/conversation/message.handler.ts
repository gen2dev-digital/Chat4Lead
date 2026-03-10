import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { logger } from '../../utils/logger';
import { contextManager } from './context.manager';
import { llmService } from '../llm/llm.service';
import { buildPromptDemenagement, buildNextStep } from '../prompt/templates/demenagement';
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

            // ── 1. Sauvegarder le message utilisateur ──
            await contextManager.saveMessage(conversationId, RoleMessage.user, message);

            // ── 2. Récupérer le contexte ──
            const context = await this.getFullContext(conversationId, entrepriseId);

            // ── 3. Construire le prompt avec pré-extraction (Bug #Incohérence Prix) ──
            const currentLead = context.lead;
            const lastBotMsgPre = [...context.messages].reverse().find((m: any) => m.role === 'assistant' || m.role === 'bot')?.content || '';
            const preExtracted = await this.extractEntities(message, '', currentLead, lastBotMsgPre);

            const promptLeadData = {
                prenom: preExtracted.prenom || currentLead?.prenom,
                nom: preExtracted.nom || currentLead?.nom,
                email: preExtracted.email || currentLead?.email,
                telephone: preExtracted.telephone || currentLead?.telephone,
                creneauRappel: preExtracted.creneauRappel || currentLead?.creneauRappel,
                projetData: { ...(currentLead?.projetData as any || {}), ...preExtracted },
            } as any;

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
                promptLeadData
            );

            // ── 4. Préparer les messages (contexte étendu) ──
            const recentMessages = context.messages.slice(-30);
            const llmMessages = [...recentMessages];

            // ── 5. Appeler le LLM ──
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

            // ── 6. Extraire le bloc DATA JSON du LLM ──
            const { llmEntities, clean: cleanedContent } = this.parseLLMDataBlock(llmContent);
            llmContent = cleanedContent;

            // ── 7. Nettoyage du texte LLM ──
            llmContent = this.sanitizeReply(llmContent);

            // ── 8. Fallback si la réponse est vide ──
            if (!llmContent || llmContent.trim().length < 2) {
                logger.warn('⚠️ [MessageHandler] LLM reply was empty after sanitization, generating fallback', { conversationId });
                const nextStep = buildNextStep((currentLead || {}) as any, (currentLead?.projetData || {}) as any, !!(currentLead?.nom && (currentLead?.telephone || currentLead?.email)));
                if (nextStep.includes('RÉCAPITULATIF')) {
                    llmContent = "C'est parfait ! Je prépare maintenant le récapitulatif de votre dossier. Quel moment vous convient le mieux pour être recontacté par notre équipe : le matin, l'après-midi ou le soir ?";
                } else if (nextStep.includes('CONVERSATION TERMINÉE')) {
                    llmContent = "Merci beaucoup ! Votre dossier est maintenant complet et a été transmis à notre équipe. Nous vous souhaitons une excellente journée !";
                } else {
                    llmContent = "C'est bien noté ! Pour continuer votre projet, pouvez-vous me préciser la suite ?";
                }
            }

            // ── 9. Filtres anti-répétition ──
            llmContent = this.filterRepeatedCreneauQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedVisitQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedStationnementQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedContactQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedIdentityQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedLogementQuestion(llmContent, currentLead);

            // ── 10. Extraction regex + merge avec LLM ──
            const lastBotMsg = [...recentMessages].reverse().find((m: any) => m.role === 'assistant' || m.role === 'bot')?.content || '';
            const regexEntities = await this.extractEntities(message, llmContent, currentLead, lastBotMsg);
            const finalEntities = { ...preExtracted, ...llmEntities, ...regexEntities };

            // ── 10b. Extraction du créneau de rappel (matin/après-midi/soir/indifférent) ──
            if (!currentLead?.creneauRappel) {
                const creneauMatch = /\b(matin|apr[eè]s[- ]?midi|soir|indiff[eé]rent)\b/i.exec(message.toLowerCase());
                // Vérifier que le bot vient de demander le créneau
                const botAskedCreneau = /cr[eé]neau|recontact[eé]|rappel[eé]|matin.*soir/i.test(lastBotMsg);
                if (creneauMatch && botAskedCreneau) {
                    finalEntities.creneauRappel = creneauMatch[1].charAt(0).toUpperCase() + creneauMatch[1].slice(1);
                }
            }

            // ── 11. Mise à jour lead + score ──
            const newScore = this.calculateScore({ ...currentLead, projetData: { ...(currentLead?.projetData as any), ...finalEntities } });
            let updatedLead = currentLead;
            if (currentLead && Object.keys(finalEntities).length > 0) {
                updatedLead = await this.updateLead(currentLead.id, finalEntities, currentLead, newScore);
                logger.info('✅ [MessageHandler] Lead updated', { leadId: currentLead.id, extracted: Object.keys(finalEntities) });
            } else if (currentLead) {
                updatedLead = await prisma.lead.update({
                    where: { id: currentLead.id },
                    data: { score: newScore, priorite: this.getPriorite(newScore, currentLead) },
                });
            }

            // ── 11b. Re-check fallback APRES extraction (le lead est maintenant à jour) ──
            const fallbackPatterns = [
                "C'est bien noté ! Pour continuer",
                "pouvez-vous me préciser la suite",
                "n'hésitez pas à me donner plus de détails",
                "je reste à votre écoute"
            ];
            const isTooGeneric = fallbackPatterns.some(p => llmContent.includes(p)) || llmContent.trim().length < 5;

            if (isTooGeneric) {
                const updatedProjet = (updatedLead?.projetData as any) || {};
                const nextStepAfterUpdate = buildNextStep(
                    { ...(updatedLead || {}), projetData: updatedProjet } as any,
                    updatedProjet,
                    !!(updatedLead?.nom && (updatedLead?.telephone || updatedLead?.email))
                );

                if (nextStepAfterUpdate.includes('CONVERSATION TERMINÉE')) {
                    const entrepriseNom = context.entreprise.nom;
                    const entrepriseEmail = context.entreprise.email || '';
                    const entrepriseTel = context.entreprise.telephone || '';
                    llmContent = `Merci pour cette information. ${entrepriseNom} vous remercie. Vous allez être recontacté rapidement.${entrepriseEmail ? ' Si vous avez la moindre question, n\'hésitez pas à nous contacter par mail à ' + entrepriseEmail : ''}${entrepriseTel ? ' ou par téléphone au ' + entrepriseTel : ''}. Vos données personnelles restent strictement confidentielles. À bientôt ! 🚀`;
                } else if (nextStepAfterUpdate.includes('RÉCAPITULATIF')) {
                    llmContent = "C'est parfait ! Je prépare maintenant le récapitulatif de votre dossier. Quel moment vous convient le mieux pour être recontacté par notre équipe : le matin, l'après-midi ou le soir ?";
                }
            }

            // ── 12. Sauvegarder la réponse ──
            await contextManager.saveMessage(
                conversationId,
                RoleMessage.assistant,
                llmContent,
                llmMetadata
            );

            // ── 13. Actions et résultat ──
            const allActions = updatedLead ? await this.triggerActions(updatedLead, newScore) : [];
            // Séparer actions UI (pour le frontend) des actions internes (backend only)
            const uiActions = allActions.filter(a => a.startsWith('show_') || a.startsWith('suggest_') || a.startsWith('appointment_'));
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
                actions: uiActions,
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
     */
    async handleUserMessageStream(
        input: MessageHandlerInput & { onChunk: (chunk: string) => void }
    ): Promise<MessageHandlerOutput> {
        const startTime = Date.now();
        const { conversationId, entrepriseId, message, onChunk } = input;

        try {
            await contextManager.saveMessage(conversationId, RoleMessage.user, message);
            const context = await this.getFullContext(conversationId, entrepriseId);
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
                    projetData: (currentLead?.projetData || {}) as any,
                }
            );

            const recentMessages = context.messages.slice(-30);
            const llmMessages = [...recentMessages];

            let llmContent = '';
            let llmMetadata = { tokensUsed: 0, latencyMs: 0 };

            try {
                const llmResponse = await llmService.streamResponse!(systemPrompt, llmMessages, onChunk);
                llmContent = llmResponse.content;
                llmMetadata = { tokensUsed: llmResponse.tokensUsed || 0, latencyMs: llmResponse.latencyMs || 0 };
            } catch (llmError) {
                logger.error('⚠️ [LLM-Stream] Failure', { error: String(llmError), conversationId });
                onChunk("Désolé, j'ai rencontré un petit problème technique.");
                llmContent = "Désolé, j'ai rencontré un petit problème technique.";
            }

            const { llmEntities, clean: cleanedContent } = this.parseLLMDataBlock(llmContent);
            llmContent = this.sanitizeReply(cleanedContent);

            if (!llmContent || llmContent.trim().length < 2) {
                const fn = "C'est bien noté ! Pour continuer, pouvez-vous me préciser la suite ?";
                onChunk(fn);
                llmContent = fn;
            }

            llmContent = this.filterRepeatedCreneauQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedVisitQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedStationnementQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedContactQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedIdentityQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedLogementQuestion(llmContent, currentLead);

            const lastBotMsg = [...recentMessages].reverse().find((m: any) => m.role === 'assistant' || m.role === 'bot')?.content || '';
            const regexEntities = await this.extractEntities(message, llmContent, currentLead, lastBotMsg);
            const finalEntities = this.mergeEntities(llmEntities, regexEntities);

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

            await contextManager.saveMessage(conversationId, RoleMessage.assistant, llmContent, llmMetadata);
            const actions = updatedLead ? await this.triggerActions(updatedLead, newScore) : [];

            return {
                reply: llmContent,
                leadData: updatedLead,
                score: newScore,
                actions,
                metadata: { ...llmMetadata, entitiesExtracted: finalEntities },
            };
        } catch (error) {
            logger.error('💥 [MessageHandler-Stream] CRITICAL ERROR', { conversationId, error: String(error) });
            onChunk("Désolé, j'ai rencontré un problème technique.");
            return {
                reply: "Désolé, j'ai rencontré un problème technique.",
                actions: [],
                metadata: { error: true },
            };
        }
    }

    private async getFullContext(conversationId: string, entrepriseId: string) {
        const metier = Metier.DEMENAGEMENT;
        const [context, { entreprise, config }] = await Promise.all([
            contextManager.getContext(conversationId),
            contextManager.getEntrepriseConfig(entrepriseId, metier),
        ]);

        if (!entreprise) throw new Error(`Entreprise ${entrepriseId} non trouvée`);
        if (!config) throw new Error(`Config métier ${metier} non trouvée`);

        return { ...context, lead: context.leadData, entreprise, config };
    }

    // ──────────────────────────────────────────────
    //  EXTRACTION ENTITÉS — Robuste et contextuelle
    // ──────────────────────────────────────────────

    private async extractEntities(
        message: string,
        llmContent: string,
        currentLead: any,
        lastBotMessage?: string
    ): Promise<any> {
        const entities: any = {};
        const existingProjetData = (currentLead?.projetData as any) || {};
        const combined = (message + ' ' + (llmContent || '')).replace(/\((\d{5})\)/g, ' $1 ');
        const lowerCombined = combined.toLowerCase();
        const lowerMsg = message.toLowerCase().trim();
        const lowerBot = ((lastBotMessage || '') + ' ' + (llmContent || '')).toLowerCase();

        // ── Contexte : le bot parlait de l'arrivée ou du départ ? ──
        const isArriveeContext = lowerBot.includes('arrivée') || lowerBot.includes('arrivee')
            || lowerBot.includes('nouveau logement') || lowerBot.includes('nouvelle adresse')
            || lowerBot.includes('destination') || lowerBot.includes('logement d\'arrivée')
            || lowerBot.includes('adresse d\'arrivée');

        // ── Contexte : le bot venait de demander l'ascenseur ? ──
        const botAskedAscenseur = /ascenseur/i.test(lowerBot);

        // ── Contexte : le bot venait de demander le stationnement ? ──
        const botAskedStationnement = /stationnement|parking|accès camion|stationner/i.test(lowerBot);

        // ── Contexte : le bot venait de demander l'identité ? ──
        const botAskedIdentity = /prénom|nom complet|comment vous appelez|identité/i.test(lowerBot);

        // ── Contexte : le bot venait de demander l'étage ? ──
        const botAskedEtage = /étage|rez-de-chaussée|rdc/i.test(lowerBot);

        // ─────────────────────────────────────────────────
        // ① "PAREIL" / "MÊME CHOSE" — Copie départ → arrivée
        // ─────────────────────────────────────────────────
        const isPareillArrivee = /\b(pareil|même chose|identique|idem|pareil qu[''e]au départ|comme au départ|même config)\b/i.test(lowerMsg);
        if (isPareillArrivee) {
            if (!existingProjetData.typeHabitationArrivee && existingProjetData.typeHabitationDepart)
                entities.typeHabitationArrivee = existingProjetData.typeHabitationDepart;
            if (existingProjetData.etageArrivee === undefined && existingProjetData.etageDepart !== undefined)
                entities.etageArrivee = existingProjetData.etageDepart;
            if (existingProjetData.ascenseurArrivee === undefined && existingProjetData.ascenseurDepart !== undefined)
                entities.ascenseurArrivee = existingProjetData.ascenseurDepart;
            if (!existingProjetData.stationnementArrivee && existingProjetData.stationnementDepart)
                entities.stationnementArrivee = existingProjetData.stationnementDepart;
            if (!existingProjetData.typeEscalierArrivee && existingProjetData.typeEscalierDepart)
                entities.typeEscalierArrivee = existingProjetData.typeEscalierDepart;
        }

        // ─────────────────────────────────────────────────
        // ② EMAIL
        // ─────────────────────────────────────────────────
        const emails = combined.match(/[a-zA-Z0-9._%+\-àâäéèêëîïôùûüç]+@[a-zA-Z0-9.\-àâäéèêëîïôùûüç]+\.[a-zA-Z]{2,}/gi);
        if (emails) entities.email = emails[0].toLowerCase().trim();

        // ─────────────────────────────────────────────────
        // ③ TÉLÉPHONE
        // ─────────────────────────────────────────────────
        const phones = combined.match(/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g);
        if (phones) {
            let raw = phones[0].replace(/[\s.-]/g, '');
            if (raw.startsWith('+33')) raw = '0' + raw.slice(3);
            else if (raw.startsWith('0033')) raw = '0' + raw.slice(4);
            entities.telephone = raw;
        }

        // ─────────────────────────────────────────────────
        // ④ SURFACE & VOLUME
        // ─────────────────────────────────────────────────
        const surfaceMatch = /(\d+)\s*(?:m²|m2|mètres?\s*carrés?|m\s*carré)/gi.exec(combined);
        if (surfaceMatch) {
            const surface = parseInt(surfaceMatch[1], 10);
            entities.surface = surface;
            if (!entities.volumeEstime && !existingProjetData.volumeEstime) {
                entities.volumeEstime = Math.round(surface / 2);
            }
        }

        const volumeMatch = /(\d+(?:[.,]\d+)?)\s*(?:m³|m3|mètres?\s*cubes?)/gi.exec(combined);
        if (volumeMatch) entities.volumeEstime = parseFloat(volumeMatch[1].replace(',', '.'));

        // ─────────────────────────────────────────────────
        // ⑤ TYPE D'HABITATION (avec T1/T2/T3/F3 etc.)
        // ─────────────────────────────────────────────────
        const habitationPatterns = [
            { pattern: /\b(appartement|appart(?:ement)?|appt|[ft][1-9]|studio|loft|duplex)\b/i, val: 'Appartement' },
            { pattern: /\b(maison|pavillon|villa|mas|corps de ferme)\b/i, val: 'Maison' },
        ];
        for (const ptn of habitationPatterns) {
            if (ptn.pattern.test(lowerMsg) || ptn.pattern.test(lowerCombined)) {
                if (isArriveeContext && !existingProjetData.typeHabitationArrivee) {
                    entities.typeHabitationArrivee = ptn.val;
                } else if (!isArriveeContext && !existingProjetData.typeHabitationDepart) {
                    entities.typeHabitationDepart = ptn.val;
                }
                break;
            }
        }

        // ── Nombre de pièces (T3, F4, 3 pièces) ──
        const piecesMatch = /\b([ft](\d)|(\d)\s*pièces?)\b/i.exec(lowerMsg);
        if (piecesMatch) {
            const nbPieces = parseInt(piecesMatch[2] || piecesMatch[3], 10);
            if (isArriveeContext) entities.nbPiecesArrivee = nbPieces;
            else entities.nbPiecesDepart = nbPieces;
        }

        // ─────────────────────────────────────────────────
        // ⑥ ÉTAGE — Extraction robuste multi-patterns
        // ─────────────────────────────────────────────────
        const etagePatterns = [
            /(?:au|le|du|en)?\s*(\d{1,2})\s*(?:e|è|ème|eme|er)\s*(?:étage|etage)/i,
            /(?:étage|etage)\s*[:\-]?\s*(\d{1,2})/i,
            /\b(\d{1,2})\s*(?:e|è|ème|eme|er)\b(?!\s*\d)/i,
            /\b(rdc|rez[- ]de[- ]chauss[ée]e|plain[- ]pied|rez de chauss[ée]e)\b/i,
            /\br\+(\d{1,2})\b/i, // Bug Fix: R+1, R+2 pattern
        ];

        let etageVal: number | null = null;
        for (const pat of etagePatterns) {
            const m = pat.exec(combined);
            if (m) {
                if (/rdc|rez|plain/i.test(m[0])) {
                    etageVal = 0;
                } else if (/r\+(\d+)/i.test(m[0])) {
                    etageVal = parseInt(m[0].match(/r\+(\d+)/i)![1], 10);
                } else {
                    etageVal = parseInt(m[1], 10);
                }
                break;
            }
        }

        // FIX BUG #3 — Assigner étage même si l'autre côté est inconnu
        if (etageVal !== null) {
            if (isArriveeContext) {
                if (existingProjetData.etageArrivee === undefined && entities.etageArrivee === undefined)
                    entities.etageArrivee = etageVal;
                // RDC → pas besoin d'ascenseur
                if (etageVal === 0 && existingProjetData.ascenseurArrivee === undefined)
                    entities.ascenseurArrivee = false;
            } else {
                if (existingProjetData.etageDepart === undefined && entities.etageDepart === undefined)
                    entities.etageDepart = etageVal;
                // RDC → pas besoin d'ascenseur
                if (etageVal === 0 && existingProjetData.ascenseurDepart === undefined)
                    entities.ascenseurDepart = false;
            }
        }

        // ── Réponse simple "au 2ème" sans le mot étage ──
        if (etageVal === null && botAskedEtage) {
            const simpleEtage = /^\s*(\d{1,2})\s*(?:e|è|ème|eme|er)?\s*$/i.exec(lowerMsg.trim());
            if (simpleEtage) {
                const val = parseInt(simpleEtage[1], 10);
                if (isArriveeContext && existingProjetData.etageArrivee === undefined) {
                    entities.etageArrivee = val;
                    if (val === 0) entities.ascenseurArrivee = false;
                } else if (!isArriveeContext && existingProjetData.etageDepart === undefined) {
                    entities.etageDepart = val;
                    if (val === 0) entities.ascenseurDepart = false;
                }
            }
        }

        // ─────────────────────────────────────────────────
        // ⑦ ASCENSEUR — FIX BUG #2 : OUI/NON contextuel
        // ─────────────────────────────────────────────────
        const hasAscenseurExplicite = /\b(avec\s+ascenseur|ascenseur\s*(?:oui|ok|disponible|dispo|présent|existe)|il y a un ascenseur|y a un ascenseur|y[''a]\s+un\s+ascenseur)\b/i.test(lowerMsg);
        const noAscenseurExplicite = /\b(sans\s+ascenseur|pas\s+d[''e]\s*ascenseur|pas\s+d['']ascenseur|pas\s+ascenseur|aucun\s+ascenseur|sans\s+élévateur)\b/i.test(lowerMsg);

        // Réponse simple oui/non QUAND le bot venait de demander l'ascenseur
        const simpleOui = botAskedAscenseur && /^\s*(oui|yes|ouais|bien sûr|évidemment|si|affirmatif|exact|tout à fait)\s*[.!]?\s*$/i.test(lowerMsg);
        const simpleNon = botAskedAscenseur && /^\s*(non|no|nope|pas|aucun|négatif|nan)\s*[.!]?\s*$/i.test(lowerMsg);

        if (hasAscenseurExplicite || noAscenseurExplicite || simpleOui || simpleNon) {
            const val = hasAscenseurExplicite || simpleOui;
            if (isArriveeContext) {
                if (existingProjetData.ascenseurArrivee === undefined && entities.ascenseurArrivee === undefined)
                    entities.ascenseurArrivee = val;
            } else {
                if (existingProjetData.ascenseurDepart === undefined && entities.ascenseurDepart === undefined)
                    entities.ascenseurDepart = val;
            }
        }

        // ─────────────────────────────────────────────────
        // ⑧ TYPE D'ESCALIER
        // ─────────────────────────────────────────────────
        const escalierPatterns = [
            { pattern: /\b(colima[çc]on|h[ée]lico[ïi]dal|spiral)\b/i, val: 'Colimaçon' },
            { pattern: /\b([ée]troit|serr[ée]|difficile|petit)\s*escalier\b/i, val: 'Étroit' },
            { pattern: /\bescalier\s*([ée]troit|serr[ée]|difficile|petit)\b/i, val: 'Étroit' },
            { pattern: /\b(large|spacieux|standard|normal)\s*escalier\b/i, val: 'Standard' },
            { pattern: /\bescalier\s*(large|spacieux|standard|normal)\b/i, val: 'Standard' },
            { pattern: /\bescalier\b/i, val: 'Standard' },
        ];
        for (const ptn of escalierPatterns) {
            if (ptn.pattern.test(combined)) {
                if (isArriveeContext && !existingProjetData.typeEscalierArrivee) entities.typeEscalierArrivee = ptn.val;
                else if (!isArriveeContext && !existingProjetData.typeEscalierDepart) entities.typeEscalierDepart = ptn.val;
                break;
            }
        }

        // ─────────────────────────────────────────────────
        // ⑨ STATIONNEMENT — Contextuel + réponse simple
        // ─────────────────────────────────────────────────
        const stationnementPositif = /\b(oui|facile|pas de souci|c['']est bon|ok|normal|aucun problème|place libre|livraison|devant|en face)\b/i.test(lowerMsg);
        const stationnementNegatif = /\b(non|difficile|compliqué|pas facile|impossible|interdit|payant|zone bleue)\b/i.test(lowerMsg);

        // Réponse explicite stationnement (facile/difficile)
        const statFacile = /\b(stationnement facile|accès facile|parking facile|place disponible)\b/i.test(lowerMsg);
        const statDifficile = /\b(stationnement difficile|accès difficile|pas de parking|pas de place)\b/i.test(lowerMsg);

        if (statFacile) {
            if (isArriveeContext && !existingProjetData.stationnementArrivee) entities.stationnementArrivee = 'Facile';
            else if (!isArriveeContext && !existingProjetData.stationnementDepart) entities.stationnementDepart = 'Facile';
        } else if (statDifficile) {
            if (isArriveeContext && !existingProjetData.stationnementArrivee) entities.stationnementArrivee = 'Difficile';
            else if (!isArriveeContext && !existingProjetData.stationnementDepart) entities.stationnementDepart = 'Difficile';
        } else if (botAskedStationnement && (stationnementPositif || stationnementNegatif)) {
            const val = stationnementPositif ? 'Facile' : 'Difficile';
            if (isArriveeContext && !existingProjetData.stationnementArrivee) entities.stationnementArrivee = val;
            else if (!isArriveeContext && !existingProjetData.stationnementDepart) entities.stationnementDepart = val;
        }

        // ─────────────────────────────────────────────────
        // ⑩ FORMULE
        // ─────────────────────────────────────────────────
        if (!existingProjetData.formule) {
            const formuleMatch = /\b(eco|éco|économique|standard|luxe|premium|clef en main|cl[ée] en main)\b/i.exec(lowerMsg);
            if (formuleMatch) {
                const raw = formuleMatch[1].toLowerCase();
                if (raw.includes('eco') || raw.includes('éco') || raw.includes('économ')) entities.formule = 'eco';
                else if (raw.includes('luxe') || raw.includes('premium') || raw.includes('clef') || raw.includes('clé')) entities.formule = 'luxe';
                else if (raw.includes('standard')) entities.formule = 'standard';
            }
        }

        // ─────────────────────────────────────────────────
        // ⑪ CODE POSTAL
        // ─────────────────────────────────────────────────
        const cpMatch = /\b(\d{5})\b/g;
        const cpAll = [...combined.matchAll(cpMatch)].map(m => m[1]).filter(cp => {
            const n = parseInt(cp, 10);
            return n >= 1000 && n <= 98999;
        });
        if (cpAll.length > 0) {
            if (!existingProjetData.codePostalDepart) {
                entities.codePostalDepart = cpAll[0];
                if (cpAll.length > 1 && !existingProjetData.codePostalArrivee) {
                    entities.codePostalArrivee = cpAll[1];
                }
            } else if (!existingProjetData.codePostalArrivee) {
                entities.codePostalArrivee = cpAll[0];
            }
        }

        // ─────────────────────────────────────────────────
        // ⑫ DATE
        // ─────────────────────────────────────────────────
        const dateMatch = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/.exec(combined);
        if (dateMatch) {
            entities.dateSouhaitee = dateMatch[0];
        } else {
            const textDateRegex = /(\d{1,2})\s*(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc|jan|feb|mar|apr|may|jun|jul|aug|sep|dec)[a-z]*|(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc|jan|feb|mar|apr|may|jun|jul|aug|sep|dec)[a-z]*\s*(\d{1,2})/i;
            const textMatch = textDateRegex.exec(combined);
            if (textMatch) {
                let d = textMatch[1] || textMatch[4];
                let mStr = (textMatch[2] || textMatch[3]).toLowerCase();
                const months: Record<string, string> = {
                    'jan': '01', 'fév': '02', 'feb': '02', 'mar': '03', 'avr': '04', 'apr': '04',
                    'mai': '05', 'may': '05', 'juin': '06', 'jun': '06',
                    'juil': '07', 'jul': '07', 'août': '08', 'aoû': '08', 'aug': '08',
                    'sep': '09', 'oct': '10', 'nov': '11', 'déc': '12', 'dec': '12'
                };
                const monthKey = months[mStr] || months[mStr.substring(0, 4)] || months[mStr.substring(0, 3)] || '01';
                entities.dateSouhaitee = d ? `${d.padStart(2, '0')}/${monthKey}/${new Date().getFullYear()}` : `${monthKey}/${new Date().getFullYear()}`;
            } else {
                // Mois seul ("en avril", "courant mars")
                const moisSeulMatch = /(?:en|courant|pour|debut|début|fin|mi[- ])\s*(janv[a-z]*|f[ée]vr[a-z]*|mars|avril?|mai|juin|juillet|ao[uû]t|sept[a-z]*|oct[a-z]*|nov[a-z]*|d[ée]c[a-z]*)/i.exec(combined);
                if (moisSeulMatch) {
                    const mStr = moisSeulMatch[1].toLowerCase();
                    const months: Record<string, string> = {
                        'jan': '01', 'fév': '02', 'féb': '02', 'mar': '03', 'avr': '04', 'avril': '04',
                        'mai': '05', 'juin': '06', 'juil': '07', 'ao': '08', 'sep': '09',
                        'oct': '10', 'nov': '11', 'déc': '12', 'dec': '12'
                    };
                    const mKey = months[mStr.substring(0, 4)] || months[mStr.substring(0, 3)] || null;
                    if (mKey) entities.dateSouhaitee = `${mKey}/${new Date().getFullYear()}`;
                }
            }
        }

        // ─────────────────────────────────────────────────
        // ⑬ NOM / PRÉNOM — FIX BUG #1 : guard contextuel
        // ─────────────────────────────────────────────────
        const { prenom, nom } = this.extractName(message, lowerBot, botAskedIdentity);
        if (prenom && !currentLead?.prenom) entities.prenom = prenom;
        if (nom && !currentLead?.nom) entities.nom = nom;

        // ─────────────────────────────────────────────────
        // ⑭ OBJETS SPÉCIAUX
        // ─────────────────────────────────────────────────
        const objetsSpeciauxPatterns = [
            { pattern: /\b(piano|orgue)\b/i, label: 'Piano' },
            { pattern: /\b(coffre[- ]fort)\b/i, label: 'Coffre-fort' },
            { pattern: /\b(moto|scooter|cyclomoteur)\b/i, label: 'Moto' },
            { pattern: /\b(voiture|véhicule|automobile)\b/i, label: 'Voiture' },
            { pattern: /\b(billard)\b/i, label: 'Billard' },
            { pattern: /\b(jacuzzi|spa|bain[- ]à[- ]remous)\b/i, label: 'Jacuzzi' },
            { pattern: /\b(oeuvre|tableau|sculpture|antiquité)\b/i, label: 'Objet d\'art' },
        ];
        const objetsDetectes: string[] = [];
        for (const obj of objetsSpeciauxPatterns) {
            if (obj.pattern.test(lowerMsg)) objetsDetectes.push(obj.label);
        }
        if (objetsDetectes.length > 0) {
            const existing = existingProjetData.objetSpeciaux || [];
            entities.objetSpeciaux = [...new Set([...existing, ...objetsDetectes])];
        }

        // ─────────────────────────────────────────────────
        // ⑮ RDV CONSEILLER — "oui"/"non" contextuel
        // ─────────────────────────────────────────────────
        const botAskedVisite = /visite|se déplace|déplace chez vous|conseiller vienne/i.test(lowerBot);
        if (botAskedVisite && existingProjetData.rdvConseiller === undefined) {
            const ouiVisite = /^\s*(oui|yes|ouais|bien sûr|d'accord|ok|volontiers|avec plaisir|je veux bien)\s*[.!]?\s*$/i.test(lowerMsg)
                || /\b(je souhaite|je veux|je voudrais|oui pour|je prends).{0,20}visite\b/i.test(lowerMsg);
            const nonVisite = /^\s*(non|no|pas besoin|pas pour l'instant|pas maintenant|je préfère pas|ça ira)\s*[.!]?\s*$/i.test(lowerMsg);
            if (ouiVisite) entities.rdvConseiller = true;
            if (nonVisite) entities.rdvConseiller = false;
        }

        return entities;
    }

    // ─────────────────────────────────────────────────
    //  EXTRACTION NOM — FIX BUG #1 : guard contextuel
    // ─────────────────────────────────────────────────
    private extractName(
        userMessage: string,
        lowerBotContext: string,
        botAskedIdentity: boolean
    ): { prenom: string | null; nom: string | null } {
        const clean = userMessage.trim();

        // Pattern 1 : "je m'appelle Jean Dupont"
        const p1 = clean.match(/je m['']appelle\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i);
        if (p1) {
            const parts = p1[1].trim().split(/\s+/);
            return { prenom: this.capitalizeFirst(parts[0]), nom: parts.length > 1 ? this.capitalizeFirst(parts.slice(1).join(' ')) : null };
        }

        // Pattern 2 : "mon prénom est Jean" / "je suis Jean"
        const p2 = clean.match(/(?:mon (?:prénom|nom) est|je suis|c'est)\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i);
        if (p2) {
            const parts = p2[1].trim().split(/\s+/);
            return { prenom: this.capitalizeFirst(parts[0]), nom: parts.length > 1 ? this.capitalizeFirst(parts.slice(1).join(' ')) : null };
        }

        // Pattern 3 : "Jean Dupont" (2 mots) — UNIQUEMENT si le bot venait de demander le nom
        if (botAskedIdentity) {
            const p3 = clean.match(/^([A-ZÀ-Üa-zà-ü]{2,25})\s+([A-ZÀ-Üa-zà-ü]{2,25})$/i);
            // Exclure les mots courants qui ne sont pas des noms (blacklist)
            const blacklist = /^(oui|non|pas|avec|sans|dans|pour|par|sur|sous|vers|chez|via|mais|donc|car|bonjour|merci|ok|bonsoir|hello|salut|maison|appart|appartement|paris|lyon|nice|matin|soir|midi|apres|demain|hier|aujourd)$/i;
            if (p3 && !blacklist.test(p3[1]) && !blacklist.test(p3[2])) {
                return { prenom: this.capitalizeFirst(p3[1]), nom: this.capitalizeFirst(p3[2]) };
            }

            // Pattern 4 : prénom seul
            const p4 = clean.match(/^([A-ZÀ-Üa-zà-ü]{2,25})$/i);
            if (p4 && !blacklist.test(p4[1])) {
                return { prenom: this.capitalizeFirst(p4[1]), nom: null };
            }
        }

        return { prenom: null, nom: null };
    }

    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    private async updateLead(leadId: string, entities: Record<string, any>, existingLead: any, score?: number) {
        const updates: any = {};
        if (entities.prenom) updates.prenom = entities.prenom;
        if (entities.nom) updates.nom = entities.nom;
        if (entities.email) updates.email = entities.email;
        if (entities.telephone) updates.telephone = entities.telephone;

        const existingProjet = (existingLead.projetData as any) || {};
        updates.projetData = this.mergeProjetDataSafe(existingProjet, entities);

        if (score !== undefined) {
            updates.score = score;
            updates.priorite = this.getPriorite(score, { ...existingLead, projetData: updates.projetData });
        }

        const updated = await prisma.lead.update({ where: { id: leadId }, data: updates });
        const conversation = await prisma.conversation.findFirst({ where: { leadId } });
        if (conversation) await contextManager.clearContextCache(conversation.id);
        return updated;
    }

    // ─────────────────────────────────────────────────
    //  SCORE — FIX BUG #9 : plus complet et graduel
    // ─────────────────────────────────────────────────
    private calculateScore(lead: any): number {
        let score = 0;
        const p = lead.projetData || {};

        // Coordonnées (40 pts max)
        if (lead.email) score += 10;
        if (lead.telephone) score += 15;
        if (lead.prenom && lead.nom) score += 15;
        else if (lead.prenom || lead.nom) score += 7;

        // Projet (40 pts max)
        if (p.villeDepart && p.villeArrivee) score += 10;
        if (p.volumeEstime || p.surface) score += 10;
        if (p.dateSouhaitee) score += 5;
        if (p.formule) score += 5;
        if (p.typeHabitationDepart) score += 5;
        if (p.stationnementDepart || p.etageDepart !== undefined) score += 5;

        // Engagement (20 pts max)
        if (p.rdvConseiller === true) score += 10;
        if (p.rdvConseiller !== undefined) score += 5;
        if (lead.creneauRappel) score += 5;

        return Math.min(score, 100);
    }

    private getPriorite(score: number, lead?: any): PrioriteLead {
        if (score >= 70) return PrioriteLead.CHAUD;
        if (score >= 40) return PrioriteLead.TIEDE;
        return PrioriteLead.FROID;
    }

    private async triggerActions(lead: any, score: number): Promise<string[]> {
        const actions: string[] = [];
        const p = (lead.projetData as Record<string, any>) || {};

        if (score >= 60 && !lead.notificationSent) actions.push('email_notification_queued');
        if (lead.email && lead.telephone && !lead.pushedToCRM) actions.push('crm_push_queued');

        // Modales UI
        if ((p.volumeEstime || p.surface) && p.villeDepart && p.villeArrivee && !p.formule)
            actions.push('show_formula_picker');
        if (p.rdvConseiller === undefined && (p.volumeEstime > 0 || p.surface > 0))
            actions.push('suggest_visit_picker');
        if (p.rdvConseiller === true && !p.creneauVisite)
            actions.push('appointment_module_triggered');
        if (!lead.creneauRappel && lead.nom && lead.telephone)
            actions.push('show_timeslot_picker');

        const leadUpdates: any[] = [];
        if (score >= 60 && !lead.notificationSent)
            leadUpdates.push(prisma.lead.update({ where: { id: lead.id }, data: { notificationSent: true } }));
        if (lead.email && lead.telephone && !lead.pushedToCRM)
            leadUpdates.push(prisma.lead.update({ where: { id: lead.id }, data: { pushedToCRM: true } }));
        if (leadUpdates.length > 0) await Promise.all(leadUpdates);

        if (score >= 60) {
            const conv = await prisma.conversation.findFirst({ where: { leadId: lead.id } });
            if (conv && conv.status === 'ACTIVE')
                await prisma.conversation.update({ where: { id: conv.id }, data: { status: 'QUALIFIED' } });
        }
        return actions;
    }

    private sanitizeReply(text: string): string {
        return text
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/^(Bot|Assistant|🤖|AI|System):\s*/i, '')
            .replace(/\n{3,}/g, '\n\n')
            // Supprimer les lignes techniques qui fuient parfois
            .replace(/\n?\*?\*?Actions? Déclenchées?\*?\*?.*$/gim, '')
            .replace(/\b(show_formula_picker|show_timeslot_picker|suggest_visit_picker|appointment_module_triggered|email_notification_queued|crm_push_queued)\b/gi, '')
            .trim();
    }

    // ─────────────────────────────────────────────────
    //  FILTRES ANTI-RÉPÉTITION — FIX BUG #8
    //  Cibler uniquement les QUESTIONS, pas les confirmations
    // ─────────────────────────────────────────────────
    private filterRepeatedContactQuestion(text: string, lead: any): string {
        let cleaned = text;
        // Seulement si la phrase se termine par "?" (c'est une question)
        if (lead?.telephone)
            cleaned = cleaned.replace(/[^.!?\n]*(?:votre\s+(?:numéro|téléphone|portable)|quel\s+est\s+votre\s+tél)[^.!?\n]*\?/gi, '').trim();
        if (lead?.email)
            cleaned = cleaned.replace(/[^.!?\n]*(?:votre\s+(?:email|adresse\s+mail|adresse\s+e-mail))[^.!?\n]*\?/gi, '').trim();
        return cleaned;
    }

    private filterRepeatedIdentityQuestion(text: string, lead: any): string {
        if (lead?.prenom && lead?.nom)
            return text.replace(/[^.!?\n]*(?:votre\s+prénom|votre\s+nom\s+complet|comment\s+vous\s+appelez)[^.!?\n]*\?/gi, '').trim();
        return text;
    }

    private filterRepeatedLogementQuestion(text: string, lead: any): string {
        const p = lead?.projetData || {};
        let cleaned = text;
        if (p.typeHabitationDepart)
            cleaned = cleaned.replace(/[^.!?\n]*(?:maison\s+ou\s+appartement)[^.!?\n]*(?:départ|partez)[^.!?\n]*\?/gi, '').trim();
        if (p.typeHabitationArrivee)
            cleaned = cleaned.replace(/[^.!?\n]*(?:maison\s+ou\s+appartement)[^.!?\n]*(?:arrivée?|allez)[^.!?\n]*\?/gi, '').trim();
        return cleaned;
    }

    private filterRepeatedCreneauQuestion(text: string, lead: any): string {
        if (lead?.creneauRappel)
            return text.replace(/[^.!?\n]*(?:quel\s+créneau|quand\s+souhaitez|pour\s+être\s+recontacté)[^.!?\n]*\?/gi, '').trim();
        return text;
    }

    private filterRepeatedVisitQuestion(text: string, lead: any): string {
        if (lead?.projetData?.creneauVisite)
            return text.replace(/[^.!?\n]*(?:quel\s+jour|quel\s+créneau)[^.!?\n]*visite[^.!?\n]*\?/gi, '').trim();
        return text;
    }

    private filterRepeatedStationnementQuestion(text: string, lead: any): string {
        const p = lead?.projetData || {};
        let cleaned = text;
        if (p.stationnementDepart)
            cleaned = cleaned.replace(/[^.!?\n]*stationnement[^.!?\n]*(?:départ|partez|initial|devant l'immeuble)[^.!?\n]*\?/gi, '').trim();
        if (p.stationnementArrivee)
            cleaned = cleaned.replace(/[^.!?\n]*stationnement[^.!?\n]*(?:arrivée?|allez|destination|maison|nouvelle|toulon)[^.!?\n]*\?/gi, '').trim();
        return cleaned;
    }

    private mergeEntities(primary: Record<string, any>, fallback: Record<string, any>): Record<string, any> {
        const result = { ...primary };
        for (const [k, v] of Object.entries(fallback)) {
            if (result[k] === null || result[k] === undefined || result[k] === '') result[k] = v;
        }
        return result;
    }

    private mergeProjetDataSafe(existing: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
        const result = { ...existing };
        for (const [key, value] of Object.entries(incoming)) {
            if (value !== null && value !== undefined && value !== '') result[key] = value;
        }
        return result;
    }

    private parseLLMDataBlock(raw: string): { llmEntities: any; clean: string } {
        const match = raw.match(/<!--DATA:([\s\S]*?)-->/);
        const clean = raw.replace(/<!--DATA:[\s\S]*?-->/, '').trim();
        if (!match) return { llmEntities: {}, clean };
        try {
            return { llmEntities: JSON.parse(match[1].trim()), clean };
        } catch {
            return { llmEntities: {}, clean };
        }
    }
}

export const messageHandler = new MessageHandler();
