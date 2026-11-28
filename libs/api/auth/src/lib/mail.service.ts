import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  extractGrowthCampaign,
  type GrowthCampaign,
  type RegisterInput,
} from '@all-in-one/shared/schemas';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const httpProxyClient =
  require('nodemailer/lib/smtp-connection/http-proxy-client') as {
    timeout?: number;
  };

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export const SMTP_SEND_DEADLINE_MS = 45_000;
export const SMTP_PROXY_RESERVED_BUDGET_MS = 15_000;
export const SMTP_PROXY_TUNNEL_TIMEOUT_MS = 8_000;
export const SMTP_CONNECTION_TIMEOUT_MS = 8_000;
export const SMTP_GREETING_TIMEOUT_MS = 8_000;
export const SMTP_SOCKET_TIMEOUT_MS = 10_000;
export const SMTP_MAX_DIRECT_ATTEMPTS = 3;
export const SMTP_MAX_DIRECT_ATTEMPTS_WITH_PROXY = 2;
export const SMTP_RETRY_DELAYS_MS = [500, 1_500] as const;

type MailRoute = 'direct' | 'proxy';

const TRANSIENT_CODES = new Set([
  'ETIMEDOUT',
  'ECONNECTION',
  'ESOCKET',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'EDNS',
  'ETLS',
  'EPROXY',
]);

const TRANSIENT_MESSAGES = [
  'connection timeout',
  'greeting never received',
  'timeout',
  'socket close',
  'connection closed unexpectedly',
  'proxy socket timed out',
  'send deadline exceeded',
];

export function validateSmtpProxyUrl(rawProxyUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawProxyUrl);
  } catch {
    throw new Error('Invalid SMTP_PROXY_URL: must be a valid http(s) URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Invalid SMTP_PROXY_URL protocol "${parsed.protocol}": only http: and https: are supported`,
    );
  }
  return rawProxyUrl;
}

export function buildSmtpOptions(
  rawUrl: string,
  proxyUrl?: string,
  onWarn?: (message: string) => void,
): (SMTPTransport.Options & { proxy?: string }) | string {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname) {
      throw new Error('Missing SMTP hostname');
    }
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    const secure =
      parsed.searchParams.get('secure') === 'true'
        ? true
        : parsed.searchParams.get('secure') === 'false'
          ? false
          : parsed.protocol === 'smtps:';
    const port = Number(parsed.port) || (secure ? 465 : 587);
    const options: SMTPTransport.Options & { proxy?: string } = {
      host: host || 'localhost',
      port,
      secure,
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    };
    if (parsed.username || parsed.password) {
      options.auth = {
        user: decodeURIComponent(parsed.username),
        pass: decodeURIComponent(parsed.password),
      };
    }
    const rejectUnauthorized = parsed.searchParams.get(
      'tls.rejectUnauthorized',
    );
    if (rejectUnauthorized === 'true' || rejectUnauthorized === 'false') {
      options.tls = { rejectUnauthorized: rejectUnauthorized === 'true' };
    }
    if (proxyUrl) {
      options.proxy = validateSmtpProxyUrl(proxyUrl);
    }
    return options;
  } catch {
    onWarn?.(
      'SMTP_URL could not be parsed into options; falling back to default transport settings.',
    );
    return rawUrl;
  }
}

