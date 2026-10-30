import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiKind, AiTestResult } from '@all-in-one/shared/schemas';
import { fetch, FormData } from 'undici';
import { AiSettingsService, type AiTarget } from './ai-settings.service';
import { assertPublicUrl, guardedAgent } from './net-guard';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatOptions {
  temperature?: number;
  timeout?: number;
  tools?: ToolDefinition[];
}

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_RECORDING_BYTES = 1500 * 1024;
export const RECORDING_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

const NOT_SET: Record<AiKind, string> = {
  chat: 'هوش مصنوعی خاموش است: در «حساب کاربری ← هوش مصنوعی» نشانی و مدل سرویس گفتگو را بگذار.',
  tts: 'خواندن متن خاموش است: در «حساب کاربری ← هوش مصنوعی» نشانی سرویس متن به گفتار را بگذار.',
  stt: 'تشخیص گفتار خاموش است: در «حساب کاربری ← هوش مصنوعی» نشانی سرویس گفتار به متن را بگذار.',
};

/**
 * Calls the user's own OpenAI-compatible services (chat with tool calling,
 * text-to-speech, speech-to-text). Urls are user input, so every request
 * goes through a lookup that refuses private addresses unless the operator
 * sets AI_ALLOW_PRIVATE_URLS=true (e.g. a single-user server with a local
 * gateway).
 */
