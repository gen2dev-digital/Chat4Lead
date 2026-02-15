import OpenAI from 'openai';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { LLMMessage, LLMProvider, LLMResponse } from '../types';

export class GrokProvider implements LLMProvider {
    private client: OpenAI;

    constructor() {
        this.client = new OpenAI({
            apiKey: config.GROK_API_KEY,
            baseURL: 'https://api.groq.com/openai/v1',
        });
    }

    async generateResponse(
        systemPrompt: string,
        messages: LLMMessage[]
    ): Promise<LLMResponse> {
        const startTime = Date.now();

        try {
            const response = await this.client.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages.map(m => ({
                        role: m.role as 'user' | 'assistant',
                        content: m.content
                    }))
                ],
                temperature: 0.7,
                max_tokens: 1024,
            });

            const latencyMs = Date.now() - startTime;
            const content = response.choices[0]?.message?.content || '';
            const tokensUsed = response.usage?.total_tokens;

            logger.info(`[Grok] Response generated. Latency: ${latencyMs}ms. Tokens: ${tokensUsed}`);

            return {
                content,
                tokensUsed,
                latencyMs,
            };
        } catch (error) {
            logger.error('[Grok] Error generating response:', error);
            throw error;
        }
    }
}
