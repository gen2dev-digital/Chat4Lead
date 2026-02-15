import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { logger } from './utils/logger';
import { prisma } from './config/database';
import { redis } from './config/redis';
import { config } from './config/env';

import conversationRoutes from './modules/conversation/conversation.routes';

const app = express();

// Middlewares
app.use(cors({
    origin: config.NODE_ENV === 'development' ? '*' : config.ALLOWED_ORIGINS
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
});

// Routes
app.use('/api/conversation', conversationRoutes);
app.use('/api/conversations', conversationRoutes);  // Plural alias for GET listing

// Health check route
app.get('/health', async (req: Request, res: Response) => {
    let databaseStatus = 'disconnected';
    let redisStatus = 'disconnected';

    try {
        await prisma.$queryRaw`SELECT 1`;
        databaseStatus = 'connected';
    } catch (error) {
        logger.error('Health check database error:', error);
    }

    try {
        await redis.ping();
        redisStatus = 'connected';
    } catch (error) {
        logger.error('Health check redis error:', error);
    }

    const overallStatus = (databaseStatus === 'connected' && redisStatus === 'connected') ? 'ok' : 'error';

    res.status(overallStatus === 'ok' ? 200 : 503).json({
        status: overallStatus,
        database: databaseStatus,
        redis: redisStatus,
        timestamp: new Date().toISOString(),
        env: config.NODE_ENV
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', message: `Route ${req.originalUrl} not found` });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: config.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

export default app;
