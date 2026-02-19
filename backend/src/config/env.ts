import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    ANTHROPIC_API_KEY: z.string().optional(),
    CLAUDE_MODEL: z.string().default('claude-3-5-sonnet-20240620'),
    GROK_API_KEY: z.string().optional(),
    LLM_PROVIDER: z.enum(['claude', 'grok']).default('claude'),
    PORT: z.preprocess((val) => (val ? Number(val) : undefined), z.number().default(3000)),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    JWT_SECRET: z.string().default('temporary_secret_for_build_purposes_only_change_me'),
    ALLOWED_ORIGINS: z.string().default('*'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('⚠️ Environment validation issue:', JSON.stringify(parsed.error.format(), null, 2));
    // In production, we still want to know if DATABASE_URL is missing
    if (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production') {
        throw new Error('DATABASE_URL is required in production');
    }
}

export const config = parsed.data || envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/postgres',
    JWT_SECRET: process.env.JWT_SECRET || 'temporary_secret_for_build_purposes_only_change_me'
});
