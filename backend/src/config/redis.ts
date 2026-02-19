import Redis from 'ioredis';
import { config } from './env';
import { logger } from '../utils/logger';

const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 0, // Ne pas bloquer les requêtes si Redis est down
    enableOfflineQueue: false,
    connectTimeout: 5000,
    retryStrategy(times) {
        // Arrêter de réessayer après 3 tentatives en production s'il n'y a pas de Redis
        if (config.NODE_ENV === 'production' && times > 3) return null;
        return Math.min(times * 50, 2000);
    },
});

redis.on('connect', () => {
    logger.info('🚀 Redis connected');
});

redis.on('error', (err) => {
    logger.error('❌ Redis error:', err);
});

export const cache = {
    async get<T>(key: string): Promise<T | null> {
        try {
            const data = await redis.get(key);
            return data ? (JSON.parse(data) as T) : null;
        } catch (error) {
            logger.error(`Error getting key ${key} from cache:`, error);
            return null;
        }
    },

    async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
        try {
            const data = JSON.stringify(value);
            if (ttlSeconds) {
                await redis.set(key, data, 'EX', ttlSeconds);
            } else {
                await redis.set(key, data);
            }
        } catch (error) {
            logger.error(`Error setting key ${key} in cache:`, error);
        }
    },

    async del(key: string): Promise<void> {
        try {
            await redis.del(key);
        } catch (error) {
            logger.error(`Error deleting key ${key} from cache:`, error);
        }
    },
};

export { redis };
