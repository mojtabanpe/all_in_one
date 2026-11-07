import * as z from 'zod/mini';

/** What the browser sees of a user's AI service: never the key itself. */
export interface AiServiceView {
  url: string;
  model: string;
  hasKey: boolean;
  /** Requests of this service go through `proxyUrl`. */
  proxy: boolean;
  /** The stored proxy url, or DEFAULT_AI_PROXY. */
  proxyUrl: string;
  /** ElevenLabs api instead of OpenAI-compatible (tts/stt only). */
  elevenlabs: boolean;
  /** Deepgram api instead of OpenAI-compatible (tts/stt only). */
  deepgram: boolean;
}

/** Used when ElevenLabs is on and the url is left empty. */
export const ELEVENLABS_URL = 'https://api.elevenlabs.io';
/** Used when Deepgram is on and the url is left empty. */
export const DEEPGRAM_URL = 'https://api.deepgram.com';

export const DEFAULT_AI_PROXY = 'http://127.0.0.1:7890';

export interface AiSettings {
  /** OpenAI-compatible chat completions (cards, texts, coach, assistant). */
  chat: AiServiceView;
  /** Text-to-speech; `model2` is the second voice of dialogues. */
  tts: AiServiceView & { model2: string };
  /** Speech-to-text (transcriptions). */
  stt: AiServiceView;
  ready: AiStatus;
  /** Model names used before, per service, most recent first (current one included). */
  savedModels: Record<AiKind, string[]>;
  /** Saved setups (url, model, key) per service, newest first. */
  presets: AiPresetView[];
}

/** A saved setup; the key never leaves the server. */
export interface AiPresetView {
  id: string;
  kind: AiKind;
  url: string;
  model: string;
  model2: string;
  /** Masked indicator, or empty when the setup has no key. */
  keyHint: string;
  /** Proxy url, '' = direct. */
  proxy: string;
  elevenlabs: boolean;
  deepgram: boolean;
  active: boolean;
  createdAt: string;
}

export interface AiStatus {
  chat: boolean;
  tts: boolean;
  stt: boolean;
}

export const AI_KINDS = ['chat', 'tts', 'stt'] as const;
export type AiKind = (typeof AI_KINDS)[number];

/** A base url (…/v1) or the full endpoint; '' clears it. */
const url = z
  .string()
  .check(
    z.trim(),
    z.maxLength(500),
    z.regex(
      /^$|^https?:\/\/\S+$/i,
      'نشانی باید با http:// یا https:// شروع شود',
    ),
  );
const model = z.string().check(z.trim(), z.maxLength(100));
/** Omitted = keep the stored key; '' = remove it. */
const key = z.string().check(z.trim(), z.maxLength(500));

const service = z.partial(
  z.object({
    url,
    model,
    key,
    proxy: z.boolean(),
    proxyUrl: url,
    elevenlabs: z.boolean(),
    deepgram: z.boolean(),
  }),
);

export const updateAiSettingsSchema = z.partial(
  z.object({
    chat: service,
    tts: z.extend(service, { model2: z.optional(model) }),
    stt: service,
    /** Remove a model name from the remembered list of a service. */
    forgetModel: z.object({
      kind: z.enum(['chat', 'tts', 'stt']),
      model: z.string().check(z.maxLength(100)),
    }),
  }),
);

/** How many model names each service remembers. */
export const SAVED_MODELS_LIMIT = 15;
export type UpdateAiSettingsInput = z.infer<typeof updateAiSettingsSchema>;

/** Save a section's setup: what is typed, or the stored value where the field is left empty (key). */
export const saveAiPresetSchema = z.object({
  kind: z.enum(['chat', 'tts', 'stt']),
  url: z.string().check(z.trim(), z.maxLength(500)),
  model: z.string().check(z.trim(), z.maxLength(100)),
  model2: z.optional(z.string().check(z.trim(), z.maxLength(100))),
  /** Omitted or '' = use the key stored for this service now. */
  key: z.optional(z.string().check(z.trim(), z.maxLength(500))),
  /** Proxy url the setup uses; omitted or '' = direct. */
  proxy: z.optional(url),
  elevenlabs: z.optional(z.boolean()),
  deepgram: z.optional(z.boolean()),
});
export type SaveAiPresetInput = z.infer<typeof saveAiPresetSchema>;
/** How many saved setups each service keeps. */
export const AI_PRESETS_LIMIT = 30;

export const testAiSchema = z.object({ kind: z.enum(AI_KINDS) });
export interface AiTestResult {
  ok: boolean;
  message: string;
}
