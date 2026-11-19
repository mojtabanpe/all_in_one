import { ConfigService } from '@nestjs/config';

/** Inline keyboard button: a link or a callback (≤ 64 bytes of data). */
export type TelegramButton =
  { text: string; url: string } | { text: string; callback_data: string };

/**
 * Bot API calls (directive 168). The server in Iran cannot reach `api.telegram.org`, so production sets
 * `TELEGRAM_API_URL` to the relay (`deploy/telegram-relay`), which forwards the call unchanged and checks
 * `X-Relay-Key`. The token travels in the path as Telegram expects; neither side logs it.
 */
export class TelegramApi {
  private readonly token?: string;
  private readonly base: string;
  private readonly relayKey?: string;

  constructor(config: ConfigService) {
    this.token = config.get<string>('TELEGRAM_BOT_TOKEN') || undefined;
    this.base = (
      config.get<string>('TELEGRAM_API_URL') || 'https://api.telegram.org'
    ).replace(/\/$/, '');
    this.relayKey = config.get<string>('TELEGRAM_RELAY_KEY') || undefined;
  }

  get enabled(): boolean {
    return !!this.token;
  }

  async call<T = unknown>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    if (!this.token) throw new Error('Telegram bot is not configured');
    const response = await fetch(`${this.base}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.relayKey ? { 'x-relay-key': this.relayKey } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      result?: T;
      error_code?: number;
    } | null;
    if (!data?.ok)
      // Never include the URL (it carries the token) or the response body.
      throw new TelegramError(data?.error_code ?? response.status);
    return data.result as T;
  }

  sendMessage(
    chatId: bigint | number | string,
    text: string,
    buttons?: TelegramButton[][],
  ) {
    return this.call('sendMessage', {
      chat_id: chatId.toString(),
      text: text.slice(0, 4000),
      link_preview_options: { is_disabled: true },
      ...(buttons?.length
        ? { reply_markup: { inline_keyboard: buttons } }
        : {}),
    });
  }
}

export class TelegramError extends Error {
  constructor(readonly code: number) {
    super(`Telegram API error ${code}`);
  }
  /** The user blocked the bot or deleted the chat: the link is dead. */
  get gone(): boolean {
    return this.code === 403;
  }
}
