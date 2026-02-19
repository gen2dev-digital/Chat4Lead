import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireApiKey } from '../../middleware/auth';
import { conversationService } from './conversation.service';
import { messageHandler } from './message.handler';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { StatusConversation } from '@prisma/client';

const router = Router();

// ──────────────────────────────────────────────
//  ZOD SCHEMAS
// ──────────────────────────────────────────────

const InitConversationSchema = z.object({
    sessionId: z.string().uuid().optional(),
});

const SendMessageSchema = z.object({
    message: z
        .string()
        .min(1, 'Le message ne peut pas être vide')
        .max(2000, 'Le message est trop long (max 2000 caractères)'),
});

const ConversationIdParamSchema = z.object({
    conversationId: z.string().uuid('ID de conversation invalide'),
});

const CloseConversationSchema = z.object({
    status: z.enum(['QUALIFIED', 'ABANDONED', 'CLOSED']),
});

const ListConversationsQuerySchema = z.object({
    status: z.enum(['ACTIVE', 'QUALIFIED', 'ABANDONED', 'CLOSED']).optional(),
    limit: z
        .string()
        .transform(Number)
        .pipe(z.number().min(1).max(100))
        .optional()
        .default('20'),
    offset: z
        .string()
        .transform(Number)
        .pipe(z.number().min(0))
        .optional()
        .default('0'),
});

// ──────────────────────────────────────────────
//  HELPER — Gestion centralisée des erreurs Zod
// ──────────────────────────────────────────────

function handleRouteError(res: Response, error: unknown, context: string) {
    if (error instanceof z.ZodError) {
        return res.status(400).json({
            error: 'Validation error',
            details: error.errors.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            })),
        });
    }

    if (error instanceof Error && error.message.includes('non trouvée')) {
        return res.status(404).json({ error: 'Not found', message: error.message });
    }

    logger.error(`Error in ${context}:`, error);
    return res.status(500).json({
        error: 'Internal Server Error',
        message: `Failed to ${context}`,
    });
}

// ══════════════════════════════════════════════
//  1.  POST /api/conversation/init
//      Initialise ou récupère une conversation
// ══════════════════════════════════════════════

router.post('/init', requireApiKey, async (req: Request, res: Response) => {
    try {
        const { sessionId } = InitConversationSchema.parse(req.body);
        const entrepriseId = req.entreprise!.id;

        const result = await conversationService.getOrCreateConversation(
            entrepriseId,
            sessionId
        );

        logger.info('Conversation initialized', {
            entrepriseId,
            conversationId: result.conversationId,
            isNew: result.isNew,
        });

        res.json(result);
    } catch (error) {
        handleRouteError(res, error, 'initialize conversation');
    }
});

// ══════════════════════════════════════════════
//  2.  POST /api/conversation/:conversationId/message
//      Envoie un message utilisateur
// ══════════════════════════════════════════════

router.post(
    '/:conversationId/message',
    requireApiKey,
    async (req: Request, res: Response) => {
        try {
            const { conversationId } = ConversationIdParamSchema.parse(req.params);
            const { message } = SendMessageSchema.parse(req.body);
            const entrepriseId = req.entreprise!.id;

            // Vérifier ownership
            const conversation = await conversationService.getConversation(conversationId);
            if (conversation.entrepriseId !== entrepriseId) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Traiter le message via le handler central
            const result = await messageHandler.handleUserMessage({
                conversationId,
                entrepriseId,
                message,
            });

            logger.info('Message processed', {
                conversationId,
                score: result.score,
                actionsTriggered: result.actions?.length || 0,
            });

            res.json({
                reply: result.reply,
                score: result.score,
                leadData: result.leadData,
                actions: result.actions,
                metadata: result.metadata,
            });
        } catch (error) {
            handleRouteError(res, error, 'process message');
        }
    }
);

// ══════════════════════════════════════════════
//  3.  GET /api/conversation/:conversationId
//      Récupère une conversation complète
// ══════════════════════════════════════════════

router.get(
    '/:conversationId',
    requireApiKey,
    async (req: Request, res: Response) => {
        try {
            const { conversationId } = ConversationIdParamSchema.parse(req.params);
            const entrepriseId = req.entreprise!.id;

            const conversation = await conversationService.getConversation(conversationId);

            // Sécurité : vérifier ownership
            if (conversation.entrepriseId !== entrepriseId) {
                return res.status(403).json({ error: 'Access denied' });
            }

            res.json(conversation);
        } catch (error) {
            handleRouteError(res, error, 'fetch conversation');
        }
    }
);

// ══════════════════════════════════════════════
//  4.  GET /api/conversations
//      Liste les conversations de l'entreprise
// ══════════════════════════════════════════════
//
//  ⚠️ ATTENTION : cette route est montée sur
//     /api/conversations (avec un "s") dans app.ts
//     pour éviter un conflit avec GET /:conversationId
// ══════════════════════════════════════════════

router.get('/', requireApiKey, async (req: Request, res: Response) => {
    try {
        const parsed = ListConversationsQuerySchema.parse(req.query);
        const entrepriseId = req.entreprise!.id;

        const limitNum = typeof parsed.limit === 'number' ? parsed.limit : 20;
        const offsetNum = typeof parsed.offset === 'number' ? parsed.offset : 0;

        // Construire le filtre
        const where: any = { entrepriseId };
        if (parsed.status) {
            where.status = parsed.status;
        }

        // Requête paginée
        const [conversations, total] = await Promise.all([
            prisma.conversation.findMany({
                where,
                include: {
                    lead: {
                        select: {
                            id: true,
                            prenom: true,
                            nom: true,
                            email: true,
                            telephone: true,
                            score: true,
                            priorite: true,
                            statut: true,
                            projetData: true,
                            createdAt: true,
                        },
                    },
                    _count: {
                        select: { messages: true },
                    },
                },
                orderBy: { updatedAt: 'desc' },
                take: limitNum,
                skip: offsetNum,
            }),
            prisma.conversation.count({ where }),
        ]);

        const hasMore = offsetNum + limitNum < total;

        res.json({
            conversations,
            total,
            hasMore,
            limit: limitNum,
            offset: offsetNum,
        });
    } catch (error) {
        handleRouteError(res, error, 'list conversations');
    }
});

// ══════════════════════════════════════════════
//  5.  PATCH /api/conversation/:conversationId/close
//      Ferme une conversation avec un statut
// ══════════════════════════════════════════════

router.patch(
    '/:conversationId/close',
    requireApiKey,
    async (req: Request, res: Response) => {
        try {
            const { conversationId } = ConversationIdParamSchema.parse(req.params);
            const { status } = CloseConversationSchema.parse(req.body);
            const entrepriseId = req.entreprise!.id;

            // Vérifier ownership
            const conversation = await conversationService.getConversation(conversationId);
            if (conversation.entrepriseId !== entrepriseId) {
                return res.status(403).json({ error: 'Access denied' });
            }

            await conversationService.closeConversation(
                conversationId,
                status as StatusConversation
            );

            logger.info('Conversation closed', { conversationId, status });

            res.json({ success: true, conversationId, status });
        } catch (error) {
            handleRouteError(res, error, 'close conversation');
        }
    }
);

export default router;
