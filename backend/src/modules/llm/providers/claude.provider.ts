import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { LLMMessage, LLMProvider, LLMResponse } from '../types';

export class ClaudeProvider implements LLMProvider {
    private client: Anthropic;
    private model: string;

    constructor() {
        this.client = new Anthropic({
            apiKey: config.ANTHROPIC_API_KEY,
        });
        this.model = config.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
    }

    async generateResponse(
        systemPrompt: string,
        messages: LLMMessage[]
    ): Promise<LLMResponse> {
        const startTime = Date.now();

        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: 1024,
                system: systemPrompt,
                messages: messages.map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                })),
            });

            const content = response.content[0];
            if (content.type !== 'text') {
                throw new Error('Unexpected response type');
            }

            const latencyMs = Date.now() - startTime;
            const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

            logger.info(`[Claude] Response generated. Latency: ${latencyMs}ms. Tokens: ${tokensUsed}`);

            return {
                content: content.text,
                tokensUsed,
                latencyMs,
            };
        } catch (error) {
            logger.error('Claude API error', { error });
            throw error;
        }
    }
}
