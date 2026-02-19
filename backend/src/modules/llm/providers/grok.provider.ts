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
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
            const startTime = Date.now();
            try {
                const response = await this.client.chat.completions.create({
                    model: 'llama-3.1-8b-instant',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...messages.map(m => ({
                            role: m.role as 'user' | 'assistant',
                            content: m.content
                        }))
                    ],
                    temperature: 0.7,
                    max_tokens: 300,
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
            } catch (error: any) {
                attempts++;
                if (error?.status === 429 && attempts < maxAttempts) {
                    const waitTime = attempts * 5000; // 5s, 10s...
                    logger.warn(`[Grok] Rate limit hit (429). Retrying in ${waitTime}ms... (Attempt ${attempts}/${maxAttempts})`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                }
                logger.error('[Grok] Error generating response:', error);
                throw error;
            }
        }
        throw new Error('Max attempts reached for LLM generation');
    }
}
