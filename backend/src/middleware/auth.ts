import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { logger } from '../utils/logger';
import { Entreprise } from '@prisma/client';

// Extend Express Request type
declare global {
    namespace Express {
        interface Request {
            entreprise?: Entreprise;
        }
    }
}

export const requireApiKey = async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Missing API key' });
    }

    try {
        const cacheKey = `apikey:${apiKey}`;

        // 1. Check Redis Cache
        let entreprise = await cache.get<Entreprise>(cacheKey);

        // 2. Query DB if not in cache
        if (!entreprise) {
            entreprise = await prisma.entreprise.findUnique({
                where: { apiKey },
            });

            if (entreprise) {
                // Cache for 1 hour (3600 seconds)
                await cache.set(cacheKey, entreprise, 3600);
            }
        }

        // 3. Validation
        if (!entreprise) {
            return res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
        }

        if (entreprise.status !== 'ACTIVE' && entreprise.status !== 'TRIAL') {
            return res.status(403).json({ error: 'Forbidden', message: 'Account inactive' });
        }

        // Attach to request
        req.entreprise = entreprise;
        next();
    } catch (error) {
        logger.error('Authentication Error:', error);
        res.status(500).json({ error: 'Internal Server Error', message: 'Authentication process failed' });
    }
};
