import { Router, Request, Response } from 'express';
import { testSessionService } from './test-session.service';
import { conversationService } from '../conversation/conversation.service';
import { logger } from '../../utils/logger';

const router = Router();

// ══════════════════════════════════════════════
//  POST /api/test-session/start
//  Démarre une session de test manuel
// ══════════════════════════════════════════════

router.post('/start', async (req: Request, res: Response) => {
    try {
        const { phase, testerProfile, conversationId } = req.body;

        if (!phase || !['phase1', 'phase2', 'phase3'].includes(phase)) {
            return res.status(400).json({ error: 'phase doit être "phase1", "phase2" ou "phase3"' });
        }
        if (!conversationId) {
            return res.status(400).json({ error: 'conversationId requis' });
        }

        const session = testSessionService.startSession({ phase, testerProfile, conversationId });

        logger.info('Manual test session started', { sessionId: session.sessionId, phase });

        res.json({ sessionId: session.sessionId });
    } catch (error) {
        logger.error('Error starting test session:', error);
        res.status(500).json({ error: 'Impossible de démarrer la session' });
    }
});

// ══════════════════════════════════════════════
//  POST /api/test-session/:sessionId/feedback
//  Enregistre le feedback et génère le rapport
// ══════════════════════════════════════════════

router.post('/:sessionId/feedback', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { feedback, conversationId } = req.body;

        if (!feedback) {
            return res.status(400).json({ error: 'feedback requis' });
        }
        if (!conversationId) {
            return res.status(400).json({ error: 'conversationId requis' });
        }

        // Récupérer les données de conversation pour le rapport
        let conversationData: any = {};
        try {
            conversationData = await conversationService.getConversation(conversationId);
        } catch (e) {
            logger.warn('Could not fetch conversation data for report', { conversationId });
        }

        const { reportFilename } = await testSessionService.submitFeedback(
            sessionId,
            feedback,
            conversationData
        );

        logger.info('Manual test feedback submitted', { sessionId, reportFilename });

        res.json({
            success: true,
            reportUrl: `/tests/reports/${reportFilename}`,
            reportFilename,
        });
    } catch (error: any) {
        logger.error('Error submitting feedback:', error);
        if (error.message?.includes('introuvable')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: 'Impossible d\'enregistrer le feedback' });
    }
});

// ══════════════════════════════════════════════
//  GET /api/test-session/dashboard
//  Données agrégées pour le dashboard de synthèse
// ══════════════════════════════════════════════

router.get('/dashboard', async (_req: Request, res: Response) => {
    try {
        const data = testSessionService.getDashboard();
        res.json(data);
    } catch (error) {
        logger.error('Error fetching dashboard:', error);
        res.status(500).json({ error: 'Impossible de charger le dashboard' });
    }
});

export default router;
