import * as z from 'zod/mini';

/** Whether the Telegram bot is configured, and whether this account is linked to it (directive 168). */
export interface TelegramStatus {
  available: boolean;
  linked: boolean;
}

export const telegramLinkRequestSchema = z.object({
  language: z.optional(z.enum(['fa', 'en'])),
});
export type TelegramLinkRequest = z.infer<typeof telegramLinkRequestSchema>;
