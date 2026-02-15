import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { LLMMessage, LLMProvider, LLMResponse } from '../types';

export class ClaudeProvider implements LLMProvider {
    private client: Anthropic;

    constructor() {
        this.client = new Anthropic({
            apiKey: config.ANTHROPIC_API_KEY,
        });
    }

    async generateResponse(
        systemPrompt: string,
        messages: LLMMessage[]
    ): Promise<LLMResponse> {
        const startTime = Date.now();
        let retries = 0;
        const maxRetries = 1;

        while (retries <= maxRetries) {
            try {
                const response = await this.client.messages.create({
                    model: 'claude-3-5-sonnet-20241022', // Note: Ajusté car la version 4.5 n'existe par encore réellement en API SDK
                    max_tokens: 1024,
                    system: systemPrompt,
                    messages: messages.map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                    temperature: 0.7,
                });

                const latencyMs = Date.now() - startTime;
                const content = response.content[0].type === 'text' ? response.content[0].text : '';
                const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

                logger.info(`[Claude] Response generated. Latency: ${latencyMs}ms. Tokens: ${tokensUsed}`);

                return {
                    content,
                    tokensUsed,
                    latencyMs,
                };
            } catch (error: any) {
                if (error.status === 429 && retries < maxRetries) {
                    logger.warn(`[Claude] Rate limit hit, retrying in 2s...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    retries++;
                    continue;
                }

                logger.error('[Claude] Error generating response:', error);
                throw error;
            }
        }

        throw new Error('[Claude] Failed to generate response after retries');
    }
}
