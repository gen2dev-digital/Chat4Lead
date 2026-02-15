import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { messageHandler } from './message.handler';

// ──────────────────────────────────────────────
//  TYPES — Typage strict des events Socket.io
// ──────────────────────────────────────────────

/** Données attachées à chaque socket après authentification */
export interface SocketData {
    entrepriseId: string;
    entreprise?: {
        id: string;
        nom: string;
        apiKey: string;
        status: string;
        [key: string]: any;
    };
}

/** Events émis par le serveur vers le client */
export interface ServerToClientEvents {
    'bot-typing': () => void;
    'bot-message': (data: {
        reply: string;
        leadData?: any;
        score?: number;
        timestamp: string;
    }) => void;
    'bot-error': (data: { error: string }) => void;
}

/** Events envoyés par le client vers le serveur */
export interface ClientToServerEvents {
    'join-conversation': (data: { conversationId: string }) => void;
    'send-message': (data: { conversationId: string; message: string }) => void;
}

/** Events inter-serveurs (vide pour le moment) */
export interface InterServerEvents { }

// ──────────────────────────────────────────────
//  WEBSOCKET GATEWAY
// ──────────────────────────────────────────────

/**
 * Initialise le serveur WebSocket Socket.io sur le serveur HTTP existant.
 *
 * Fonctionnalités :
 * - Authentification via apiKey dans handshake.auth
 * - Rooms pour isolation des conversations
 * - Events typés : join-conversation, send-message
 * - Feedback temps réel : bot-typing, bot-message, bot-error
 * - Logs détaillés et gestion complète des erreurs
 */
