import { Message, Lead, RoleMessage, Metier } from '@prisma/client';
export interface ClaudeMessage {
    role: 'user' | 'assistant';
    content: string;
}
export interface ConversationContext {
    messages: ClaudeMessage[];
    leadData: Lead | null;
    metier: Metier | string;
}
export declare class ContextManager {
    getContext(conversationId: string): Promise<ConversationContext>;
    saveMessage(conversationId: string, role: RoleMessage, content: string, metadata?: {
        tokensUsed?: number;
        latencyMs?: number;
    }): Promise<{
        id: string;
        createdAt: Date;
        conversationId: string;
        role: import(".prisma/client").$Enums.RoleMessage;
        content: string;
        tokensUsed: number | null;
        latencyMs: number | null;
    }>;
    formatMessagesForClaude(messages: Message[]): ClaudeMessage[];
    clearContextCache(conversationId: string): Promise<void>;
}
export declare const contextManager: ContextManager;
