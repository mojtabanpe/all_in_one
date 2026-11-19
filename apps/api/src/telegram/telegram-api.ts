import { ConfigService } from '@nestjs/config';

/** Inline keyboard button: a link or a callback (≤ 64 bytes of data). */
export type TelegramButton =
  { text: string; url: string } | { text: string; callback_data: string };
export type TelegramMarkup = TelegramButton[][] | Record<string, unknown>;

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

  private get headers(): Record<string, string> {
    return this.relayKey ? { 'x-relay-key': this.relayKey } : {};
  }

  private async result<T>(response: Response): Promise<T> {
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

  async call<T = unknown>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    if (!this.token) throw new Error('Telegram bot is not configured');
    const response = await fetch(`${this.base}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    return this.result<T>(response);
  }

  /** A voice message (OGG/Opus, MP3 or M4A) with a caption and buttons. */
  async sendVoice(
    chatId: bigint | number | string,
    audio: { data: Uint8Array; contentType: string },
    caption: string,
    buttons?: TelegramButton[][],
  ) {
    if (!this.token) throw new Error('Telegram bot is not configured');
    const form = new FormData();
    form.set('chat_id', chatId.toString());
    form.set('caption', caption.slice(0, 1000));
    if (buttons?.length)
      form.set('reply_markup', JSON.stringify({ inline_keyboard: buttons }));
    const extension = audio.contentType.includes('ogg')
      ? 'ogg'
      : audio.contentType.includes('mp4')
        ? 'm4a'
        : 'mp3';
    form.set(
      'voice',
      new Blob([new Uint8Array(audio.data)], { type: audio.contentType }),
      `sentence.${extension}`,
    );
    const response = await fetch(`${this.base}/bot${this.token}/sendVoice`, {
      method: 'POST',
      headers: this.headers,
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    return this.result(response);
  }

  /** The bytes of a file the user sent (voice messages), at most `maxBytes`. */
  async download(fileId: string, maxBytes: number): Promise<Buffer> {
    const file = await this.call<{ file_path?: string; file_size?: number }>(
      'getFile',
      { file_id: fileId },
    );
    if (!file.file_path || (file.file_size ?? 0) > maxBytes)
      throw new TelegramError(413);
    const response = await fetch(
      `${this.base}/file/bot${this.token}/${file.file_path}`,
      { headers: this.headers, signal: AbortSignal.timeout(30_000) },
    );
    if (!response.ok) throw new TelegramError(response.status);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > maxBytes) throw new TelegramError(413);
    return data;
  }

  /** Inline buttons (an array of rows) or another reply markup (a reply keyboard, or removing it). */
  sendMessage(
    chatId: bigint | number | string,
    text: string,
    markup?: TelegramMarkup,
  ) {
    const replyMarkup = Array.isArray(markup)
      ? markup.length
        ? { inline_keyboard: markup }
        : undefined
      : markup;
    return this.call('sendMessage', {
      chat_id: chatId.toString(),
      text: text.slice(0, 4000),
      link_preview_options: { is_disabled: true },
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
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
