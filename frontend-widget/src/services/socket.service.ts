import { io, Socket } from 'socket.io-client';
import type { WidgetConfig, LeadData } from '../types';

// ──────────────────────────────────────────────
//  TYPES — Callbacks WebSocket
// ──────────────────────────────────────────────

interface SocketCallbacks {
    onBotTyping: () => void;
    onBotMessage: (data: {
        reply: string;
        leadData?: LeadData;
        score?: number;
        timestamp: string;
    }) => void;
    onBotError: (data: { error: string }) => void;
    onConnect: () => void;
    onDisconnect: () => void;
    onError: (error: Error) => void;
}

// ──────────────────────────────────────────────
//  SOCKET SERVICE — Communication WebSocket temps réel
// ──────────────────────────────────────────────
//
// Singleton qui gère la connexion Socket.io :
// - Authentification via apiKey dans le handshake
// - Reconnexion automatique (max 5 tentatives)
// - Events : bot-typing, bot-message, bot-error
// - Méthodes : joinConversation, sendMessage, disconnect
//

class SocketService {
    private socket: Socket | null = null;

    private callbacks: Partial<SocketCallbacks> = {};
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;

    // ────────────────────────────────────
    //  CONNEXION
    // ────────────────────────────────────

    /**
     * Initialise et établit la connexion WebSocket.
     * L'apiKey est envoyée dans le handshake pour authentification côté serveur.
     */
    connect(config: WidgetConfig, callbacks: Partial<SocketCallbacks>): void {

        this.callbacks = callbacks;

        const baseUrl = config.apiUrl || 'http://localhost:3000';

        // Déconnecter l'ancienne connexion si elle existe
        if (this.socket) {
            this.socket.disconnect();
        }

        this.socket = io(baseUrl, {
            auth: {
                apiKey: config.apiKey,
            },
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: this.maxReconnectAttempts,
            transports: ['websocket', 'polling'],
        });

        this.setupEventListeners();
    }

    // ────────────────────────────────────
    //  EVENT LISTENERS
    // ────────────────────────────────────

    /**
     * Configure tous les écouteurs d'événements Socket.io.
     */
    private setupEventListeners(): void {
        if (!this.socket) return;

        // ── Connexion réussie ──
        this.socket.on('connect', () => {
            console.log('[SocketService] ✅ Connected', this.socket?.id);
            this.reconnectAttempts = 0;
            this.callbacks.onConnect?.();
        });

        // ── Déconnexion ──
        this.socket.on('disconnect', (reason) => {
            console.log('[SocketService] ❌ Disconnected:', reason);
            this.callbacks.onDisconnect?.();
        });

        // ── Erreur de connexion ──
        this.socket.on('connect_error', (error) => {
            console.error('[SocketService] Connection error:', error.message);
            this.reconnectAttempts++;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('[SocketService] Max reconnection attempts reached');
                this.callbacks.onError?.(
                    new Error('Unable to connect to the server. Please try again later.')
                );
            }
        });

        // ── Bot est en train d'écrire ──
        this.socket.on('bot-typing', () => {
            this.callbacks.onBotTyping?.();
        });

        // ── Réponse du bot ──
        this.socket.on('bot-message', (data) => {
            this.callbacks.onBotMessage?.(data);
        });

        // ── Erreur du bot ──
        this.socket.on('bot-error', (data) => {
            console.error('[SocketService] Bot error:', data.error);
            this.callbacks.onBotError?.(data);
        });
    }

    // ────────────────────────────────────
    //  ACTIONS
    // ────────────────────────────────────

    /**
     * Rejoindre une conversation (room Socket.io).
     * Doit être appelé après la connexion et avant sendMessage.
     */
    joinConversation(conversationId: string): void {
        if (!this.socket?.connected) {
            console.error('[SocketService] Socket not connected, cannot join conversation');
            return;
        }

        this.socket.emit('join-conversation', { conversationId });
        console.log('[SocketService] Joined conversation:', conversationId);
    }

    /**
     * Envoyer un message utilisateur via WebSocket.
     * Le serveur répondra via les events bot-typing puis bot-message.
     */
    sendMessage(conversationId: string, message: string): void {
        if (!this.socket?.connected) {
            throw new Error('Socket not connected');
        }

        this.socket.emit('send-message', { conversationId, message });
        console.log('[SocketService] Message sent:', message.substring(0, 50) + (message.length > 50 ? '...' : ''));
    }

    // ────────────────────────────────────
    //  UTILITAIRES
    // ────────────────────────────────────

    /**
     * Déconnecte proprement le socket.
     */
    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            console.log('[SocketService] Disconnected');
        }
    }

    /**
     * Vérifie si le socket est actuellement connecté.
     */
    isConnected(): boolean {
        return this.socket?.connected || false;
    }

    /**
     * Retourne l'ID unique du socket (utile pour le debugging).
     */
    getSocketId(): string | undefined {
        return this.socket?.id;
    }
}

// ── Export singleton ──
export default new SocketService();