@Injectable()
export class AiGateway {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly config: ConfigService,
  ) {}

  private get allowPrivate(): boolean {
    return this.config.get('AI_ALLOW_PRIVATE_URLS') === 'true';
  }

  status(userId: string) {
    return this.settings.status(userId);
  }

  private async target<K extends AiKind>(userId: string, kind: K) {
    const targets = await this.settings.targets(userId);
    const target = targets[kind];
    if (!target) throw new ServiceUnavailableException(NOT_SET[kind]);
    return target as NonNullable<(typeof targets)[K]>;
  }

  private async request(
    target: AiTarget,
    init: { body: string | FormData; json: boolean; timeout: number },
  ) {
    const url = new URL(target.endpoint);
    try {
      assertPublicUrl(url, this.allowPrivate);
      return await fetch(url, {
        method: 'POST',
        headers: {
          ...(init.json ? { 'Content-Type': 'application/json' } : {}),
          ...(target.key ? { Authorization: `Bearer ${target.key}` } : {}),
        },
        body: init.body,
        redirect: 'error',
        dispatcher: guardedAgent(this.allowPrivate),
        signal: AbortSignal.timeout(init.timeout),
      });
    } catch (error) {
      const cause =
        (error as { cause?: Error }).cause?.message ?? (error as Error).message;
      throw new BadGatewayException(
        `سرویس هوش مصنوعی در دسترس نیست (${cause.slice(0, 120)}).`,
      );
    }
  }

  private async fail(
    response: Awaited<ReturnType<typeof fetch>>,
    what: string,
  ): Promise<never> {
    let detail = '';
    try {
      const body = (await response.json()) as {
        error?: { message?: string } | string;
      };
      detail =
        typeof body.error === 'string'
          ? body.error
          : (body.error?.message ?? '');
    } catch {
      // not JSON
    }
    throw new BadGatewayException(
      `${what} خطا داد (${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}).`,
    );
  }

  /** One chat completion; the reply may contain tool calls. */
  async chat(
    userId: string,
    messages: ChatMessage[],
    options: ChatOptions = {},
  ) {
    const target = await this.target(userId, 'chat');
    const response = await this.request(target, {
      json: true,
      timeout: options.timeout ?? 60_000,
      body: JSON.stringify({
        model: target.model,
        stream: false,
        temperature: options.temperature ?? 0.7,
        messages,
        ...(options.tools?.length
          ? { tools: options.tools, tool_choice: 'auto' }
          : {}),
      }),
    });
    if (!response.ok) return this.fail(response, 'سرویس گفتگو');
    const body = (await response.json()) as {
      choices?: { message?: { content?: unknown; tool_calls?: ToolCall[] } }[];
    };
    const message = body.choices?.[0]?.message;
    if (!message)
      throw new BadGatewayException('پاسخ سرویس گفتگو نامعتبر بود.');
    return {
      content: typeof message.content === 'string' ? message.content : null,
      toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
    };
  }

  /** A plain text completion (no tools). */
  async text(
    userId: string,
    messages: ChatMessage[],
    temperature: number,
    timeout: number,
  ): Promise<string> {
    const reply = await this.chat(userId, messages, { temperature, timeout });
    if (!reply.content)
      throw new BadGatewayException('سرویس گفتگو پاسخ متنی نداد.');
    return reply.content;
  }

  /** Where speech for a voice comes from; also part of the audio cache key. */
  async speechTarget(userId: string, voice: 'primary' | 'secondary') {
    const target = await this.target(userId, 'tts');
    return {
      endpoint: target.endpoint,
      model: voice === 'secondary' ? target.model2 : target.model,
      key: target.key,
    };
  }

  async speech(
    userId: string,
    text: string,
    voice: 'primary' | 'secondary',
  ): Promise<{ audio: Buffer; contentType: string }> {
    const target = await this.speechTarget(userId, voice);
    const response = await this.request(target, {
      json: true,
      timeout: 30_000,
      body: JSON.stringify({ model: target.model, input: text }),
    });
    if (!response.ok) return this.fail(response, 'سرویس متن به گفتار');
    const contentType = response.headers.get('content-type') ?? '';
    if (!/^(audio\/|application\/octet-stream)/i.test(contentType))
      throw new BadGatewayException('سرویس متن به گفتار صدا برنگرداند.');
    if (Number(response.headers.get('content-length')) > MAX_AUDIO_BYTES)
      throw new BadGatewayException('صدای برگشتی خیلی بزرگ است.');
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length || audio.length > MAX_AUDIO_BYTES)
      throw new BadGatewayException('صدای برگشتی نامعتبر است.');
    return { audio, contentType };
  }

  async transcribe(
    userId: string,
    audio: unknown,
    contentType: string,
  ): Promise<string> {
    if (!Buffer.isBuffer(audio) || !audio.length)
      throw new BadRequestException('اول صدا را ضبط کن.');
    if (audio.length > MAX_RECORDING_BYTES)
      throw new BadRequestException('ضبط خیلی طولانی است.');
    const mime = contentType.split(';')[0].trim();
    const extension = RECORDING_TYPES[mime];
    if (!extension)
      throw new BadRequestException('این قالب صدا پشتیبانی نمی‌شود.');
    const target = await this.target(userId, 'stt');
    const form = new FormData();
    form.set('model', target.model);
    form.set(
      'file',
      new Blob([new Uint8Array(audio)], { type: mime }),
      `speech.${extension}`,
    );
    const response = await this.request(target, {
      json: false,
      timeout: 90_000,
      body: form,
    });
    if (!response.ok) return this.fail(response, 'سرویس گفتار به متن');
    const result = (await response.json()) as { text?: unknown };
    if (typeof result.text !== 'string' || !result.text.trim())
      throw new BadGatewayException(
        'صدایی تشخیص داده نشد. دوباره بگو یا بنویس.',
      );
    return result.text.trim().slice(0, 3000);
  }

  /** "Test connection" in settings: a tiny real request to that service. */
  async test(userId: string, kind: AiKind): Promise<AiTestResult> {
    try {
      if (kind === 'chat') {
        await this.text(
          userId,
          [{ role: 'user', content: 'Reply with: ok' }],
          0,
          30_000,
        );
        return { ok: true, message: 'سرویس گفتگو پاسخ داد.' };
      }
      if (kind === 'tts') {
        await this.speech(userId, 'Hello', 'primary');
        return { ok: true, message: 'سرویس متن به گفتار صدا ساخت.' };
      }
      const probe = await this.target(userId, 'stt');
      // A minimal request: a valid answer or a 4xx about the audio both prove the url and key work.
      const form = new FormData();
      form.set('model', probe.model);
      form.set(
        'file',
        new Blob([new Uint8Array(silentWav())], { type: 'audio/wav' }),
        'probe.wav',
      );
      const response = await this.request(probe, {
        json: false,
        timeout: 30_000,
        body: form,
      });
      if (
        response.status === 401 ||
        response.status === 403 ||
        response.status === 404
      )
        return this.fail(response, 'سرویس گفتار به متن');
      return { ok: true, message: 'سرویس گفتار به متن در دسترس است.' };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }
}

/** 0.2 s of silence as 16 kHz mono WAV. */
function silentWav(): Buffer {
  const samples = 3200;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples * 2, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples * 2, 40);
  return Buffer.concat([header, Buffer.alloc(samples * 2)]);
}
