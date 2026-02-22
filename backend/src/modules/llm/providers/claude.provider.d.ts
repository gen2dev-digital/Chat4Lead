import { LLMMessage, LLMProvider, LLMResponse } from '../types';
export declare class ClaudeProvider implements LLMProvider {
    private client;
    private model;
    constructor();
    generateResponse(systemPrompt: string, messages: LLMMessage[]): Promise<LLMResponse>;
}
