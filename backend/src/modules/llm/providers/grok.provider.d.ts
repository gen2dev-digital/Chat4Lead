import { LLMMessage, LLMProvider, LLMResponse } from '../types';
export declare class GrokProvider implements LLMProvider {
    private client;
    constructor();
    generateResponse(systemPrompt: string, messages: LLMMessage[]): Promise<LLMResponse>;
}
