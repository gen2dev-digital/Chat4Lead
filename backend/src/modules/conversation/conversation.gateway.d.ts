import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
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
    'bot-error': (data: {
        error: string;
    }) => void;
}
/** Events envoyés par le client vers le serveur */
export interface ClientToServerEvents {
    'join-conversation': (data: {
        conversationId: string;
    }) => void;
    'send-message': (data: {
        conversationId: string;
        message: string;
    }) => void;
}
/** Events inter-serveurs (vide pour le moment) */
export interface InterServerEvents {
}
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
export declare function setupWebSocket(server: HttpServer): Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
