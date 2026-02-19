import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { Metier, StatusConversation } from '@prisma/client';

export class ConversationService {
    /**
     * Crée une nouvelle conversation en base de données
     */
    async createConversation(leadId: string, entrepriseId: string, metier: Metier) {
        try {
            const conversation = await prisma.conversation.create({
                data: {
                    leadId,
                    entrepriseId,
                    metier,
                    status: StatusConversation.ACTIVE
                }
            });

            logger.info(`Conversation créée: ${conversation.id} pour l'entreprise ${entrepriseId}`);
            return conversation;
        } catch (error) {
            logger.error('Erreur lors de la création de la conversation:', error);
            throw error;
        }
    }

    /**
     * Récupère une conversation avec son lead et les 50 derniers messages
     */
    async getConversation(conversationId: string) {
        try {
            const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                include: {
                    lead: true,
                    messages: {
                        take: 50,
                        orderBy: { createdAt: 'asc' }
                    }
                }
            });

            if (!conversation) {
                throw new Error(`Conversation ${conversationId} non trouvée`);
            }

            return conversation;
        } catch (error) {
            logger.error(`Erreur lors de la récupération de la conversation ${conversationId}:`, error);
            throw error;
        }
    }

    /**
     * Récupère une conversation existante ou en crée une nouvelle si nécessaire
     */
    async getOrCreateConversation(entrepriseId: string, sessionId?: string, metier: Metier = Metier.DEMENAGEMENT) {
        try {
            // 1. Si un sessionId (id de conversation) est fourni, on vérifie s'il existe et est actif
            if (sessionId) {
                const existing = await prisma.conversation.findFirst({
                    where: {
                        id: sessionId,
                        entrepriseId,
                        status: StatusConversation.ACTIVE
                    }
                });

                if (existing) {
                    return { conversationId: existing.id, isNew: false };
                }
            }

            // 2. Sinon, on crée un nouveau Lead "fantôme" et une nouvelle Conversation
            // Note: Dans un flux réel, on récupère souvent la config métier d'abord
            const newLead = await prisma.lead.create({
                data: {
                    entrepriseId,
                    projetData: {} // Initialement vide
                }
            });

            const newConversation = await this.createConversation(newLead.id, entrepriseId, metier);

            return {
                conversationId: newConversation.id,
                isNew: true,
                reply: "Bonjour ! 👋 Je suis Tom, votre assistant déménagement. Comment puis-je vous aider aujourd'hui ?",
                actions: ["Estimation tarifaire", "Calcul du volume", "Informations complémentaires"]
            };
        } catch (error) {
            logger.error('Erreur dans getOrCreateConversation:', error);
            throw error;
        }
    }

    /**
     * Ferme une conversation avec un statut spécifique
     */
    async closeConversation(conversationId: string, status: StatusConversation) {
        try {
            const updated = await prisma.conversation.update({
                where: { id: conversationId },
                data: {
                    status,
                    updatedAt: new Date()
                }
            });

            logger.info(`Conversation ${conversationId} fermée avec le statut: ${status}`);
            return updated;
        } catch (error) {
            logger.error(`Erreur lors de la fermeture de la conversation ${conversationId}:`, error);
            throw error;
        }
    }
}

export const conversationService = new ConversationService();
