import { PrismaClient } from '@prisma/client';
import { config } from './env';
import { logger } from '../utils/logger';

// In serverless (Vercel), pgBouncer requires connection_limit=1 to avoid pool exhaustion
const buildDatasourceUrl = () => {
    const url = process.env.DATABASE_URL ?? '';
    if (config.NODE_ENV === 'production' && url.includes('pgbouncer=true') && !url.includes('connection_limit')) {
        return url + '&connection_limit=1';
    }
    return url;
};

const prismaClientSingleton = () => {
    return new PrismaClient({
        log: config.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
        datasources: config.NODE_ENV === 'production'
            ? { db: { url: buildDatasourceUrl() } }
            : undefined,
    });
};

declare global {
    var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prisma ?? prismaClientSingleton();

export { prisma };

if (config.NODE_ENV !== 'production') globalThis.prisma = prisma;

// Graceful shutdown
process.on('beforeExit', async () => {
    logger.info('Shutting down Prisma client...');
    await prisma.$disconnect();
});
