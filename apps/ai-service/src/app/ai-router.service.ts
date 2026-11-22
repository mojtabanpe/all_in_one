import {
  BadGatewayException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fetch, ProxyAgent } from 'undici';
import {
  loadAiRouterConfig,
  type AiRouterConfig,
  type ProviderConfig,
} from './ai-router.config';

export interface ChatCompletionPayload {
  model?: string;
  messages: unknown[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: unknown;
  [key: string]: unknown;
}

export interface RoutedChatResult {
  status: number;
  body: unknown;
  provider: ProviderConfig['name'];
  fellBack: boolean;
}

type FetchFn = typeof fetch;

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Outages, rate limits, timeouts, and provider-side auth/config errors warrant fallback. */
export function shouldFallBackStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    status === 401 ||
    status === 402 ||
    status === 403 ||
    status === 404
  );
}

@Injectable()
export class AiRouterService {
  private readonly logger = new Logger(AiRouterService.name);
  private readonly config: AiRouterConfig;
  private readonly expectedAuth: Buffer | null;
  private readonly proxies = new Map<string, ProxyAgent>();
  private readonly httpFetch: FetchFn;

  constructor(
    @Optional() config?: AiRouterConfig,
    @Optional() httpFetch?: FetchFn,
  ) {
    this.config = config ?? loadAiRouterConfig();
    this.expectedAuth = this.config.serviceToken
      ? digest(`Bearer ${this.config.serviceToken}`)
      : null;
    this.httpFetch = httpFetch ?? fetch;
  }

  isAuthorized(authorization: string | undefined): boolean {
    if (!this.expectedAuth) return true;
    if (!authorization) return false;
    return timingSafeEqual(digest(authorization), this.expectedAuth);
  }

  models() {
    const data: { id: string; object: 'model'; owned_by: string }[] = [];
    if (this.config.deepseek) {
      data.push({
        id: this.config.deepseek.model,
        object: 'model',
        owned_by: 'deepseek',
      });
    }
    if (this.config.selfHostedEnabled && this.config.selfHosted) {
      data.push({
        id: this.config.selfHosted.model,
        object: 'model',
        owned_by: 'poshtetgarm-self-hosted',
      });
    }
    return { object: 'list', data };
  }

  async health() {
    let selfHostedReachable: boolean | null = null;
    if (this.config.selfHostedEnabled && this.config.selfHosted) {
      selfHostedReachable = await this.probeSelfHosted(this.config.selfHosted);
    }
    const activeProvider =
      this.config.selfHostedEnabled && this.config.selfHostedMode === 'primary'
        ? 'self-hosted'
        : 'deepseek';
    return {
      status: 'ok',
      selfHostedEnabled: this.config.selfHostedEnabled,
      mode: this.config.selfHostedEnabled
        ? this.config.selfHostedMode
        : 'deepseek-only',
      activeProvider,
      providers: {
        deepseek: {
          configured: Boolean(
            this.config.deepseek && this.config.deepseek.apiKey,
          ),
          model: this.config.deepseek?.model ?? null,
        },
        selfHosted: {
          enabled: this.config.selfHostedEnabled,
          configured: Boolean(this.config.selfHosted),
          model: this.config.selfHosted?.model ?? null,
          reachable: selfHostedReachable,
        },
      },
    };
  }

