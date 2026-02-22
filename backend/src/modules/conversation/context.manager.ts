import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { logger } from '../../utils/logger';
import { Message, Lead, RoleMessage, Metier } from '@prisma/client';

export interface ClaudeMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface ConversationContext {
    messages: ClaudeMessage[];
    leadData: Lead | null;
    metier: Metier | string;
}

export class ContextManager {
    async getContext(conversationId: string): Promise<ConversationContext> {
        const cacheKey = `context:${conversationId}`;
        try {
            const cached = await cache.get<ConversationContext>(cacheKey);
            if (cached) return cached;

            const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                include: {
                    lead: true,
                    messages: { take: 24, orderBy: { createdAt: 'asc' } },
                },
            });

            if (!conversation) throw new Error(`Conversation ${conversationId} non trouvée`);

            const context: ConversationContext = {
                messages: this.formatMessagesForClaude(conversation.messages),
                leadData: conversation.lead,
                metier: conversation.metier,
            };

            await cache.set(cacheKey, context, 600);
            return context;
        } catch (error) {
            logger.error(`Erreur getContext:`, error);
            throw error;
        }
    }

    async saveMessage(conversationId: string, role: RoleMessage, content: string, metadata?: { tokensUsed?: number; latencyMs?: number }) {
        try {
            const message = await prisma.message.create({
                data: { conversationId, role, content, tokensUsed: metadata?.tokensUsed, latencyMs: metadata?.latencyMs },
            });
            await this.clearContextCache(conversationId);
            return message;
        } catch (error) {
            logger.error(`Erreur saveMessage:`, error);
            throw error;
        }
    }

    formatMessagesForClaude(messages: Message[]): ClaudeMessage[] {
        return messages
            .filter((m) => m.role !== RoleMessage.system)
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    }

    async clearContextCache(conversationId: string) {
        try {
            await cache.del(`context:${conversationId}`);
        } catch (error) {
            logger.error(`Erreur cache:`, error);
        }
    }

    /**
     * Récupère l'entreprise et sa config métier avec un cache Redis TTL 1h.
     * Les deux requêtes DB sont parallélisées via Promise.all.
     * Utilisé par getFullContext() dans message.handler pour éviter 2 requêtes DB par message.
     */
    async getEntrepriseConfig(entrepriseId: string, metier: Metier | string) {
        const cacheKey = `empresa:${entrepriseId}:${metier}`;
        try {
            const cached = await cache.get<{ entreprise: any; config: any }>(cacheKey);
            if (cached) return cached;

            const [entreprise, config] = await Promise.all([
                prisma.entreprise.findUnique({ where: { id: entrepriseId } }),
                prisma.configMetier.findFirst({ where: { entrepriseId, metier: metier as Metier } }),
            ]);

            const result = { entreprise, config };
            await cache.set(cacheKey, result, 3600); // TTL 1h
            return result;
        } catch (error) {
            logger.error(`Erreur getEntrepriseConfig:`, error);
            throw error;
        }
    }
}

export const contextManager = new ContextManager();