export function setupWebSocket(server: HttpServer) {
    const io = new Server<
        ClientToServerEvents,
        ServerToClientEvents,
        InterServerEvents,
        SocketData
    >(server, {
        cors: {
            origin: '*', // En production : restreindre aux domaines autorisés
            methods: ['GET', 'POST'],
        },
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    logger.info('✅ WebSocket server initialized');

    // ──────────────────────────────────────────
    //  MIDDLEWARE D'AUTHENTIFICATION
    // ──────────────────────────────────────────
    io.use(async (socket, next) => {
        try {
            const apiKey = socket.handshake.auth.apiKey as string;

            if (!apiKey) {
                logger.warn('Socket connection rejected: Missing API key', {
                    socketId: socket.id,
                });
                return next(new Error('Authentication error: Missing API key'));
            }

            // Vérifier l'API key dans la base de données
            const entreprise = await prisma.entreprise.findUnique({
                where: { apiKey },
            });

            if (!entreprise) {
                logger.warn('Socket connection rejected: Invalid API key', {
                    socketId: socket.id,
                });
                return next(new Error('Authentication error: Invalid API key'));
            }

            if (entreprise.status !== 'ACTIVE' && entreprise.status !== 'TRIAL') {
                logger.warn('Socket connection rejected: Inactive account', {
                    socketId: socket.id,
                    entrepriseId: entreprise.id,
                    status: entreprise.status,
                });
                return next(new Error('Authentication error: Account inactive'));
            }

            // Attacher les données de l'entreprise au socket
            socket.data.entrepriseId = entreprise.id;
            socket.data.entreprise = entreprise as SocketData['entreprise'];

            logger.info('Socket authenticated', {
                socketId: socket.id,
                entrepriseId: entreprise.id,
                entreprise: entreprise.nom,
            });

            next();
        } catch (error) {
            logger.error('Socket authentication error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                socketId: socket.id,
            });
            next(new Error('Authentication failed'));
        }
    });

    // ──────────────────────────────────────────
    //  CONNEXION D'UN CLIENT
    // ──────────────────────────────────────────
    io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
        logger.info('Client connected', {
            socketId: socket.id,
            entrepriseId: socket.data.entrepriseId,
        });

        // ────────────────────────────────────
        //  EVENT: join-conversation
        //  Le client rejoint une room pour recevoir les messages
        // ────────────────────────────────────
        socket.on('join-conversation', async ({ conversationId }) => {
            try {
                logger.info('Client joining conversation', {
                    socketId: socket.id,
                    conversationId,
                });

                // Validation de l'input
                if (!conversationId || typeof conversationId !== 'string') {
                    socket.emit('bot-error', { error: 'Invalid conversation ID' });
                    return;
                }

                // Vérifier que la conversation existe
                const conversation = await prisma.conversation.findUnique({
                    where: { id: conversationId },
                });

                if (!conversation) {
                    socket.emit('bot-error', { error: 'Conversation not found' });
                    return;
                }

                // Vérifier que la conversation appartient à cette entreprise
                if (conversation.entrepriseId !== socket.data.entrepriseId) {
                    logger.warn('Access denied: conversation ownership mismatch', {
                        socketId: socket.id,
                        conversationId,
                        requestedBy: socket.data.entrepriseId,
                        ownedBy: conversation.entrepriseId,
                    });
                    socket.emit('bot-error', { error: 'Access denied' });
                    return;
                }

                // Rejoindre la room Socket.io
                socket.join(conversationId);

                logger.info('Client joined conversation room', {
                    socketId: socket.id,
                    conversationId,
                });
            } catch (error) {
                logger.error('Error joining conversation', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    socketId: socket.id,
                    conversationId,
                });
                socket.emit('bot-error', { error: 'Failed to join conversation' });
            }
        });

        // ────────────────────────────────────
        //  EVENT: send-message
        //  Le client envoie un message utilisateur
        // ────────────────────────────────────
        socket.on('send-message', async ({ conversationId, message }) => {
            try {
                logger.info('Message received via WebSocket', {
                    socketId: socket.id,
                    conversationId,
                    messageLength: message?.length ?? 0,
                });

                // ── Validations ──

                if (!conversationId || typeof conversationId !== 'string') {
                    socket.emit('bot-error', { error: 'Invalid conversation ID' });
                    return;
                }

                if (!message || typeof message !== 'string' || message.trim().length === 0) {
                    socket.emit('bot-error', { error: 'Message cannot be empty' });
                    return;
                }

                if (message.length > 2000) {
                    socket.emit('bot-error', { error: 'Message too long (max 2000 characters)' });
                    return;
                }

                // ── Vérification ownership ──

                const conversation = await prisma.conversation.findUnique({
                    where: { id: conversationId },
                });

                if (!conversation) {
                    socket.emit('bot-error', { error: 'Conversation not found' });
                    return;
                }

                if (conversation.entrepriseId !== socket.data.entrepriseId) {
                    logger.warn('Access denied: conversation ownership mismatch', {
                        socketId: socket.id,
                        conversationId,
                        requestedBy: socket.data.entrepriseId,
                        ownedBy: conversation.entrepriseId,
                    });
                    socket.emit('bot-error', { error: 'Access denied' });
                    return;
                }

                // ── Feedback immédiat : bot est en train de taper ──
                socket.emit('bot-typing');

                // ── Traitement du message via le handler ──
                const result = await messageHandler.handleUserMessage({
                    conversationId,
                    entrepriseId: socket.data.entrepriseId,
                    message: message.trim(),
                });

                // ── Émettre la réponse du bot ──
                socket.emit('bot-message', {
                    reply: result.reply,
                    leadData: result.leadData,
                    score: result.score,
                    timestamp: new Date().toISOString(),
                });

                logger.info('Message processed and sent via WebSocket', {
                    socketId: socket.id,
                    conversationId,
                    score: result.score,
                    replyLength: result.reply.length,
                });
            } catch (error) {
                logger.error('Error processing WebSocket message', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined,
                    socketId: socket.id,
                    conversationId,
                });

                socket.emit('bot-error', {
                    error: "Désolé, j'ai rencontré un problème. Pouvez-vous réessayer ?",
                });
            }
        });

        // ────────────────────────────────────
        //  DÉCONNEXION
        // ────────────────────────────────────
        socket.on('disconnect', (reason) => {
            logger.info('Client disconnected', {
                socketId: socket.id,
                entrepriseId: socket.data.entrepriseId,
                reason,
            });
        });

        // ────────────────────────────────────
        //  ERREUR SUR LE SOCKET
        // ────────────────────────────────────
        socket.on('error', (error) => {
            logger.error('Socket error', {
                socketId: socket.id,
                entrepriseId: socket.data.entrepriseId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        });
    });

    return io;
}