  async chatCompletions(
    payload: ChatCompletionPayload,
  ): Promise<RoutedChatResult> {
    const plan = this.resolveRoutePlan();
    if (!plan.primary) {
      throw new ServiceUnavailableException(
        'No AI provider is configured in ai-service.',
      );
    }

    let firstStatus: number | null = null;
    let firstBody: unknown = null;
    let firstError: unknown = null;

    try {
      const response = await this.callProvider(plan.primary, payload);
      firstStatus = response.status;
      firstBody = sanitizeProviderBody(
        plan.primary.name,
        await parseResponseBody(response),
      );
      if (
        response.ok ||
        !plan.fallback ||
        !shouldFallBackStatus(response.status)
      ) {
        return {
          status: response.status,
          body: firstBody,
          provider: plan.primary.name,
          fellBack: false,
        };
      }
      this.logger.warn(
        `Primary provider ${plan.primary.name} returned HTTP ${response.status}; falling back to ${plan.fallback.name}`,
      );
    } catch (error) {
      firstError = error;
      if (!plan.fallback) {
        this.logger.error(
          `Primary provider ${plan.primary.name} unreachable and no fallback active: ${errorMessage(error)}`,
        );
        throw new BadGatewayException(
          `AI provider ${plan.primary.name} is unreachable.`,
        );
      }
      this.logger.warn(
        `Primary provider ${plan.primary.name} failed (${errorMessage(error)}); falling back to ${plan.fallback.name}`,
      );
    }

    try {
      const fallbackResponse = await this.callProvider(plan.fallback, payload);
      const fallbackBody = sanitizeProviderBody(
        plan.fallback.name,
        await parseResponseBody(fallbackResponse),
      );
      return {
        status: fallbackResponse.status,
        body: fallbackBody,
        provider: plan.fallback.name,
        fellBack: true,
      };
    } catch (fallbackError) {
      this.logger.error(
        `Fallback provider ${plan.fallback.name} also failed: ${errorMessage(fallbackError)}`,
      );
      if (firstStatus !== null) {
        return {
          status: firstStatus,
          body: firstBody,
          provider: plan.primary.name,
          fellBack: true,
        };
      }
      throw new BadGatewayException(
        `Both primary (${plan.primary.name}) and fallback (${plan.fallback.name}) AI providers failed: ${errorMessage(firstError)}`,
      );
    }
  }

  private resolveRoutePlan(): {
    primary: ProviderConfig | null;
    fallback: ProviderConfig | null;
  } {
    if (!this.config.selfHostedEnabled) {
      return { primary: this.config.deepseek, fallback: null };
    }
    if (this.config.selfHostedMode === 'primary') {
      return {
        primary: this.config.selfHosted,
        fallback: this.config.fallbackToDeepSeek ? this.config.deepseek : null,
      };
    }
    return {
      primary: this.config.deepseek,
      fallback: this.config.selfHosted,
    };
  }

  private async callProvider(
    provider: ProviderConfig,
    payload: ChatCompletionPayload,
  ) {
    const outgoing: ChatCompletionPayload = {
      ...payload,
      model: provider.model,
      stream: false,
      ...(provider.name === 'self-hosted' &&
      !('chat_template_kwargs' in payload)
        ? { chat_template_kwargs: { enable_thinking: false } }
        : {}),
    };
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (provider.apiKey) {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }
    const dispatcher = provider.proxy
      ? this.proxyFor(provider.proxy)
      : undefined;
    return this.httpFetch(provider.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(outgoing),
      redirect: 'error',
      dispatcher,
      signal: AbortSignal.timeout(provider.timeoutMs),
    });
  }

  private async probeSelfHosted(provider: ProviderConfig): Promise<boolean> {
    const healthUrl = provider.baseUrl.replace(/\/v1$/, '') + '/health';
    try {
      const response = await this.httpFetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(2_500),
      });
      await response.body?.cancel().catch(() => undefined);
      return response.ok;
    } catch {
      return false;
    }
  }

  private proxyFor(url: string): ProxyAgent {
    let agent = this.proxies.get(url);
    if (!agent) {
      agent = new ProxyAgent(url);
      this.proxies.set(url, agent);
    }
    return agent;
  }
}

async function parseResponseBody(
  response: Awaited<ReturnType<typeof fetch>>,
): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text.slice(0, 500) } };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

const THINK_TAG_RE = /^(?:<think>[\s\S]*?<\/think>|<\/think>)\s*/i;

/** Strips leaked Qwen3 thinking tags from self-hosted llama-server replies. */
function sanitizeProviderBody(
  provider: ProviderConfig['name'],
  body: unknown,
): unknown {
  if (provider !== 'self-hosted' || !body || typeof body !== 'object') {
    return body;
  }
  const record = body as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  if (!Array.isArray(record.choices)) return body;
  for (const choice of record.choices) {
    if (typeof choice?.message?.content === 'string') {
      choice.message.content = choice.message.content.replace(THINK_TAG_RE, '');
    }
  }
  return body;
}