function classifySmtpError(error: unknown): {
  transient: boolean;
  code: string;
} {
  const err = (error ?? {}) as {
    code?: unknown;
    responseCode?: unknown;
    message?: unknown;
  };
  const rawCode = typeof err.code === 'string' ? err.code.trim() : '';
  const responseCode =
    typeof err.responseCode === 'number' && Number.isFinite(err.responseCode)
      ? err.responseCode
      : undefined;
  const message =
    typeof err.message === 'string' ? err.message.toLowerCase() : '';

  if (responseCode !== undefined && responseCode >= 500 && responseCode < 600) {
    return { transient: false, code: `SMTP_${responseCode}` };
  }
  if (
    rawCode === 'EAUTH' ||
    rawCode === 'EENVELOPE' ||
    rawCode === 'EMESSAGE'
  ) {
    if (
      responseCode !== undefined &&
      responseCode >= 400 &&
      responseCode < 500
    ) {
      return { transient: true, code: `SMTP_${responseCode}` };
    }
    return {
      transient: false,
      code: responseCode ? `SMTP_${responseCode}` : rawCode,
    };
  }
  if (responseCode !== undefined && responseCode >= 400 && responseCode < 500) {
    return { transient: true, code: `SMTP_${responseCode}` };
  }
  if (rawCode && TRANSIENT_CODES.has(rawCode)) {
    return { transient: true, code: rawCode };
  }
  if (TRANSIENT_MESSAGES.some((pattern) => message.includes(pattern))) {
    return { transient: true, code: rawCode || 'ETIMEDOUT' };
  }
  return {
    transient: false,
    code:
      (responseCode ? `SMTP_${responseCode}` : '') || rawCode || 'ESMTP_SEND',
  };
}

