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
  /** The scope check («decision model») run before free-text AI requests. */
  scope: AiScopeSettings;
  /** Daily limits per access tier (DEFAULT_AI_QUOTAS until saved). */
  quotas: AiQuotas;
  /** What the services cost us (DEFAULT_AI_PRICES until saved). */
  prices: AiPrices;
  /** Saved setup used when a service fails or is overloaded (a preset id of the same service), per service. */
  fallbacks: Record<AiKind, string | null>;
  /** Alert when today's estimated AI cost reaches this many dollars (0 = no budget alert). */
  dailyBudgetUsd: number;
}

/** Most AI requests one account may have running at once (read-aloud fetches two clips). */
export const AI_USER_CONCURRENCY = 4;

/** One service's outcomes in a window: `failed` = the user got an error (after any fallback). */
export interface AiServiceHealth {
  calls: number;
  failed: number;
  /** Requests the fallback answered (or tried to) after the main service failed. */
  fellBack: number;
}

export type AiAlert =
  | { kind: 'errors'; service: AiKind; failed: number; calls: number }
  | { kind: 'fallback'; service: AiKind; fellBack: number }
  | { kind: 'budget'; todayUsd: number; budgetUsd: number }
  | { kind: 'budget-near'; todayUsd: number; budgetUsd: number };

/** Since the api last started: outcomes per service in the last hour and 24 hours, plus alerts. */
export interface AiHealthReport {
  since: string;
  hour: Record<AiKind, AiServiceHealth>;
  day: Record<AiKind, AiServiceHealth>;
  /** Last error per service (status and a short provider-free message), if any in 24 hours. */
  lastError: Record<AiKind, { at: string; message: string } | null>;
  todayUsd: number;
  alerts: AiAlert[];
}

/**
 * Who makes the scope decision: `local`, a small model on our own server (default, free); `chat`, an LLM on
 * the chat service; `jev`, TypeSafe's Jev api (filtered in Iran; reachable only through a proxy).
 */
export const AI_SCOPE_PROVIDERS = ['local', 'chat', 'jev'] as const;
export type AiScopeProvider = (typeof AI_SCOPE_PROVIDERS)[number];
/** Used when the Jev url is left empty. */
export const TYPESAFE_URL = 'https://api.typesafe.ai';

export interface AiScopeSettings {
  /** On by default. */
  on: boolean;
  provider: AiScopeProvider;
  /** chat: a model on the chat service, '' = the chat model; jev: '' = jev-latest. */
  model: string;
  /** Jev only: '' = TYPESAFE_URL. */
  url: string;
  /** A Jev key is stored (never returned). */
  hasKey: boolean;
  proxy: boolean;
  proxyUrl: string;
}

