import { Request, Response } from 'express';
import { conversationService } from './conversation.service';
import { logger } from '../../utils/logger';
import { messageHandler } from './message.handler';

export const initConversation = async (req: Request, res: Response) => {
    try {
        const entreprise = req.entreprise;
        if (!entreprise) {
            return res.status(401).json({ error: 'Unauthorized', message: 'Entreprise data missing' });
        }

        const { sessionId, metier } = req.body;

        const result = await conversationService.getOrCreateConversation(
            entreprise.id,
            sessionId,
            metier
        );

        res.status(200).json(result);
    } catch (error) {
        logger.error('Error in initConversation Controller:', error);
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to initialize conversation' });
    }
};

export const handleMessage = async (req: Request, res: Response) => {
    try {
        const entreprise = req.entreprise;
        if (!entreprise) {
            return res.status(401).json({ error: 'Unauthorized', message: 'Entreprise data missing' });
        }

        const { id } = req.params;
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Bad Request', message: 'Message is required' });
        }

        const result = await messageHandler.handleUserMessage({
            conversationId: id,
            entrepriseId: entreprise.id,
            message,
        });

        res.status(200).json({
            message: result.reply,
            score: result.score,
            actions: result.actions,
            metadata: result.metadata,
        });
    } catch (error) {
        logger.error('Error in handleMessage Controller:', error);
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to process message' });
    }
};
