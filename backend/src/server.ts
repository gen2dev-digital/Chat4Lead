import { createServer } from 'http';
import app from './app';
import { config } from './config/env';
import { logger } from './utils/logger';
import { setupWebSocket } from './modules/conversation/conversation.gateway';

const PORT = config.PORT;

// Créer un serveur HTTP à partir de l'app Express
// pour partager le même port avec Socket.io
const server = createServer(app);

// Initialiser le WebSocket Gateway
const io = setupWebSocket(server);

server.listen(PORT, () => {
    logger.info(`🚀 Server running on http://localhost:${PORT}`);
    logger.info(`🔌 WebSocket server ready on ws://localhost:${PORT}`);
    logger.info(`Environment: ${config.NODE_ENV}`);
});

// ──────────────────────────────────────────
//  GRACEFUL SHUTDOWN
// ──────────────────────────────────────────
const gracefulShutdown = (signal: string) => {
    logger.info(`${signal} received, closing server gracefully...`);
    server.close(() => {
        logger.info('✅ HTTP & WebSocket server closed');
        process.exit(0);
    });

    // Force shutdown après 10s si le serveur ne se ferme pas proprement
    setTimeout(() => {
        logger.error('⚠️ Forced shutdown after timeout');
        process.exit(1);
    }, 10_000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { io };
