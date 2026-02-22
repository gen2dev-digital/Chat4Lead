export interface LLMMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface LLMResponse {
    content: string;
    tokensUsed?: number;
    latencyMs: number;
}

export type StreamChunkCallback = (chunk: string) => void;

export interface LLMProvider {
    generateResponse(
        systemPrompt: string,
        messages: LLMMessage[]
    ): Promise<LLMResponse>;

    /** Optionnel : streaming avec callback par chunk de texte */
    streamResponse?(
        systemPrompt: string,
        messages: LLMMessage[],
        onChunk: StreamChunkCallback
    ): Promise<LLMResponse>;
}
