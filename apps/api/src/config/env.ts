import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  /** Interface to listen on; 127.0.0.1 behind a reverse proxy. */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  API_HOST: z.string().optional(),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32),

  /** Origins of the web apps (comma-separated); the first is used in email links. */
  APP_ORIGINS: z.string().optional(),
  APP_PUBLIC_URL: z.url().optional(),

  // AI: each user sets their own OpenAI-compatible chat / TTS / STT urls in the profile.
  /** Let those urls reach private addresses (e.g. a local gateway on a single-user server). */
  AI_ALLOW_PRIVATE_URLS: z.enum(['true', 'false']).optional(),
  /** 32 random bytes (base64) to encrypt the users' AI keys; derived from JWT_SECRET if unset. */
  AI_KEYS_SECRET: z.string().optional(),
  TTS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  /** Optional Redis for the speech audio cache. */
  REDIS_URL: z.string().optional(),

  // Email (password reset, verification). Without SMTP_URL, development logs emails.
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  REQUIRE_EMAIL_VERIFICATION: z.enum(['true', 'false']).optional(),

  // ChatGPT connection (MCP)
  MCP_PUBLIC_URL: z.url().optional(),
  MCP_REDIRECT_HOSTS: z.string().optional(),

  /** Planner: let calendar feeds reach private addresses (local testing only). */
  PLANNER_ICS_ALLOW_PRIVATE: z.enum(['true', 'false']).optional(),
});

export type Env = z.infer<typeof envSchema>;
