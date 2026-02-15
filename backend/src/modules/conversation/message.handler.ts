import { prisma } from '../../config/database';
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
            logger.info('Processing message', { conversationId, messageLength: message.length });

            // ── 1.  Récupérer le contexte complet ────────────────
            const context = await this.getFullContext(conversationId, entrepriseId);

            // ── 2.  Construire le prompt système expert ──────────
            const systemPrompt = buildPromptDemenagement(
                {
                    nom: context.entreprise.nom,
                    nomBot: context.entreprise.nomBot,
                    zonesIntervention: context.config.zonesIntervention,
                    tarifsCustom: context.config.tarifsCustom,
                    specificites: context.config.specificites,
                    documentsCalcul: (context.config.documentsCalcul as string[]) || [],
                    consignesPersonnalisees: context.config.consignesPersonnalisees || '',
                },
                {
                    prenom: context.lead?.prenom || undefined,
                    nom: context.lead?.nom || undefined,
                    email: context.lead?.email || undefined,
                    telephone: context.lead?.telephone || undefined,
                    projetData: context.lead?.projetData || {},
                }
            );

            // ── 3.  Préparer les messages pour le LLM ────────────
            const llmMessages = [
                ...context.messages,
                { role: 'user' as const, content: message },
            ];

            // ── 4.  Appeler le LLM ───────────────────────────────
            const llmResponse = await llmService.generateResponse(systemPrompt, llmMessages);

            logger.info('LLM response received', {
                conversationId,
                tokensUsed: llmResponse.tokensUsed,
                latencyMs: llmResponse.latencyMs,
            });

            // ── 5.  Extraire les entités du message utilisateur ──
            const existingProjetData = (context.lead?.projetData as Record<string, any>) || {};
            const extractedEntities = this.extractEntities(message, llmResponse.content, existingProjetData);

            // ── 6.  Mettre à jour le lead ────────────────────────
            let updatedLead = context.lead;
            if (context.lead) {
                updatedLead = await this.updateLead(context.lead.id, extractedEntities);
            }

            // ── 7.  Recalculer le score ──────────────────────────
            const newScore = this.calculateScore(updatedLead);

            // ── 8.  Persister score + priorité ───────────────────
            if (updatedLead) {
                await prisma.lead.update({
                    where: { id: updatedLead.id },
                    data: {
                        score: newScore,
                        priorite: this.getPriorite(newScore),
                    },
                });
            }

            // ── 9.  Sauvegarder les messages (user + assistant) ──
            await contextManager.saveMessage(conversationId, RoleMessage.user, message);

            await contextManager.saveMessage(
                conversationId,
                RoleMessage.assistant,
                llmResponse.content,
                {
                    tokensUsed: llmResponse.tokensUsed,
                    latencyMs: llmResponse.latencyMs,
                }
            );

            // ── 10.  Déclencher des actions conditionnelles ──────
            const actions = updatedLead
                ? await this.triggerActions(updatedLead, newScore)
                : [];

            // ── 11.  Résultat final ──────────────────────────────
            const totalLatency = Date.now() - startTime;

            logger.info('Message processed successfully', {
                conversationId,
                score: newScore,
                actionsCount: actions.length,
                totalLatency,
            });

            return {
                reply: llmResponse.content,
                leadData: updatedLead,
                score: newScore,
                actions,
                metadata: {
                    tokensUsed: llmResponse.tokensUsed,
                    latencyMs: llmResponse.latencyMs,
                    entitiesExtracted: extractedEntities,
                },
            };
        } catch (error) {
            logger.error('Error processing message', {
                conversationId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });

            // Réponse d'erreur gracieuse (l'utilisateur ne voit pas le crash)
            return {
                reply: "Désolé, j'ai rencontré un petit problème technique. Pouvez-vous reformuler votre message ?",
                actions: [],
            };
        }
    }

    // ──────────────────────────────────────────────
    //  CONTEXTE
    // ──────────────────────────────────────────────

    /**
     * Récupère le contexte complet : conversation, lead, entreprise, config métier.
     */
    private async getFullContext(conversationId: string, entrepriseId: string) {
        // Messages + lead + metier
        const context = await contextManager.getContext(conversationId);

        // Entreprise
        const entreprise = await prisma.entreprise.findUnique({
            where: { id: entrepriseId },
        });

        if (!entreprise) {
            throw new Error(`Entreprise ${entrepriseId} non trouvée`);
        }

        // Config métier
        const metier = (context.metier as Metier) || Metier.DEMENAGEMENT;
        const config = await prisma.configMetier.findFirst({
            where: { entrepriseId, metier },
        });

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
    private extractEntities(
        userMessage: string,
        botReply: string,
        existingProjetData: Record<string, any>
    ): Record<string, any> {
        const entities: Record<string, any> = {};
        const combined = userMessage + ' ' + botReply;

        // ── Email ──
        const emailRegex = /[\w.+-]+@[\w.-]+\.\w+/gi;
        const emails = userMessage.match(emailRegex);
        if (emails && emails.length > 0) {
            entities.email = emails[0].toLowerCase();
        }

        // ── Téléphone français (formats variés) ──
        const phoneRegex = /(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
        const phones = userMessage.match(phoneRegex);
        if (phones && phones.length > 0) {
            entities.telephone = phones[0].replace(/[\s.-]/g, '');
        }

        // ── Codes postaux (5 chiffres) ──
        const cpRegex = /\b\d{5}\b/g;
        const cps = userMessage.match(cpRegex);
        if (cps && cps.length > 0) {
            if (!existingProjetData.codePostalDepart) {
                entities.codePostalDepart = cps[0];
            } else if (cps.length > 1 && !existingProjetData.codePostalArrivee) {
                entities.codePostalArrivee = cps[1];
            }
        }

        // ── Surface (m² / m2 / mètres carrés) ──
        const surfaceRegex = /(\d+)\s*(?:m²|m2|mètres?\s*carrés?)/gi;
        const surfaceMatch = surfaceRegex.exec(userMessage);
        if (surfaceMatch) {
            entities.surface = parseInt(surfaceMatch[1], 10);
        }

        // ── Nombre de pièces (F2, F3, T2, T3…) ──
        const piecesRegex = /\b[FT](\d)\b/gi;
        const piecesMatch = piecesRegex.exec(userMessage);
        if (piecesMatch) {
            entities.nbPieces = parseInt(piecesMatch[1], 10);
        }

        // ── Volume explicite (m³ / m3 / mètres cubes) ──
        const volumeRegex = /(\d+)\s*(?:m³|m3|mètres?\s*cubes?)/gi;
        const volumeMatch = volumeRegex.exec(userMessage);
        if (volumeMatch) {
            entities.volumeEstime = parseInt(volumeMatch[1], 10);
        }

        // ── Date (JJ/MM/YYYY ou JJ-MM-YYYY) ──
        const dateRegex = /\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})\b/g;
        const dateMatch = dateRegex.exec(userMessage);
        if (dateMatch) {
            entities.dateSouhaitee = dateMatch[0];
        }

        // ── Étage ──
        const etageRegex = /(\d+)(?:er|ème|e|eme)?\s*(?:étage|etage)/gi;
        const etageMatch = etageRegex.exec(combined);
        if (etageMatch) {
            entities.etage = parseInt(etageMatch[1], 10);
        }

        // ── Ascenseur ──
        if (/sans\s*ascenseur/i.test(combined)) {
            entities.ascenseur = false;
        } else if (/avec\s*ascenseur/i.test(combined)) {
            entities.ascenseur = true;
        }

        // ── Formule choisie ──
        if (/formule\s*(?:eco|éco|économique)/i.test(combined)) {
            entities.formule = 'ECO';
        } else if (/formule\s*standard/i.test(combined)) {
            entities.formule = 'STANDARD';
        } else if (/formule\s*luxe|formule\s*(?:premium|vip|sérénité)/i.test(combined)) {
            entities.formule = 'LUXE';
        }

        // ── Prénom (détection contextuelle) ──
        const prenomPatterns = [
            /je\s+(?:suis|m'appelle|me\s+nomme)\s+([A-ZÀ-Ü][a-zà-ü]+)/i,
            /(?:prénom|prenom)\s*(?:est|:)?\s*([A-ZÀ-Ü][a-zà-ü]+)/i,
            /(?:c'est|moi\s+c'est)\s+([A-ZÀ-Ü][a-zà-ü]+)/i,
        ];
        for (const pattern of prenomPatterns) {
            const match = pattern.exec(userMessage);
            if (match && match[1].length > 2) {
                entities.prenom = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
                break;
            }
        }

        // ── Nom de famille ──
        const nomPatterns = [
            /je\s+(?:suis|m'appelle)\s+[A-ZÀ-Ü][a-zà-ü]+\s+([A-ZÀ-Ü][a-zà-ü]+)/i,
            /(?:nom\s+(?:de\s+famille)?)\s*(?:est|:)?\s*([A-ZÀ-Ü][a-zà-ü]+)/i,
        ];
        for (const pattern of nomPatterns) {
            const match = pattern.exec(userMessage);
            if (match && match[1].length > 2) {
                entities.nom = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
                break;
            }
        }

        if (Object.keys(entities).length > 0) {
            logger.info('Entities extracted', { entities });
        }

        return entities;
    }

    // ──────────────────────────────────────────────
    //  MISE À JOUR DU LEAD
    // ──────────────────────────────────────────────

    /**
     * Met à jour le lead avec les nouvelles entités extraites.
     * Fusionne les données projet existantes avec les nouvelles.
     */
    private async updateLead(leadId: string, entities: Record<string, any>) {
        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead) throw new Error(`Lead ${leadId} non trouvé`);

        const updates: Record<string, any> = {};

        // ── Champs directs ──
        if (entities.prenom) updates.prenom = entities.prenom;
        if (entities.nom) updates.nom = entities.nom;
        if (entities.email) updates.email = entities.email;
        if (entities.telephone) updates.telephone = entities.telephone;

        // ── Fusion projetData ──
        const projetData = { ...(lead.projetData as Record<string, any>) };

        const projetFields = [
            'codePostalDepart', 'codePostalArrivee', 'surface', 'nbPieces',
            'volumeEstime', 'dateSouhaitee', 'etage', 'ascenseur', 'formule',
        ];

        for (const field of projetFields) {
            if (entities[field] !== undefined) {
                projetData[field] = entities[field];
            }
        }

        updates.projetData = projetData;

        // ── Persist ──
        const updatedLead = await prisma.lead.update({
            where: { id: leadId },
            data: updates,
        });

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

        // ── 1. COMPLÉTUDE (40 pts max) ──
        if (lead.email) score += 10;
        if (lead.telephone) score += 10;
        if (projet.codePostalDepart || projet.villeDepart) score += 5;
        if (projet.codePostalArrivee || projet.villeArrivee) score += 5;
        if (projet.volumeEstime || projet.surface || projet.nbPieces) score += 5;
        if (projet.formule) score += 5;

        // ── 2. URGENCE (30 pts max) ──
        if (projet.dateSouhaitee) {
            try {
                const dateStr = projet.dateSouhaitee;
                const today = new Date();
                let targetDate: Date;

                if (dateStr.includes('/') || dateStr.includes('-')) {
                    const parts = dateStr.split(/[/\-]/);
                    targetDate = new Date(
                        parseInt(parts[2], 10),
                        parseInt(parts[1], 10) - 1,
                        parseInt(parts[0], 10)
                    );
                } else {
                    targetDate = new Date(dateStr);
                }

                const daysUntil = Math.floor(
                    (targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                );

                if (daysUntil < 7) score += 30;        // Très urgent
                else if (daysUntil < 14) score += 20;   // Urgent
                else if (daysUntil < 30) score += 10;   // Moyen terme
                else score += 5;                        // Long terme
            } catch {
                // Date non parsable, on ignore
            }
        }

        // ── 3. VALEUR DU PROJET (20 pts max) ──
        const volume = projet.volumeEstime || (projet.surface ? Math.round(projet.surface / 2) : null);
        if (volume) {
            if (volume > 80) score += 20;
            else if (volume > 50) score += 15;
            else if (volume > 30) score += 10;
            else score += 5;
        }

        // ── 4. ENGAGEMENT (10 pts base) ──
        score += 10;

        return Math.min(score, 100);
    }

    /**
     * Priorité du lead selon son score
     */
    private getPriorite(score: number): PrioriteLead {
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

        // ── Action 1 : Notification email si lead chaud ──
        if (score >= 70 && !lead.notificationSent) {
            // TODO Phase 2 : Envoyer email via SendGrid / Resend
            logger.info('📧 [ACTION] Email notification queued', { leadId: lead.id, score });
            actions.push('email_notification_queued');

            await prisma.lead.update({
                where: { id: lead.id },
                data: { notificationSent: true },
            });
        }

        // ── Action 2 : Push CRM si email + téléphone collectés ──
        if (lead.email && lead.telephone && !lead.pushedToCRM) {
            // TODO Phase 3 : Push vers HubSpot / Salesforce
            logger.info('🔗 [ACTION] CRM push queued', { leadId: lead.id });
            actions.push('crm_push_queued');

            await prisma.lead.update({
                where: { id: lead.id },
                data: { pushedToCRM: true },
            });
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
}

// ── Export singleton ──
export const messageHandler = new MessageHandler();
