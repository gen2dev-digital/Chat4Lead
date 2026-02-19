import { Router } from 'express';
import { analyticsService } from './analytics.service';
import { logger } from '../../utils/logger';

const router = Router();

router.get('/satisfaction', async (req, res) => {
    try {
        const data = await analyticsService.getSatisfactionRate();
        res.json(data);
    } catch (error) {
        logger.error('Error in /satisfaction route:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/negative-comments', async (req, res) => {
    try {
        const data = await analyticsService.getNegativeComments();
        res.json(data);
    } catch (error) {
        logger.error('Error in /negative-comments route:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
