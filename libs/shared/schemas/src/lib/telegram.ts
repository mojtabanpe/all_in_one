import * as z from 'zod/mini';

/** Whether the Telegram bot is configured, and whether this account is linked to it (directive 168). */
export interface TelegramStatus {
  available: boolean;
  linked: boolean;
}

export const TELEGRAM_LINK_ENTRIES = ['review_end', 'notify_failed'] as const;
export type TelegramLinkEntry = (typeof TELEGRAM_LINK_ENTRIES)[number];

export const telegramLinkRequestSchema = z.object({
  language: z.optional(z.enum(['fa', 'en'])),
  entry: z.optional(z.enum(TELEGRAM_LINK_ENTRIES)),
});
export type TelegramLinkRequest = z.infer<typeof telegramLinkRequestSchema>;
