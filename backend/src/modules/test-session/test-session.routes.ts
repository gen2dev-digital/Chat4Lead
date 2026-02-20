import { Router, Request, Response } from 'express';
import { testSessionService } from './test-session.service';
import { conversationService } from '../conversation/conversation.service';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

const router = Router();

// ══════════════════════════════════════════════
//  POST /api/test-session/start
//  Démarre une session de test manuel
// ══════════════════════════════════════════════

router.post('/start', async (req: Request, res: Response) => {
    try {
        const { phase, testerProfile, conversationId } = req.body;
        if (!phase) return res.status(400).json({ error: 'phase requise' });

        const session = await testSessionService.startSession({ phase, testerProfile, conversationId });
        res.json(session);
    } catch (error) {
        logger.error('Error starting test session:', error);
        res.status(500).json({ error: 'Impossible de démarrer la session' });
    }
});

router.post('/:sessionId/feedback', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { feedback, conversationId } = req.body;

        let conversationData: any = {};
        if (conversationId) {
            try {
                conversationData = await conversationService.getConversation(conversationId);
            } catch (e) {
                logger.warn('Could not fetch conversation data for report', { conversationId });
            }
        }

        const { reportFilename } = await testSessionService.submitFeedback(sessionId, feedback, conversationData);

        res.json({
            success: true,
            reportUrl: `/api/test-session/report/${sessionId}`,
            reportFilename,
        });
    } catch (error: any) {
        logger.error('Error submitting feedback:', error);
        res.status(500).json({ error: 'Impossible d\'enregistrer le feedback' });
    }
});

router.get('/dashboard', async (req: Request, res: Response) => {
    try {
        const testerProfile = req.query.testerProfile as string;
        const data = await testSessionService.getDashboard(testerProfile);
        res.json(data);
    } catch (error) {
        logger.error('Error fetching dashboard:', error);
        res.status(500).json({ error: 'Impossible de charger le dashboard' });
    }
});

router.get('/report/:sessionId', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;

        // On récupère la session pour avoir l'ID de conversation
        const sessions = await testSessionService.getDashboard();
        const session = sessions.sessions.find(s => s.id === sessionId);

        if (!session) return res.status(404).send('Session introuvable');

        let conversationData: any = {};
        try {
            conversationData = await conversationService.getConversation(session.conversationId);
        } catch (e) {
            logger.warn('Could not fetch conversation data for report', { sessionId });
        }

        const html = await testSessionService.generateReportHTML(sessionId, conversationData);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        logger.error('Error generating report:', error);
        res.status(500).send('Erreur lors de la génération du rapport');
    }
});

// ══════════════════════════════════════════════
//  DELETE /api/test-session/:sessionId
//  Supprime une session (ex: sessions "Auto" sans feedback)
// ══════════════════════════════════════════════

router.delete('/:sessionId', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        await prisma.manualTestSession.delete({ where: { id: sessionId } });
        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting test session:', error);
        res.status(500).json({ error: 'Impossible de supprimer la session' });
    }
});

export default router;
