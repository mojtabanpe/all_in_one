import { requestLanguage } from './request-language';
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AiKind,
  AiTestResult,
  BillingAccessState,
} from '@all-in-one/shared/schemas';
import { fetch, FormData } from 'undici';
import {
  AiSettingsService,
  ELEVEN_DEFAULTS,
  type AiTarget,
} from './ai-settings.service';
import { assertPublicUrl, guardedAgent, proxyAgent } from './net-guard';

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

export const AI_ACCESS = Symbol('AI_ACCESS');
const OPERATOR_TEST = Symbol('OPERATOR_TEST');
type AiCaller = string | typeof OPERATOR_TEST;

export interface AiAccess {
  access(userId: string): Promise<BillingAccessState>;
}

/** Calls operator-managed AI services through guarded HTTP connections. */
@Injectable()
export class AiGateway {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly config: ConfigService,
    @Inject(AI_ACCESS) private readonly access: AiAccess,
  ) {}

  private get allowPrivate(): boolean {
    return this.config.get('AI_ALLOW_PRIVATE_URLS') === 'true';
  }

  status() {
    return this.settings.status();
  }

  private async target<K extends AiKind>(userId: AiCaller, kind: K) {
    if (
      userId !== OPERATOR_TEST &&
      (await this.access.access(userId)).tier === 'free'
    ) {
      throw new HttpException(
        {
          code: 'AI_PLAN_REQUIRED',
          message: 'برای استفاده از هوش مصنوعی، یک پلن فعال لازم است.',
        },
        402,
      );
    }
    const targets = await this.settings.targets();
    const target = targets[kind];
    if (!target)
      throw new ServiceUnavailableException('سرویس هوش مصنوعی در دسترس نیست.');
    return target as NonNullable<(typeof targets)[K]>;
  }

  private async request(
    target: AiTarget,
    init: {
      body: string | FormData | Uint8Array;
      json: boolean;
      timeout: number;
      /** Raw body type (Deepgram takes the audio itself). */
      contentType?: string;
    },
  ) {
    const url = new URL(target.endpoint);
    try {
      assertPublicUrl(url, this.allowPrivate);
      return await fetch(url, {
        method: 'POST',
        headers: {
          ...(init.json ? { 'Content-Type': 'application/json' } : {}),
          ...(init.contentType ? { 'Content-Type': init.contentType } : {}),
          ...(target.key ? authHeader(target) : {}),
        },
        body: init.body,
        redirect: 'error',
        dispatcher: target.proxy
          ? proxyAgent(target.proxy)
          : guardedAgent(this.allowPrivate),
        signal: AbortSignal.timeout(init.timeout),
      });
    } catch {
      throw new BadGatewayException('سرویس هوش مصنوعی در دسترس نیست.');
    }
  }

  private async fail(
    response: Awaited<ReturnType<typeof fetch>>,
    what: string,
  ): Promise<never> {
    await response.body?.cancel().catch(() => undefined);
    throw new BadGatewayException(`${what} خطا داد (${response.status}).`);
  }

  async chat(
    userId: AiCaller,
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
        messages: requestLanguage.getStore()
          ? [
              ...messages,
              {
                role: 'system',
                content: `The user selected ${requestLanguage.getStore() === 'en' ? 'English (Latin digits)' : 'Persian (Persian digits)'} as their app language. Use this language for interface feedback, explanations, health plans, recipes and instructions, even if the app's older prompt uses another language. Preserve JSON keys, enum values, identifiers, user-provided names and any English words or sentences that are explicitly the subject of a language-learning exercise. Do not add fields to the requested JSON schema.`,
              },
            ]
          : messages,
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
    userId: AiCaller,
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
  async speechTarget(userId: AiCaller, voice: 'primary' | 'secondary') {
    const target = await this.target(userId, 'tts');
    const model = voice === 'secondary' ? target.model2 : target.model;
    return {
      endpoint:
        target.provider === 'elevenlabs'
          ? `${target.endpoint}/v1/text-to-speech/${encodeURIComponent(model)}?output_format=mp3_44100_128`
          : target.provider === 'deepgram'
            ? `${target.endpoint}/v1/speak?model=${encodeURIComponent(model)}`
            : target.endpoint,
      model,
      key: target.key,
      proxy: target.proxy,
      provider: target.provider,
    };
  }

  async speech(
    userId: AiCaller,
    text: string,
    voice: 'primary' | 'secondary',
  ): Promise<{ audio: Buffer; contentType: string }> {
    const target = await this.speechTarget(userId, voice);
    const body = JSON.stringify(
      target.provider === 'elevenlabs'
        ? { text, model_id: ELEVEN_DEFAULTS.ttsModel }
        : target.provider === 'deepgram'
          ? { text }
          : { model: target.model, input: text },
    );
    // Speech services fail now and then (429, 5xx, a dropped proxy connection): try again.
    let response: Awaited<ReturnType<typeof fetch>> | null = null;
    for (let attempt = 1; ; attempt++) {
      try {
        response = await this.request(target, {
          json: true,
          timeout: 30_000,
          body,
        });
      } catch (error) {
        if (attempt >= SPEECH_ATTEMPTS) throw error;
        await sleep(retryDelay(attempt));
        continue;
      }
      if (!isRetryable(response.status) || attempt >= SPEECH_ATTEMPTS) break;
      await response.body?.cancel().catch(() => undefined);
      await sleep(retryDelay(attempt, response.headers.get('retry-after')));
    }
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
    userId: AiCaller,
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
    const target = sttTarget(await this.target(userId, 'stt'));
    const response = await this.request(target, {
      ...sttBody(target, audio, mime, `speech.${extension}`),
      timeout: 90_000,
    });
    if (!response.ok) return this.fail(response, 'سرویس گفتار به متن');
    const text = transcriptOf(await response.json());
    if (!text)
      throw new BadGatewayException(
        'صدایی تشخیص داده نشد. دوباره بگو یا بنویس.',
      );
    return text.slice(0, 3000);
  }
  /** "Test connection" in settings: a tiny real request to that service. */
  async testManaged(kind: AiKind): Promise<AiTestResult> {
    try {
      if (kind === 'chat') {
        await this.text(
          OPERATOR_TEST,
          [{ role: 'user', content: 'Reply with: ok' }],
          0,
          30_000,
        );
        return { ok: true, message: 'سرویس گفتگو پاسخ داد.' };
      }
      if (kind === 'tts') {
        await this.speech(OPERATOR_TEST, 'Hello', 'primary');
        return { ok: true, message: 'سرویس متن به گفتار صدا ساخت.' };
      }
      const probe = sttTarget(await this.target(OPERATOR_TEST, 'stt'));
      // A minimal request: a valid answer or a 4xx about the audio both prove the url and key work.
      const response = await this.request(probe, {
        ...sttBody(probe, silentWav(), 'audio/wav', 'probe.wav'),
        timeout: 30_000,
      });
      if (!response.ok) return this.fail(response, 'سرویس گفتار به متن');
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

const SPEECH_ATTEMPTS = 3;

/** Rate limits and server-side failures are worth a second try; other 4xx are not. */
export function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** 0.6 s, 1.2 s… or the service's Retry-After (at most 4 s). */
export function retryDelay(
  attempt: number,
  retryAfter?: string | null,
): number {
  const seconds = Number(retryAfter);
  if (retryAfter && Number.isFinite(seconds) && seconds >= 0)
    return Math.min(seconds * 1000, 4000);
  return 600 * attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The key header each provider expects. */
function authHeader(target: AiTarget): Record<string, string> {
  const key = target.key ?? '';
  if (target.provider === 'elevenlabs') return { 'xi-api-key': key };
  if (target.provider === 'deepgram') return { Authorization: `Token ${key}` };
  return { Authorization: `Bearer ${key}` };
}

/** Non-OpenAI providers keep the base url in `endpoint`; point it at speech-to-text. */
function sttTarget(target: AiTarget): AiTarget {
  if (target.provider === 'elevenlabs')
    return { ...target, endpoint: `${target.endpoint}/v1/speech-to-text` };
  if (target.provider === 'deepgram')
    return {
      ...target,
      endpoint: `${target.endpoint}/v1/listen?model=${encodeURIComponent(target.model)}&smart_format=true&detect_language=true`,
    };
  return target;
}

/** The transcription request body: a form (OpenAI, ElevenLabs `model_id`) or the raw audio (Deepgram). */
function sttBody(
  target: AiTarget,
  audio: Buffer,
  mime: string,
  filename: string,
): { body: FormData | Uint8Array; json: false; contentType?: string } {
  if (target.provider === 'deepgram')
    return { body: new Uint8Array(audio), json: false, contentType: mime };
  const form = new FormData();
  form.set(
    target.provider === 'elevenlabs' ? 'model_id' : 'model',
    target.model,
  );
  form.set('file', new Blob([new Uint8Array(audio)], { type: mime }), filename);
  return { body: form, json: false };
}

/** `{ text }` (OpenAI, ElevenLabs) or Deepgram's `results.channels[0].alternatives[0].transcript`. */
export function transcriptOf(result: unknown): string {
  const r = result as {
    text?: unknown;
    results?: {
      channels?: { alternatives?: { transcript?: unknown }[] }[];
    };
  };
  const text =
    r?.text ?? r?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  return typeof text === 'string' ? text.trim() : '';
}