/**
 * Sends email over SMTP_URL (e.g. smtps://user:pass@smtp.example.com:465), as
 * in Recall. Without it, tests keep messages in `outbox`, development logs
 * them, and production reports email as unavailable.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  private readonly proxyTransport: Transporter | null;
  readonly outbox: Mail[] = [];

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('SMTP_URL')?.trim();
    const proxyUrl = config.get<string>('SMTP_PROXY_URL')?.trim();
    const warn = (msg: string) => this.logger.warn(msg);
    this.transport = url
      ? createTransport(buildSmtpOptions(url, undefined, warn))
      : null;
    if (url && proxyUrl) {
      const validProxyUrl = validateSmtpProxyUrl(proxyUrl);
      httpProxyClient.timeout = SMTP_PROXY_TUNNEL_TIMEOUT_MS;
      const proxyOpts = buildSmtpOptions(url, validProxyUrl);
      this.proxyTransport = createTransport(proxyOpts);
    } else {
      this.proxyTransport = null;
    }
  }

  private get env(): string {
    return this.config.get<string>('NODE_ENV') ?? 'development';
  }

  get enabled(): boolean {
    return !!this.transport || this.env !== 'production';
  }

  /** Where emailed links point: the customer app (may include a base path, e.g. /app). */
  get appUrl(): string {
    const url =
      this.config.get<string>('APP_PUBLIC_URL') ||
      (this.config.get<string>('APP_ORIGINS') || 'http://localhost:4400').split(
        ',',
      )[0];
    return url.trim().replace(/\/+$/, '') + '/';
  }

  /** `link('reset-password', token)` → https://…/reset-password?token=… */
  link(
    path: string,
    token: string,
    campaign?: GrowthCampaign,
    redirect?: RegisterInput['redirect'],
  ): string {
    const url = new URL(path, this.appUrl);
    url.searchParams.set('token', token);
    if (redirect) url.searchParams.set('redirect', redirect);
    const safe = extractGrowthCampaign({
      get: (key) =>
        (campaign as Record<string, string> | undefined)?.[key] ?? null,
    });
    for (const [key, value] of Object.entries(safe))
      if (value) url.searchParams.set(key, value);
    return url.href;
  }

  protected async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async sendWithTimeout(
    transport: Transporter,
    payload: Mail & { from: { name: string; address: string } },
    timeoutMs: number,
  ): Promise<void> {
    if (timeoutMs <= 0) {
      throw Object.assign(new Error('SMTP send deadline exceeded'), {
        code: 'ETIMEDOUT',
      });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        transport.sendMail(payload),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              Object.assign(new Error('SMTP send deadline exceeded'), {
                code: 'ETIMEDOUT',
              }),
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async send(mail: Mail): Promise<void> {
    if (this.transport) {
      const sender =
        this.config.get<string>('MAIL_FROM') || 'no-reply@localhost';
      const address = sender.match(/<([^<>]+)>\s*$/)?.[1] ?? sender;
      const payload = {
        // Keep the configured mailbox while enforcing the current display name,
        // including servers whose MAIL_FROM still contains older branding.
        from: { name: 'Poshtetgarm', address: address.trim() },
        ...mail,
      };
      await this.sendWithRetry(payload);
    } else if (this.env === 'test') {
      this.outbox.push(mail);
    } else if (this.env === 'production') {
      this.logger.warn('SMTP_URL is not set; email was not sent.');
    } else {
      this.logger.log(`Email to ${mail.to}: ${mail.subject}\n${mail.text}`);
    }
  }

  private async sendWithRetry(
    payload: Mail & { from: { name: string; address: string } },
  ): Promise<void> {
    const startedAt = Date.now();
    const deadlineAt = startedAt + SMTP_SEND_DEADLINE_MS;
    const hasProxy = this.proxyTransport !== null;
    const directDeadlineAt = hasProxy
      ? deadlineAt - SMTP_PROXY_RESERVED_BUDGET_MS
      : deadlineAt;
    const maxDirectAttempts = hasProxy
      ? SMTP_MAX_DIRECT_ATTEMPTS_WITH_PROXY
      : SMTP_MAX_DIRECT_ATTEMPTS;

    let attempts = 0;
    let lastRoute: MailRoute = 'direct';
    let lastCode = 'ESMTP_SEND';

    for (let i = 0; i < maxDirectAttempts; i++) {
      const remainingDirectMs = directDeadlineAt - Date.now();
      if (i > 0 && remainingDirectMs <= 0) {
        break;
      }
      attempts++;
      lastRoute = 'direct';
      try {
        await this.sendWithTimeout(
          this.transport!,
          payload,
          Math.max(1, remainingDirectMs),
        );
        this.logger.log(
          attempts > 1
            ? `SMTP delivery succeeded after retry (attempts=${attempts}, route=direct, durationMs=${Date.now() - startedAt})`
            : `SMTP delivery succeeded (attempts=1, route=direct, durationMs=${Date.now() - startedAt})`,
        );
        return;
      } catch (error) {
        const { transient, code } = classifySmtpError(error);
        lastCode = code;
        if (!transient) {
          this.logger.error(
            `SMTP delivery failed (attempts=${attempts}, route=${lastRoute}, code=${lastCode}, durationMs=${Date.now() - startedAt})`,
          );
          throw new Error(
            `SMTP delivery failed (attempts=${attempts}, route=${lastRoute}, code=${lastCode})`,
          );
        }
        if (i < maxDirectAttempts - 1) {
          const delayMs =
            SMTP_RETRY_DELAYS_MS[i] ??
            SMTP_RETRY_DELAYS_MS[SMTP_RETRY_DELAYS_MS.length - 1];
          if (Date.now() + delayMs >= directDeadlineAt) {
            break;
          }
          await this.delay(delayMs);
        }
      }
    }

    if (this.proxyTransport) {
      const remainingTotalMs = deadlineAt - Date.now();
      attempts++;
      lastRoute = 'proxy';
      try {
        await this.sendWithTimeout(
          this.proxyTransport,
          payload,
          Math.max(1, remainingTotalMs),
        );
        this.logger.log(
          `SMTP delivery succeeded after retry (attempts=${attempts}, route=proxy, durationMs=${Date.now() - startedAt})`,
        );
        return;
      } catch (error) {
        lastCode = classifySmtpError(error).code;
      }
    }

    this.logger.error(
      `SMTP delivery failed (attempts=${attempts}, route=${lastRoute}, code=${lastCode}, durationMs=${Date.now() - startedAt})`,
    );
    throw new Error(
      `SMTP delivery failed (attempts=${attempts}, route=${lastRoute}, code=${lastCode})`,
    );
  }
}
