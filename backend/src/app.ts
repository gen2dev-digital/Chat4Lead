import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { logger } from './utils/logger';
import { prisma } from './config/database';
import { redis } from './config/redis';
import { config } from './config/env';

import conversationRoutes from './modules/conversation/conversation.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import testSessionRoutes from './modules/test-session/test-session.routes';

const app = express();

// Middlewares
app.use(cors({
    origin: config.NODE_ENV === 'development' ? '*' : config.ALLOWED_ORIGINS
}));
app.use(express.json());

// Serve test pages statically (phase2.html, phase3.html, dashboard, reports)
app.use('/tests', express.static(path.join(process.cwd(), 'tests')));

// Request logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
});

// Routes
app.get('/api/ping', (req, res) => res.json({ status: 'ok', timestamp: new Date(), env: config.NODE_ENV }));

app.use('/api/conversation', conversationRoutes);
app.use('/api/conversations', conversationRoutes);  // Plural alias for GET listing
app.use('/api/analytics', analyticsRoutes);
app.use('/api/test-session', testSessionRoutes);  // Manual test sessions (no auth)

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

    if (redis) {
        try {
            await redis.ping();
            redisStatus = 'connected';
        } catch (error) {
            logger.error('Health check redis error:', error);
        }
    } else {
        redisStatus = 'disabled';
    }

    const overallStatus = (databaseStatus === 'connected') ? 'ok' : 'error';

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
        message: err.message,
        stack: config.NODE_ENV === 'development' ? err.stack : undefined
    });
});

export default app;
