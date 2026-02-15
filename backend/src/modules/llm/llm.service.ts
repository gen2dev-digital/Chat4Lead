import { config } from '../../config/env';
import { logger } from '../../utils/logger';
import { LLMMessage, LLMProvider, LLMResponse } from './types';
import { ClaudeProvider } from './providers/claude.provider';
import { GrokProvider } from './providers/grok.provider';

export class LLMService {
    private provider: LLMProvider;

    constructor() {
        const providerType = config.LLM_PROVIDER;

        if (providerType === 'claude') {
            this.provider = new ClaudeProvider();
        } else {
            this.provider = new GrokProvider();
        }

        logger.info(`LLM Service initialisé avec le provider: ${providerType}`);
    }

    async generateResponse(systemPrompt: string, messages: LLMMessage[]): Promise<LLMResponse> {
        try {
            return await this.provider.generateResponse(systemPrompt, messages);
        } catch (error) {
            logger.error('Erreur LLM Service:', error);
            throw error;
        }
    }
}

export const llmService = new LLMService();
