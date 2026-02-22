export interface LLMMessage {
    role: 'user' | 'assistant';
    content: string;
}
export interface LLMResponse {
    content: string;
    tokensUsed?: number;
    latencyMs: number;
}
export interface LLMProvider {
    generateResponse(systemPrompt: string, messages: LLMMessage[]): Promise<LLMResponse>;
}
