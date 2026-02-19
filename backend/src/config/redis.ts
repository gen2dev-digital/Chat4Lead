import Redis from 'ioredis';
import { config } from './env';
import { logger } from '../utils/logger';

const isLocalhostRedis = config.REDIS_URL.includes('localhost') || config.REDIS_URL.includes('127.0.0.1');
const shouldConnect = config.NODE_ENV !== 'production' || !isLocalhostRedis;

const redis = shouldConnect
    ? new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        connectTimeout: 5000,
        retryStrategy(times) {
            if (config.NODE_ENV === 'production' && times > 3) return null;
            return Math.min(times * 50, 2000);
        },
    })
    : null;

if (redis) {
    redis.on('connect', () => {
        logger.info('🚀 Redis connected');
    });

    redis.on('error', (err) => {
        logger.error('❌ Redis error:', err);
    });
} else {
    logger.warn('⚠️ Redis connection skipped (localhost detected in production)');
}

export const cache = {
    async get<T>(key: string): Promise<T | null> {
        if (!redis) return null;
        try {
            const data = await redis.get(key);
            return data ? (JSON.parse(data) as T) : null;
        } catch (error) {
            logger.error(`Error getting key ${key} from cache:`, error);
            return null;
        }
    },

    async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
        if (!redis) return;
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
        if (!redis) return;
        try {
            await redis.del(key);
        } catch (error) {
            logger.error(`Error deleting key ${key} from cache:`, error);
        }
    },
};

export { redis };
