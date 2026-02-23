import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { llmService } from '../llm/llm.service';
import { contextManager } from './context.manager';
import { buildPromptDemenagement } from '../prompt/templates/demenagement';
import { Metier, RoleMessage } from '@prisma/client';

export class ConversationEngine {
    /**
     * Traite un message utilisateur et génère une réponse de l'IA
     */
    async processMessage(conversationId: string, userContent: string) {
        try {
            // 1. Récupérer la conversation et le contexte
            const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                include: {
                    entreprise: {
                        include: {
                            configs: true
                        }
                    },
                    lead: true
                }
            });

            if (!conversation) {
                throw new Error(`Conversation ${conversationId} non trouvée`);
            }

            const configMetier = conversation.entreprise.configs.find((c: any) => c.metier === conversation.metier);
            if (!configMetier) {
                throw new Error(`Configuration métier non trouvée pour ${conversation.metier}`);
            }

            // 2. Sauvegarder le message utilisateur
            await contextManager.saveMessage(conversationId, RoleMessage.user, userContent);

            // 3. Récupérer l'historique complet pour le LLM
            const context = await contextManager.getContext(conversationId);

            // 4. Construire le Prompt Système (Expert Déménagement)
            const systemPrompt = await buildPromptDemenagement(
                {
                    nom: conversation.entreprise.nom,
                    nomBot: conversation.entreprise.nomBot,
                    email: conversation.entreprise.email,
                    telephone: conversation.entreprise.telephone ?? undefined,
                    zonesIntervention: configMetier.zonesIntervention,
                    tarifsCustom: configMetier.tarifsCustom,
                    specificites: configMetier.specificites,
                    documentsCalcul: (configMetier.documentsCalcul as string[]) || [],
                    consignesPersonnalisees: configMetier.consignesPersonnalisees || ''
                },
                {
                    prenom: conversation.lead?.prenom || undefined,
                    nom: conversation.lead?.nom || undefined,
                    email: conversation.lead?.email || undefined,
                    telephone: conversation.lead?.telephone || undefined,
                    projetData: conversation.lead?.projetData || {}
                }
            );

            // 5. Générer la réponse via le LLM (Grok/Claude)
            const llmResponse = await llmService.generateResponse(systemPrompt, context.messages);

            // 6. Sauvegarder la réponse de l'assistant
            const savedResponse = await contextManager.saveMessage(
                conversationId,
                RoleMessage.assistant,
                llmResponse.content,
                {
                    tokensUsed: llmResponse.tokensUsed,
                    latencyMs: llmResponse.latencyMs
                }
            );

            return {
                message: savedResponse.content,
                latencyMs: llmResponse.latencyMs,
                tokensUsed: llmResponse.tokensUsed
            };
        } catch (error) {
            logger.error(`Erreur ConversationEngine pour ${conversationId}:`, error);
            throw error;
        }
    }
}

export const conversationEngine = new ConversationEngine();
