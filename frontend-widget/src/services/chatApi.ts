/**
 * Chat4Lead API Service
 * Handles all communication with the backend API
 */

export interface InitResponse {
    conversationId: string;
    isNew: boolean;
}

export interface MessageResponse {
    message: string;
    latencyMs?: number;
    tokensUsed?: number;
}

export class ChatApiService {
    private baseUrl: string;
    private apiKey: string;

    constructor(baseUrl: string, apiKey: string) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.apiKey = apiKey;
    }

    /**
     * Initialize a new conversation
     */
    async initConversation(): Promise<InitResponse> {
        const response = await fetch(`${this.baseUrl}/api/conversation/init`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
            },
            body: JSON.stringify({}),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `Failed to init conversation (${response.status})`);
        }

        return response.json();
    }

    /**
     * Send a message to the conversation and get a response
     */
    async sendMessage(conversationId: string, message: string): Promise<MessageResponse> {
        const response = await fetch(`${this.baseUrl}/api/conversation/${conversationId}/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
            },
            body: JSON.stringify({ message }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `Failed to send message (${response.status})`);
        }

        return response.json();
    }
}
