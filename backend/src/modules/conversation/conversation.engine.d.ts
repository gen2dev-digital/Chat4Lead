export declare class ConversationEngine {
    /**
     * Traite un message utilisateur et génère une réponse de l'IA
     */
    processMessage(conversationId: string, userContent: string): Promise<{
        message: string;
        latencyMs: number;
        tokensUsed: number | undefined;
    }>;
}
export declare const conversationEngine: ConversationEngine;
