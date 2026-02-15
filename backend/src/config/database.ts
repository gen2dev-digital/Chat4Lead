import { PrismaClient } from '@prisma/client';
import { config } from './env';
import { logger } from '../utils/logger';

const prismaClientSingleton = () => {
    return new PrismaClient({
        log: config.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
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
