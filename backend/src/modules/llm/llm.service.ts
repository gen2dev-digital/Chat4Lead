import { config } from '../../config/env';
import { logger } from '../../utils/logger';
import { LLMMessage, LLMProvider, LLMResponse } from './types';
import { ClaudeProvider } from './providers/claude.provider';
import { GrokProvider } from './providers/grok.provider';

export class LLMService {
    private provider: LLMProvider;

    constructor() {
        const providerName = config.LLM_PROVIDER || 'claude';

        switch (providerName) {
            case 'claude':
                this.provider = new ClaudeProvider();
                logger.info('✅ LLM Provider: Claude');
                break;
            case 'grok':
                this.provider = new GrokProvider();
                logger.info('⚠️ LLM Provider: Grok');
                break;
            default:
                this.provider = new ClaudeProvider();
                logger.info('✅ LLM Provider: Claude (default)');
        }
    }

    async generateResponse(systemPrompt: string, messages: LLMMessage[]): Promise<LLMResponse> {
        let lastError: any;
        const maxRetries = 2;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    logger.warn(`🔄 LLM Retry attempt ${attempt}/${maxRetries}...`);
                    // Wait a bit before retrying (backoff)
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
                return await this.provider.generateResponse(systemPrompt, messages);
            } catch (error: any) {
                lastError = error;
                const errorMessage = error instanceof Error ? error.message : String(error);

                // Retry only if it's a timeout or a potentially transient network error
                const isTimeout = errorMessage.toLowerCase().includes('timeout') || error.code === 'ETIMEDOUT';
                const isOverloaded = errorMessage.toLowerCase().includes('overloaded') || error.status === 529 || error.status === 429;

                if (isTimeout || isOverloaded) {
                    logger.warn(`⚠️ LLM Attempt ${attempt + 1} failed: ${errorMessage}`);
                    continue;
                }

                // For other errors, throw immediately
                throw error;
            }
        }

        logger.error('❌ LLM Service failed after all retries:', lastError);
        throw lastError;
    }
}

export const llmService = new LLMService();
