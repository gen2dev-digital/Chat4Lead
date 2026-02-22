import { LLMMessage, LLMResponse } from './types';
export declare class LLMService {
    private provider;
    constructor();
    generateResponse(systemPrompt: string, messages: LLMMessage[]): Promise<LLMResponse>;
}
export declare const llmService: LLMService;
