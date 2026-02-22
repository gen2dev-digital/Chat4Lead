import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { LLMMessage, LLMProvider, LLMResponse, StreamChunkCallback } from '../types';
import { PROMPT_CACHE_SEPARATOR } from '../../prompt/templates/demenagement';

const MAX_TOKENS = 900;

type SystemBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };

/**
 * Construit le tableau de blocs système pour Anthropic.
 * Si le prompt contient le séparateur static/dynamic, le bloc statique est marqué
 * avec `cache_control: { type: "ephemeral" }` pour activer le prompt caching Anthropic
 * (économise ~60-80% du temps de traitement des tokens d'entrée sur les requêtes répétées).
 */
function buildSystemBlocks(systemPrompt: string): SystemBlock[] {
    const sepIdx = systemPrompt.indexOf(PROMPT_CACHE_SEPARATOR);
    if (sepIdx !== -1) {
        const staticPart = systemPrompt.substring(0, sepIdx).trim();
        const dynamicPart = systemPrompt.substring(sepIdx + PROMPT_CACHE_SEPARATOR.length).trim();
        return [
            { type: 'text', text: staticPart, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: dynamicPart },
        ];
    }
    return [{ type: 'text', text: systemPrompt }];
}

/**
 * Filtre les chunks de streaming pour ne pas émettre le bloc DATA JSON
 * qui se trouve à la fin de chaque réponse LLM.
 */
class DataBlockFilter {
    private readonly MARKER = '<!--DATA:';
    private pendingBuffer = '';
    private dataStarted = false;

    process(chunk: string, emit: (text: string) => void): void {
        if (this.dataStarted) return;

        this.pendingBuffer += chunk;

        const dataIdx = this.pendingBuffer.indexOf(this.MARKER);
        if (dataIdx !== -1) {
            this.dataStarted = true;
            const toEmit = this.pendingBuffer.substring(0, dataIdx).trimEnd();
            if (toEmit) emit(toEmit);
        } else {
            // Émettre tout sauf les derniers (markerLength - 1) caractères (pour gérer les chunks coupés)
            const safeLength = Math.max(0, this.pendingBuffer.length - (this.MARKER.length - 1));
            if (safeLength > 0) {
                emit(this.pendingBuffer.substring(0, safeLength));
                this.pendingBuffer = this.pendingBuffer.substring(safeLength);
            }
        }
    }

    flush(emit: (text: string) => void): void {
        if (!this.dataStarted && this.pendingBuffer.trim()) {
            emit(this.pendingBuffer);
        }
        this.pendingBuffer = '';
    }
}

export class ClaudeProvider implements LLMProvider {
    private client: Anthropic;
    private model: string;

    constructor() {
        this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 30000 });
        this.model = config.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
    }

    /**
     * Génération classique (non-streaming) avec prompt caching.
     */
    async generateResponse(
        systemPrompt: string,
        messages: LLMMessage[]
    ): Promise<LLMResponse> {
        const startTime = Date.now();
        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: MAX_TOKENS,
                system: buildSystemBlocks(systemPrompt) as any,
                messages: messages.map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                })),
            });

            const content = response.content[0];
            if (content.type !== 'text') throw new Error('Unexpected response type');

            const latencyMs = Date.now() - startTime;
            const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
            logger.info(`[Claude] Non-streaming. Latency: ${latencyMs}ms. Tokens: ${tokensUsed}`);

            return { content: content.text, tokensUsed, latencyMs };
        } catch (error) {
            logger.error('Claude API error', { error });
            throw error;
        }
    }

    /**
     * Génération en streaming avec prompt caching.
     * Chaque chunk de texte visible est transmis via onChunk.
     * Le bloc DATA JSON est filtré et non émis au client.
     */
    async streamResponse(
        systemPrompt: string,
        messages: LLMMessage[],
        onChunk: StreamChunkCallback
    ): Promise<LLMResponse> {
        const startTime = Date.now();
        const filter = new DataBlockFilter();
        let fullContent = '';

        try {
            const stream = this.client.messages.stream({
                model: this.model,
                max_tokens: MAX_TOKENS,
                system: buildSystemBlocks(systemPrompt) as any,
                messages: messages.map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                })),
            });

            for await (const event of stream) {
                if (
                    event.type === 'content_block_delta' &&
                    event.delta.type === 'text_delta'
                ) {
                    const text = event.delta.text;
                    fullContent += text;
                    filter.process(text, onChunk);
                }
            }

            filter.flush(onChunk);

            const finalMsg = await stream.finalMessage();
            const latencyMs = Date.now() - startTime;
            const tokensUsed = finalMsg.usage.input_tokens + finalMsg.usage.output_tokens;
            logger.info(`[Claude] Streaming done. Latency: ${latencyMs}ms. Tokens: ${tokensUsed}`);

            return { content: fullContent, tokensUsed, latencyMs };
        } catch (error) {
            logger.error('Claude streaming error', { error });
            throw error;
        }
    }
}