/** Try a sentence against the scope check (admin). */
export const testAiScopeSchema = z.object({
  text: z.string().check(z.trim(), z.minLength(1), z.maxLength(2000)),
});
export type TestAiScopeInput = z.infer<typeof testAiScopeSchema>;
export interface AiScopeTestResult {
  inScope: boolean;
  /** Probability that the request fits the app (local model, Jev); null for the chat model. */
  probability: number | null;
  provider: AiScopeProvider;
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

/** Access tiers that have AI (staff is never limited). */
export const AI_QUOTA_TIERS = ['trial', 'earned', 'paid'] as const;
export type AiQuotaTier = (typeof AI_QUOTA_TIERS)[number];
/** Daily limits per Tehran day: chat in tokens, tts in characters, stt in recordings. */
export type AiDailyLimits = Record<AiKind, number>;
export type AiQuotas = Record<AiQuotaTier, AiDailyLimits>;

/**
 * Used until an admin sets quotas in /admin/ai. An assistant message costs a few thousand tokens (the tools are
 * sent with every step), so 300k tokens is a busy day of use; at small-model prices a full day stays cents.
 */
export const DEFAULT_AI_QUOTAS: AiQuotas = {
  trial: { chat: 300_000, tts: 30_000, stt: 60 },
  earned: { chat: 300_000, tts: 30_000, stt: 60 },
  paid: { chat: 1_000_000, tts: 100_000, stt: 200 },
};

const limit = z.int().check(z.minimum(0), z.maximum(100_000_000));
const limits = z.object({ chat: limit, tts: limit, stt: limit });
export const aiQuotasSchema = z.object({
  trial: limits,
  earned: limits,
  paid: limits,
});

/**
 * What the AI services cost us, in US dollars as providers bill them (0 = free or unknown). Chat per million input
 * and output tokens, text-to-speech per million characters, speech-to-text per recording; `usdToToman` turns the
 * totals into Toman for pricing plans.
 */
export interface AiPrices {
  chatInput: number;
  chatOutput: number;
  tts: number;
  stt: number;
  usdToToman: number;
}
/**
 * Starting prices until an admin saves their own (owner, 2026-11-08: «فعلا از دیپ سیک و دیپ گرام بردار»), read
 * on 2026-11-08 and rounded up so costs are not underestimated: DeepSeek `deepseek-flash` at its peak rate (cache
 * misses; off-peak and cache hits are cheaper), Deepgram Aura-2 ($0.030 per 1,000 characters) and Nova-3
 * ($0.0043 per minute, counted as one minute per recording), and the Tehran open-market dollar (~271,000 Toman).
 */
export const DEFAULT_AI_PRICES: AiPrices = {
  chatInput: 0.3,
  chatOutput: 1.2,
  tts: 30,
  stt: 0.0043,
  usdToToman: 271_000,
};
const price = z.number().check(z.minimum(0), z.maximum(1_000_000));
export const aiPricesSchema = z.object({
  chatInput: price,
  chatOutput: price,
  tts: price,
  stt: price,
  usdToToman: z.number().check(z.minimum(0), z.maximum(100_000_000)),
});

/** Dollars for some use of one service: chat `units` are all tokens, `outputUnits` the output part of them. */
export function aiCostUsd(
  prices: AiPrices,
  kind: AiKind,
  units: number,
  outputUnits = 0,
): number {
  if (kind === 'chat') {
    const output = Math.min(outputUnits, units);
    return (
      ((units - output) * prices.chatInput + output * prices.chatOutput) /
      1_000_000
    );
  }
  if (kind === 'tts') return (units * prices.tts) / 1_000_000;
  return units * prices.stt;
}

/** Prices in effect from `day` (Tehran), with the model names in use when they were saved. */
export interface AiPriceVersionView {
  day: string;
  prices: AiPrices;
  models: Record<AiKind, string>;
}

/** AI cost over the last `days` Tehran days (today included), per service and per access tier. */
export interface AiCostReport {
  /** Saved price versions, newest first (at most 12); each day of use is priced with the one in effect then. */
  priceHistory: AiPriceVersionView[];
  /** Services whose current model differs from the one the latest prices were saved for. */
  unpricedModels: AiKind[];
  days: number;
  from: string;
  to: string;
  /** False until an admin enters at least one price: the dollars below are then 0. */
  priced: boolean;
  usdToToman: number;
  totalUsd: number;
  kinds: Record<AiKind, { calls: number; units: number; usd: number }>;
  /** Accounts that used AI in the window, their cost, and cost per account per 30 days. */
  tiers: {
    tier: 'trial' | 'earned' | 'paid' | 'staff' | 'unknown';
    users: number;
    usd: number;
    usdPerUserMonth: number;
  }[];
}

/** Today's use against the account's limits; `limit` null = unlimited (admins). */
export interface AiUsageView {
  day: string;
  kinds: Record<AiKind, { used: number; limit: number | null }>;
}

/** Admin overview: today's totals per service. */
export interface AiUsageOverview {
  day: string;
  kinds: Record<AiKind, { users: number; calls: number; units: number }>;
}

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
    quotas: aiQuotasSchema,
    prices: aiPricesSchema,
    fallbacks: z.partial(
      z.object({
        chat: z.nullable(z.uuid()),
        tts: z.nullable(z.uuid()),
        stt: z.nullable(z.uuid()),
      }),
    ),
    dailyBudgetUsd: z.number().check(z.minimum(0), z.maximum(100_000)),
    scope: z.partial(
      z.object({
        on: z.boolean(),
        provider: z.enum(AI_SCOPE_PROVIDERS),
        model,
        url,
        key,
        proxy: z.boolean(),
        proxyUrl: url,
      }),
    ),
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
