export type SelfHostedMode = 'fallback' | 'primary';

export interface ProviderConfig {
  name: 'deepseek' | 'self-hosted';
  endpoint: string;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  proxy: string | null;
  timeoutMs: number;
}

export interface AiRouterConfig {
  /** Shared bearer token for callers (apps/api). Empty means loopback-only unauthenticated dev mode. */
  serviceToken: string | null;
  /** Master feature flag. OFF (false) by default so DeepSeek traffic is untouched. */
  selfHostedEnabled: boolean;
  /**
   * When selfHostedEnabled=true:
   * - 'fallback': DeepSeek primary -> self-hosted llama-server fallback on outages/5xx/429/auth errors.
   * - 'primary': route directly to self-hosted llama-server (for testing the fine-tuned model).
   */
  selfHostedMode: SelfHostedMode;
  /** Only applies when selfHostedMode='primary': whether to fall back to DeepSeek if self-hosted fails. */
  fallbackToDeepSeek: boolean;
  deepseek: ProviderConfig | null;
  selfHosted: ProviderConfig | null;
}

export function chatCompletionsEndpoint(baseOrFullUrl: string): string {
  const clean = baseOrFullUrl.trim().replace(/\/+$/, '');
  return clean.endsWith('/chat/completions')
    ? clean
    : `${clean}/chat/completions`;
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

export function loadAiRouterConfig(
  env: Record<string, string | undefined> = process.env,
): AiRouterConfig {
  const selfHostedEnabled = env.AI_SELF_HOSTED_ENABLED === 'true';
  const rawMode = (env.AI_SELF_HOSTED_MODE ?? 'fallback').trim().toLowerCase();
  const selfHostedMode: SelfHostedMode =
    rawMode === 'primary' ? 'primary' : 'fallback';
  const fallbackToDeepSeek = env.AI_SELF_HOSTED_FALLBACK_TO_DEEPSEEK === 'true';

  const deepseekUrl = (
    env.AI_DEEPSEEK_URL ??
    env.MANAGED_AI_CHAT_URL ??
    'https://api.deepseek.com/v1'
  ).trim();
  const deepseekKey =
    (env.AI_DEEPSEEK_KEY ?? env.MANAGED_AI_CHAT_KEY ?? '').trim() || null;
  const deepseekModel = (
    env.AI_DEEPSEEK_MODEL ??
    env.MANAGED_AI_CHAT_MODEL ??
    'deepseek-chat'
  ).trim();
  const deepseekProxy = (env.AI_DEEPSEEK_PROXY ?? '').trim() || null;

  const deepseek: ProviderConfig | null =
    deepseekUrl && deepseekModel
      ? {
          name: 'deepseek',
          baseUrl: deepseekUrl.replace(/\/+$/, ''),
          endpoint: chatCompletionsEndpoint(deepseekUrl),
          model: deepseekModel,
          apiKey: deepseekKey,
          proxy: deepseekProxy,
          timeoutMs: readPositiveInt(env.AI_DEEPSEEK_TIMEOUT_MS, 60_000),
        }
      : null;

  const selfHostedUrl = (
    env.AI_SELF_HOSTED_URL ?? 'http://127.0.0.1:8085/v1'
  ).trim();
  const selfHostedModel = (
    env.AI_SELF_HOSTED_MODEL ?? 'poshtetgarm-qwen2.5-1.5b'
  ).trim();
  const selfHostedKey = (env.AI_SELF_HOSTED_KEY ?? '').trim() || null;

  const selfHosted: ProviderConfig | null =
    selfHostedUrl && selfHostedModel
      ? {
          name: 'self-hosted',
          baseUrl: selfHostedUrl.replace(/\/+$/, ''),
          endpoint: chatCompletionsEndpoint(selfHostedUrl),
          model: selfHostedModel,
          apiKey: selfHostedKey,
          proxy: null,
          timeoutMs: readPositiveInt(env.AI_SELF_HOSTED_TIMEOUT_MS, 90_000),
        }
      : null;

  return {
    serviceToken: (env.AI_SERVICE_TOKEN ?? '').trim() || null,
    selfHostedEnabled,
    selfHostedMode,
    fallbackToDeepSeek,
    deepseek,
    selfHosted,
  };
}
