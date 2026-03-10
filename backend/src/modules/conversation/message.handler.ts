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
                    projetData: (currentLead?.projetData || {}) as any,
                }
            );

            // ── 5.  Préparer les messages (Contexte étendu) ────────────
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

            // ── 6b. Extraire le bloc DATA JSON du LLM ──
            const { llmEntities, clean: cleanedContent } = this.parseLLMDataBlock(llmContent);
            llmContent = cleanedContent;

            // ── 6c. Nettoyage du texte LLM ──
            llmContent = this.sanitizeReply(llmContent);

            // ── 6d. Fallback si la réponse est vide (le LLM n'a produit que le bloc DATA) ──
            if (!llmContent || llmContent.trim().length < 2) {
                logger.warn('⚠️ [MessageHandler] LLM reply was empty after sanitization, generating fallback', { conversationId });
                const nextStep = buildNextStep(currentLead || {}, (currentLead?.projetData || {}) as any, !!(currentLead?.nom && (currentLead?.telephone || currentLead?.email)));
                if (nextStep.includes('RÉCAPITULATIF')) {
                    llmContent = "C'est parfait ! Je prépare maintenant le récapitulatif de votre dossier. Quel moment vous convient le mieux pour être recontacté par notre équipe : le matin, l'après-midi ou le soir ?";
                } else if (nextStep.includes('CONVERSATION TERMINÉE')) {
                    llmContent = "Merci beaucoup ! Votre dossier est maintenant complet et a été transmis à notre équipe. Nous vous souhaitons une excellente journée !";
                } else {
                    llmContent = "C'est bien noté ! Pour continuer votre projet, pouvez-vous me préciser la suite ?";
                }
            }

            // Filtres anti-répétition
            llmContent = this.filterRepeatedCreneauQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedVisitQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedStationnementQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedContactQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedIdentityQuestion(llmContent, currentLead);
            llmContent = this.filterRepeatedLogementQuestion(llmContent, currentLead);

            // ── 7.  Extraction regex + merge avec LLM ──
            const lastBotMsg = [...recentMessages].reverse().find((m: any) => m.role === 'assistant' || m.role === 'bot')?.content || '';
            const regexEntities = await this.extractEntities(message, llmContent, currentLead, lastBotMsg);
            const finalEntities = this.mergeEntities(llmEntities, regexEntities);

            // ── 8.  Mise à jour lead + score ──
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

            // Fallback si vide
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

    private async extractEntities(message: string, llmContent: string, currentLead: any, lastBotMessage?: string): Promise<any> {
        const entities: any = {};
        const existingProjetData = (currentLead?.projetData as any) || {};
        const combined = (message + ' ' + (llmContent || '')).replace(/\((\d{5})\)/g, ' $1 ');

        // Email
        const emails = combined.match(/[a-zA-Z0-9._%+\-àâäéèêëîïôùûüç]+@[a-zA-Z0-9.\-àâäéèêëîïôùûüç]+\.[a-zA-Z]{2,}/gi);
        if (emails) entities.email = emails[0].toLowerCase().trim();

        // Phone
        const phones = combined.match(/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g);
        if (phones) {
            let raw = phones[0].replace(/[\s.-]/g, '');
            if (raw.startsWith('+33')) raw = '0' + raw.slice(3);
            else if (raw.startsWith('0033')) raw = '0' + raw.slice(4);
            entities.telephone = raw;
        }

        // Surface / Volume deduction
        const surfaceMatch = /(\d+)\s*(?:m²|m2|mètres?\s*carrés?)/gi.exec(combined);
        if (surfaceMatch) {
            const surface = parseInt(surfaceMatch[1], 10);
            entities.surface = surface;
            if (!entities.volumeEstime && !existingProjetData.volumeEstime) {
                entities.volumeEstime = Math.round(surface / 2);
            }
        }

        const volumeMatch = /(\d+(?:[.,]\d+)?)\s*(?:m³|m3|mètres?\s*cubes?)/gi.exec(combined);
        if (volumeMatch) entities.volumeEstime = parseFloat(volumeMatch[1].replace(',', '.'));

        // Étage / Ascenceur / Escalier
        const lowerBot = ((lastBotMessage || '') + ' ' + (llmContent || '')).toLowerCase();
        const isArrivee = lowerBot.includes('arrivée') || lowerBot.includes('arrivee') || lowerBot.includes('nouveau') || lowerBot.includes('à massy');

        // Escalier logic
        const escalierPatterns = [
            { pattern: /\b(colima[çc]on|h[ée]lico[ïi]dal)\b/i, val: 'Colimaçon' },
            { pattern: /\b([ée]troit|serr[ée]|difficile|petit)\s+escalier\b/i, val: 'Étroit' },
            { pattern: /\b(large|spacieux|standard|normal)\s+escalier\b/i, val: 'Standard' },
            { pattern: /\bescalier\s+(large|spacieux|standard|normal)\b/i, val: 'Standard' },
        ];
        for (const ptn of escalierPatterns) {
            if (ptn.pattern.test(combined)) {
                if (isArrivee) entities.typeEscalierArrivee = ptn.val;
                else entities.typeEscalierDepart = ptn.val;
                break;
            }
        }

        // Stationnement
        const lowerMsg = message.toLowerCase().trim();
        const isOuiFacile = /\b(oui|ouais|yes|facile|pas de souci|c'est bon|ok|normal)\b/i.test(lowerMsg) && !/\b(non|difficile|compliqué)\b/i.test(lowerMsg);
        const isNonDifficile = /\b(non|difficile|compliqué|pas facile)\b/i.test(lowerMsg);
        if (isOuiFacile || isNonDifficile) {
            const val = isOuiFacile ? 'Facile' : 'Difficile';
            if (lowerBot.includes('stationnement') || lowerBot.includes('accès') || lowerBot.includes('camion')) {
                if (lowerBot.includes('départ') || lowerBot.includes('depart')) {
                    if (!existingProjetData.stationnementDepart) entities.stationnementDepart = val;
                } else {
                    if (!existingProjetData.stationnementArrivee) entities.stationnementArrivee = val;
                }
            }
        }

        // Date
        const dateMatch = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/.exec(combined);
        if (dateMatch) entities.dateSouhaitee = dateMatch[0];
        else {
            const textDateRegex = /(\d{1,2})\s*(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc|jan|feb|mar|apr|may|jun|jul|aug|sep|dec)[a-z]*|(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc|jan|feb|mar|apr|may|jun|jul|aug|sep|dec)[a-z]*\s*(\d{1,2})/i;
            const textMatch = textDateRegex.exec(combined);
            if (textMatch) {
                let d = textMatch[1] || textMatch[4];
                let mStr = (textMatch[2] || textMatch[3]).toLowerCase().substring(0, 3);
                const months: any = { 'jan': '01', 'fév': '02', 'mar': '03', 'avr': '04', 'mai': '05', 'jui': '06', 'jui': '07', 'aoû': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'déc': '12' };
                entities.dateSouhaitee = `${d.padStart(2, '0')}/${months[mStr] || '01'}/${new Date().getFullYear()}`;
            }
        }

        // Name
        const { prenom, nom } = this.extractName(message);
        if (prenom && !currentLead.prenom) entities.prenom = prenom;
        if (nom && !currentLead.nom) entities.nom = nom;

        return entities;
    }

    private extractName(userMessage: string): { prenom: string | null; nom: string | null } {
        const clean = userMessage.trim();
        const p1 = clean.match(/je m['']appelle\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i);
        if (p1) {
            const parts = p1[1].trim().split(/\s+/);
            return { prenom: this.capitalizeFirst(parts[0]), nom: parts.length > 1 ? this.capitalizeFirst(parts.slice(1).join(' ')) : null };
        }
        const p6 = clean.match(/^([A-ZÀ-Üa-zà-ü]{2,20})\s+([A-ZÀ-Üa-zà-ü]{2,20})$/i);
        if (p6) return { prenom: this.capitalizeFirst(p6[1]), nom: this.capitalizeFirst(p6[2]) };
        const p7 = clean.match(/^([A-ZÀ-Üa-zà-ü]{2,20})$/i);
        if (p7) return { prenom: this.capitalizeFirst(p7[1]), nom: null };
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

    private calculateScore(lead: any): number {
        let score = 0;
        const p = lead.projetData || {};
        if (lead.email) score += 10;
        if (lead.telephone) score += 10;
        if (lead.prenom || lead.nom) score += 10;
        if (p.villeDepart || p.villeArrivee) score += 10;
        if (p.volumeEstime || p.surface) score += 10;
        return Math.min(score + 10, 100);
    }

    private getPriorite(score: number, lead?: any): PrioriteLead {
        if (score >= 80) return PrioriteLead.CHAUD;
        if (score >= 50) return PrioriteLead.TIEDE;
        return PrioriteLead.FROID;
    }

    private async triggerActions(lead: any, score: number): Promise<string[]> {
        const actions: string[] = [];
        const p = (lead.projetData as Record<string, any>) || {};

        if (score >= 70 && !lead.notificationSent) actions.push('email_notification_queued');
        if (lead.email && lead.telephone && !lead.pushedToCRM) actions.push('crm_push_queued');

        // Modales
        if ((p.volumeEstime || p.surface) && p.villeDepart && p.villeArrivee && !p.formule) actions.push('show_formula_picker');
        if (p.rdvConseiller === undefined && (p.volumeEstime > 0 || p.surface > 0)) actions.push('suggest_visit_picker');
        if (p.rdvConseiller === true && !p.creneauVisite) actions.push('appointment_module_triggered');

        const leadUpdates: any[] = [];
        if (score >= 70 && !lead.notificationSent) leadUpdates.push(prisma.lead.update({ where: { id: lead.id }, data: { notificationSent: true } }));
        if (lead.email && lead.telephone && !lead.pushedToCRM) leadUpdates.push(prisma.lead.update({ where: { id: lead.id }, data: { pushedToCRM: true } }));
        if (leadUpdates.length > 0) await Promise.all(leadUpdates);

        if (score >= 70) {
            const conv = await prisma.conversation.findFirst({ where: { leadId: lead.id } });
            if (conv && conv.status === 'ACTIVE') await prisma.conversation.update({ where: { id: conv.id }, data: { status: 'QUALIFIED' } });
        }
        return actions;
    }

    private sanitizeReply(text: string): string {
        return text.replace(/<br\s*\/?>/gi, '\n').replace(/^(Bot|Assistant|🤖|AI|System):\s*/i, '').replace(/\n{3,}/g, '\n\n').trim();
    }

    private filterRepeatedContactQuestion(text: string, lead: any): string {
        let cleaned = text;
        if (lead?.telephone) cleaned = cleaned.replace(/[^.!?\n]*(?:téléphone|numéro|portable|tél)[^.!?\n]*\?[^.!?\n]*/gi, '');
        if (lead?.email) cleaned = cleaned.replace(/[^.!?\n]*(?:email|adresse mail)[^.!?\n]*\?[^.!?\n]*/gi, '');
        return cleaned;
    }

    private filterRepeatedIdentityQuestion(text: string, lead: any): string {
        if (lead?.prenom && lead?.nom) return text.replace(/[^.!?\n]*(?:prénom|nom complet)[^.!?\n]*\?[^.!?\n]*/gi, '');
        return text;
    }

    private filterRepeatedLogementQuestion(text: string, lead: any): string {
        const p = lead?.projetData || {};
        let cleaned = text;
        if (p.typeHabitationDepart) cleaned = cleaned.replace(/[^.!?\n]*(?:maison ou appartement)[^.!?\n]*départ[^.!?\n]*\?[^.!?\n]*/gi, '');
        if (p.typeHabitationArrivee) cleaned = cleaned.replace(/[^.!?\n]*(?:maison ou appartement)[^.!?\n]*arrivée?[^.!?\n]*\?[^.!?\n]*/gi, '');
        return cleaned;
    }

    private filterRepeatedCreneauQuestion(text: string, lead: any): string {
        if (lead?.creneauRappel) return text.replace(/[^.!?\n]*(?:créneau|rappel|recontact)[^.!?\n]*\?[^.!?\n]*/gi, '');
        return text;
    }

    private filterRepeatedVisitQuestion(text: string, lead: any): string {
        if (lead?.projetData?.creneauVisite) return text.replace(/[^.!?\n]*(?:quel jour|quel créneau)[^.!?\n]*visite[^.!?\n]*\?[^.!?\n]*/gi, '');
        return text;
    }

    private filterRepeatedStationnementQuestion(text: string, lead: any): string {
        const p = lead?.projetData || {};
        let cleaned = text;
        if (p.stationnementDepart) cleaned = cleaned.replace(/[^.!?\n]*stationnement[^.!?\n]*départ[^.!?\n]*\?[^.!?\n]*/gi, '');
        if (p.stationnementArrivee) cleaned = cleaned.replace(/[^.!?\n]*stationnement[^.!?\n]*arrivée?[^.!?\n]*\?[^.!?\n]*/gi, '');
        return cleaned;
    }

    private async resolvePostalCode(codePostal: string): Promise<string | null> {
        return null; // Simplified for robustness in this rewrite
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
