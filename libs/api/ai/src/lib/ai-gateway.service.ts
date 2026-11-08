import { requestLanguage } from './request-language';
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_USER_CONCURRENCY,
  type AiKind,
  type AiTestResult,
  type BillingAccessState,
} from '@all-in-one/shared/schemas';
import { fetch, FormData } from 'undici';
import {
  AiSettingsService,
  ELEVEN_DEFAULTS,
  type AiTarget,
} from './ai-settings.service';
import { assertPublicUrl, guardedAgent, proxyAgent } from './net-guard';
import { AiUsageService } from './ai-usage.service';
import { AiHealthService } from './ai-health.service';

type HttpResponse = Awaited<ReturnType<typeof fetch>>;

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
  /** Another model on the same chat service (the scope check's own model). */
  model?: string;
  /** false: not counted against the daily quota (the scope check itself). */
  meter?: boolean;
}

/** Rough tokens of a text when the service reports no usage (about 4 characters a token). */
const roughTokens = (text: string) => Math.ceil(text.length / 4);

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
    @Optional() private readonly usage?: AiUsageService,
    @Optional() private readonly health?: AiHealthService,
  ) {}

  /** Requests running per account (AI_USER_CONCURRENCY). */
  private readonly running = new Map<string, number>();

  /** Runs `work` in one of the account's AI slots; a fifth request at once is refused with 429. */
  private async slot<T>(userId: AiCaller, work: () => Promise<T>): Promise<T> {
    if (userId === OPERATOR_TEST) return work();
    const count = this.running.get(userId) ?? 0;
    if (count >= AI_USER_CONCURRENCY)
      throw new HttpException(
        {
          code: 'AI_BUSY',
          message:
            'چند درخواست هوش مصنوعی هم‌زمان در جریان است. چند لحظه بعد دوباره امتحان کن.',
        },
        429,
      );
    this.running.set(userId, count + 1);
    try {
      return await work();
    } finally {
      const left = (this.running.get(userId) ?? 1) - 1;
      if (left > 0) this.running.set(userId, left);
      else this.running.delete(userId);
    }
  }

  /**
   * Sends to the main service; when it is unreachable, overloaded or refuses our setup (see `shouldFallBack`),
   * sends once more to the admin's fallback setup for that service. Records the outcome for monitoring.
   * The operator's connection test always uses the main service only.
   */
  private async withFallback(
    userId: AiCaller,
    kind: AiKind,
    primary: AiTarget,
    send: (target: AiTarget) => Promise<HttpResponse>,
  ): Promise<{ response: HttpResponse; target: AiTarget }> {
    const testing = userId === OPERATOR_TEST;
    let response: HttpResponse | null = null;
    let failure: unknown = null;
    try {
      response = await send(primary);
      if (response.ok || testing || !shouldFallBack(response.status)) {
        if (!testing)
          this.health?.record(kind, {
            ok: response.ok,
            fellBack: false,
            ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
          });
        return { response, target: primary };
      }
    } catch (error) {
      if (testing) throw error;
      failure = error;
    }
    const fallback = await this.settings.fallbackTarget(kind);
    const reason = response ? `HTTP ${response.status}` : 'unreachable';
    if (!fallback) {
      this.health?.record(kind, { ok: false, fellBack: false, error: reason });
      if (response) return { response, target: primary };
      throw failure;
    }
    await response?.body?.cancel().catch(() => undefined);
    try {
      const second = await send(fallback);
      this.health?.record(kind, {
        ok: second.ok,
        fellBack: true,
        error: second.ok
          ? `${reason} (fallback answered)`
          : `${reason}; fallback HTTP ${second.status}`,
      });
      return { response: second, target: fallback };
    } catch (error) {
      this.health?.record(kind, {
        ok: false,
        fellBack: true,
        error: `${reason}; fallback unreachable`,
      });
      throw error;
    }
  }

  /** Daily quota (AiUsageService): refuse when used up; the operator's own tests are never limited. */
  private async allow(
    userId: AiCaller,
    tier: BillingAccessState['tier'],
    kind: AiKind,
    extra = 0,
  ) {
    if (userId === OPERATOR_TEST || !this.usage) return;
    await this.usage.check(userId, tier, kind, extra);
  }

  private async meter(
    userId: AiCaller,
    kind: AiKind,
    units: number,
    tier: BillingAccessState['tier'],
    parts: { outputUnits?: number; cachedUnits?: number } = {},
  ) {
    if (userId === OPERATOR_TEST || !this.usage) return;
    // Metering must never turn a successful answer into an error.
    await this.usage
      .record(userId, kind, units, { ...parts, tier })
      .catch(() => undefined);
  }

  private get allowPrivate(): boolean {
    return this.config.get('AI_ALLOW_PRIVATE_URLS') === 'true';
  }

  status() {
    return this.settings.status();
  }

  private async target<K extends AiKind>(userId: AiCaller, kind: K) {
    const tier =
      userId === OPERATOR_TEST
        ? 'staff'
        : (await this.access.access(userId)).tier;
    if (tier === 'free') {
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
    return { ...(target as NonNullable<(typeof targets)[K]>), tier };
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
    return this.slot(userId, () => this.chatNow(userId, messages, options));
  }

  private async chatNow(
    userId: AiCaller,
    messages: ChatMessage[],
    options: ChatOptions,
  ) {
    const primary = await this.target(userId, 'chat');
    if (options.meter !== false) await this.allow(userId, primary.tier, 'chat');
    const { response } = await this.withFallback(
      userId,
      'chat',
      primary,
      (target) =>
        this.request(target, {
          json: true,
          timeout: options.timeout ?? 60_000,
          body: JSON.stringify({
            // Another model on the main service (the scope check's) does not exist on the fallback.
            model: (target === primary && options.model) || target.model,
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
        }),
    );
    const target = primary;
    if (!response.ok) return this.fail(response, 'سرویس گفتگو');
    const body = (await response.json()) as {
      choices?: { message?: { content?: unknown; tool_calls?: ToolCall[] } }[];
      usage?: {
        total_tokens?: unknown;
        prompt_tokens?: unknown;
        completion_tokens?: unknown;
        /** DeepSeek: input tokens served from its prompt cache. */
        prompt_cache_hit_tokens?: unknown;
        /** OpenAI and compatible services: the same, nested. */
        prompt_tokens_details?: { cached_tokens?: unknown } | null;
      };
    };
    const message = body.choices?.[0]?.message;
    if (!message)
      throw new BadGatewayException('پاسخ سرویس گفتگو نامعتبر بود.');
    if (options.meter !== false) {
      const usage = body.usage;
      const counted = (value: unknown) =>
        typeof value === 'number' && Number.isFinite(value) ? value : null;
      const reported = counted(usage?.prompt_tokens);
      const input = reported ?? roughTokens(JSON.stringify(messages));
      const output =
        counted(usage?.completion_tokens) ??
        roughTokens(JSON.stringify(message));
      // The repeated system prompt and tool definitions are mostly cache hits, billed far lower; only a reported
      // input count can hold them.
      const cached =
        reported === null
          ? 0
          : Math.min(
              reported,
              counted(usage?.prompt_cache_hit_tokens) ??
                counted(usage?.prompt_tokens_details?.cached_tokens) ??
                0,
            );
      await this.meter(
        userId,
        'chat',
        counted(usage?.total_tokens) ?? input + output,
        target.tier,
        { outputUnits: output, cachedUnits: cached },
      );
    }
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
      endpoint: speechEndpoint(target, model),
      model,
      key: target.key,
      proxy: target.proxy,
      provider: target.provider,
      tier: target.tier,
    };
  }

  async speech(
    userId: AiCaller,
    text: string,
    voice: 'primary' | 'secondary',
  ): Promise<{ audio: Buffer; contentType: string }> {
    return this.slot(userId, () => this.speechNow(userId, text, voice));
  }

  private async speechNow(
    userId: AiCaller,
    text: string,
    voice: 'primary' | 'secondary',
  ): Promise<{ audio: Buffer; contentType: string }> {
    const target = await this.speechTarget(userId, voice);
    await this.allow(userId, target.tier, 'tts', text.length);
    const fallbackVoice2 =
      voice === 'secondary' ? await this.settings.fallbackVoice2() : null;
    const { response } = await this.withFallback(
      userId,
      'tts',
      target,
      async (service) => {
        // The main service arrives with its voice's endpoint already built; a fallback gets its own.
        const model =
          service === target
            ? target.model
            : (voice === 'secondary' && fallbackVoice2) || service.model;
        const call = {
          ...service,
          model,
          endpoint:
            service === target
              ? target.endpoint
              : speechEndpoint(service, model),
        };
        const body = JSON.stringify(
          call.provider === 'elevenlabs'
            ? { text, model_id: ELEVEN_DEFAULTS.ttsModel }
            : call.provider === 'deepgram'
              ? { text }
              : { model: call.model, input: text },
        );
        // Speech services fail now and then (429, 5xx, a dropped proxy connection): try again.
        let response: HttpResponse | null = null;
        for (let attempt = 1; ; attempt++) {
          try {
            response = await this.request(call, {
              json: true,
              timeout: 30_000,
              body,
            });
          } catch (error) {
            if (attempt >= SPEECH_ATTEMPTS) throw error;
            await sleep(retryDelay(attempt));
            continue;
          }
          if (!isRetryable(response.status) || attempt >= SPEECH_ATTEMPTS)
            return response;
          await response.body?.cancel().catch(() => undefined);
          await sleep(retryDelay(attempt, response.headers.get('retry-after')));
        }
      },
    );
    if (!response.ok) return this.fail(response, 'سرویس متن به گفتار');
    const contentType = response.headers.get('content-type') ?? '';
    if (!/^(audio\/|application\/octet-stream)/i.test(contentType))
      throw new BadGatewayException('سرویس متن به گفتار صدا برنگرداند.');
    if (Number(response.headers.get('content-length')) > MAX_AUDIO_BYTES)
      throw new BadGatewayException('صدای برگشتی خیلی بزرگ است.');
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length || audio.length > MAX_AUDIO_BYTES)
      throw new BadGatewayException('صدای برگشتی نامعتبر است.');
    await this.meter(userId, 'tts', text.length, target.tier);
    return { audio, contentType };
  }

  async transcribe(
    userId: AiCaller,
    audio: unknown,
    contentType: string,
  ): Promise<string> {
    return this.slot(userId, () =>
      this.transcribeNow(userId, audio, contentType),
    );
  }

  private async transcribeNow(
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
    const managed = await this.target(userId, 'stt');
    await this.allow(userId, managed.tier, 'stt');
    const { response } = await this.withFallback(
      userId,
      'stt',
      managed,
      (service) => {
        const target = sttTarget(service);
        return this.request(target, {
          ...sttBody(target, audio, mime, `speech.${extension}`),
          timeout: 90_000,
        });
      },
    );
    if (!response.ok) return this.fail(response, 'سرویس گفتار به متن');
    const text = transcriptOf(await response.json());
    await this.meter(userId, 'stt', 1, managed.tier);
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

/**
 * Worth the fallback: what a retry would help (timeouts, rate limits, 5xx) and a main service that refuses our
 * own setup (bad key, unpaid account, wrong url). Not request errors (400, 413, 422): the fallback would refuse
 * the same input.
 */
export function shouldFallBack(status: number): boolean {
  return isRetryable(status) || [401, 402, 403, 404].includes(status);
}

/** The url a voice is spoken at: ElevenLabs and Deepgram put the voice in the path or query. */
function speechEndpoint(target: AiTarget, model: string): string {
  if (target.provider === 'elevenlabs')
    return `${target.endpoint}/v1/text-to-speech/${encodeURIComponent(model)}?output_format=mp3_44100_128`;
  if (target.provider === 'deepgram')
    return `${target.endpoint}/v1/speak?model=${encodeURIComponent(model)}`;
  return target.endpoint;
}

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
