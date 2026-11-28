import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  extractGrowthCampaign,
  type GrowthCampaign,
  type RegisterInput,
} from '@all-in-one/shared/schemas';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export const SMTP_CONNECTION_TIMEOUT_MS = 15_000;
export const SMTP_GREETING_TIMEOUT_MS = 15_000;
export const SMTP_SOCKET_TIMEOUT_MS = 30_000;
export const SMTP_MAX_DIRECT_ATTEMPTS = 3;
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
];

function buildSmtpOptions(
  rawUrl: string,
  proxyUrl?: string,
): (SMTPTransport.Options & { proxy?: string }) | string {
  try {
    const parsed = new URL(rawUrl);
    const secure =
      parsed.searchParams.get('secure') === 'true'
        ? true
        : parsed.searchParams.get('secure') === 'false'
          ? false
          : parsed.protocol === 'smtps:';
    const port = Number(parsed.port) || (secure ? 465 : 587);
    const options: SMTPTransport.Options & { proxy?: string } = {
      host: parsed.hostname || 'localhost',
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
      options.proxy = proxyUrl;
    }
    return options;
  } catch {
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
    this.transport = url ? createTransport(buildSmtpOptions(url)) : null;
    if (url && proxyUrl) {
      const proxyOpts = buildSmtpOptions(url, proxyUrl);
      const transport = createTransport(proxyOpts);
      if (typeof transport.setupProxy === 'function') {
        transport.setupProxy(proxyUrl);
      }
      this.proxyTransport = transport;
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
    let attempts = 0;
    let lastRoute: MailRoute = 'direct';
    let lastCode = 'ESMTP_SEND';

    for (let i = 0; i < SMTP_MAX_DIRECT_ATTEMPTS; i++) {
      attempts++;
      lastRoute = 'direct';
      try {
        await this.transport!.sendMail(payload);
        if (attempts > 1) {
          this.logger.log(
            `SMTP delivery succeeded after retry (attempts=${attempts}, route=direct, durationMs=${Date.now() - startedAt})`,
          );
        }
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
        if (i < SMTP_MAX_DIRECT_ATTEMPTS - 1) {
          await this.delay(
            SMTP_RETRY_DELAYS_MS[i] ??
              SMTP_RETRY_DELAYS_MS[SMTP_RETRY_DELAYS_MS.length - 1],
          );
        }
      }
    }

    if (this.proxyTransport) {
      attempts++;
      lastRoute = 'proxy';
      try {
        await this.proxyTransport.sendMail(payload);
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
