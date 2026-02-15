import { WidgetConfig } from '../types';

// ──────────────────────────────────────────────
//  TYPES — Réponses API
// ──────────────────────────────────────────────

export interface InitConversationResponse {
    conversationId: string;
    isNew: boolean;
}

export interface SendMessageResponse {
    reply: string;
    leadData?: any;
    score?: number;
    actions?: string[];
}

// ──────────────────────────────────────────────
//  API SERVICE — Communication REST avec le backend
// ──────────────────────────────────────────────
//
// Utilisé pour :
// - Initialiser une conversation (POST /api/conversation/init)
// - Envoyer un message en fallback REST si WebSocket indisponible
// - Récupérer l'historique d'une conversation
//

class ApiService {
    private baseUrl: string;
    private apiKey: string;

    constructor(config: WidgetConfig) {
        this.baseUrl = config.apiUrl || 'http://localhost:3000';
        this.apiKey = config.apiKey;
    }

    // ────────────────────────────────────
    //  INIT CONVERSATION
    // ────────────────────────────────────

    /**
     * Initialise ou récupère une conversation existante.
     * Le backend crée un lead associé si nécessaire.
     */
    async initConversation(sessionId?: string): Promise<InitConversationResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/conversation/init`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                },
                body: JSON.stringify({ sessionId }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to initialize conversation');
            }

            return await response.json();
        } catch (error) {
            console.error('[ApiService] Error initializing conversation:', error);
            throw error;
        }
    }

    // ────────────────────────────────────
    //  SEND MESSAGE (REST fallback)
    // ────────────────────────────────────

    /**
     * Envoie un message via REST.
     * Utilisé comme fallback si la connexion WebSocket est indisponible.
     */
    async sendMessage(
        conversationId: string,
        message: string
    ): Promise<SendMessageResponse> {
        try {
            const response = await fetch(
                `${this.baseUrl}/api/conversation/${conversationId}/message`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': this.apiKey,
                    },
                    body: JSON.stringify({ message }),
                }
            );

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to send message');
            }

            return await response.json();
        } catch (error) {
            console.error('[ApiService] Error sending message:', error);
            throw error;
        }
    }

    // ────────────────────────────────────
    //  GET CONVERSATION (historique)
    // ────────────────────────────────────

    /**
     * Récupère l'historique complet d'une conversation.
     * Utile pour restaurer les messages après un rechargement de page.
     */
    async getConversation(conversationId: string): Promise<any> {
        try {
            const response = await fetch(
                `${this.baseUrl}/api/conversation/${conversationId}`,
                {
                    headers: {
                        'x-api-key': this.apiKey,
                    },
                }
            );

            if (!response.ok) {
                throw new Error('Failed to fetch conversation');
            }

            return await response.json();
        } catch (error) {
            console.error('[ApiService] Error fetching conversation:', error);
            throw error;
        }
    }
}

export default ApiService;
