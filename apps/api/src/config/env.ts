import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32),

  /** Origins of the web apps (comma-separated); the first is used in email links. */
  APP_ORIGINS: z.string().optional(),
  APP_PUBLIC_URL: z.url().optional(),

  // English applet: 9Router gateway (chat, text-to-speech, speech-to-text). Unset = feature off.
  AI_URL: z.url().optional(),
  AI_MODEL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  TTS_URL: z.url().optional(),
  TTS_MODEL: z.string().optional(),
  TTS_SECONDARY_MODEL: z.string().optional(),
  TTS_API_KEY: z.string().optional(),
  TTS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  STT_URL: z.url().optional(),
  STT_MODEL: z.string().optional(),
  STT_API_KEY: z.string().optional(),
  /** Optional Redis for the speech audio cache. */
  REDIS_URL: z.string().optional(),

  // Email (password reset, verification). Without SMTP_URL, development logs emails.
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  REQUIRE_EMAIL_VERIFICATION: z.enum(['true', 'false']).optional(),

  // ChatGPT connection (MCP)
  MCP_PUBLIC_URL: z.url().optional(),
  MCP_REDIRECT_HOSTS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
