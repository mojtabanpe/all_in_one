import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Faraz SMS's own API (https://docs.iranpayamak.com/send-pattern-based-sms-13925177e0.md). Faraz keys are refused
 * by IPPanel Edge, which this client used before (2026-11-08).
 */
export const FARAZ_API = 'https://api.iranpayamak.com/ws/v1/sms/pattern';
/**
 * Faraz's public service line (directive 117). The account's own line 20002178584475 is not a service line, so
 * operators never delivered its codes. `FARAZ_SMS_SENDER` can replace it.
 */
export const FARAZ_SENDER = '3000505';

/** Approved pattern codes (directive 88) and the variables each was submitted with. */
export const SMS_TEMPLATES = {
  AUTH_CODE: { code: '55qc3IG5ba', params: ['code', 'minutes'] },
  PASSWORD_RESET: { code: 'N7zuaY8kHN', params: ['code', 'minutes'] },
  PASSWORD_CHANGED: { code: 't7D480PuMg', params: [] },
  SUBSCRIPTION_ACTIVATED: {
    code: 'K1pz92FHPc',
    params: ['plan', 'expiry_date'],
  },
  SUBSCRIPTION_EXPIRING: {
    code: '5O4Ya9gB3f',
    params: ['plan', 'expiry_date'],
  },
} as const;
export type SmsTemplate = keyof typeof SMS_TEMPLATES;
type Params<T extends SmsTemplate> = Record<
  (typeof SMS_TEMPLATES)[T]['params'][number],
  string
>;

/** `YYYY/MM/DD` in the Solar Hijri calendar with Latin digits, Tehran day (the `%expiry_date%` format). */
export function smsDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    numberingSystem: 'latn',
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}/${part('month')}/${part('day')}`;
}

/** Faraz's error text for the log: field names only for validation errors, digits masked so no number or code leaks. */
function smsFailure(message: unknown): string {
  const text =
    message && typeof message === 'object' && !Array.isArray(message)
      ? Object.keys(message).join(',')
      : String(message ?? '');
  return text.replace(/\d/g, '#').slice(0, 120);
}

/**
 * Sends pattern SMS through Faraz. Off unless `SMS_ENABLED=true` and `FARAZ_SMS_API_KEY` is set (the key lives
 * only in server secrets). Codes, numbers and the key are never logged.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  private get key(): string {
    return this.config.get<string>('FARAZ_SMS_API_KEY')?.trim() ?? '';
  }

  get enabled(): boolean {
    return this.config.get<string>('SMS_ENABLED') === 'true' && !!this.key;
  }

  private get sender(): string {
    return (
      this.config.get<string>('FARAZ_SMS_SENDER')?.trim() || FARAZ_SENDER
    ).replace(/^(\+98|0098)/, '');
  }

  /** Throws 503 when SMS is off or Faraz refuses or cannot be reached. */
  async send<T extends SmsTemplate>(
    template: T,
    to: string,
    params: Params<T>,
  ): Promise<void> {
    if (!this.enabled)
      throw new ServiceUnavailableException('ارسال پیامک فعلاً فعال نیست.');
    let ok = false;
    let reason = 'unreachable';
    try {
      const response = await fetch(FARAZ_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Api-Key': this.key,
        },
        body: JSON.stringify({
          code: SMS_TEMPLATES[template].code,
          attributes: params,
          // Faraz wants the local form: +989121234567 -> 09121234567.
          recipient: to.replace(/^\+98/, '0'),
          line_number: this.sender,
          number_format: 'english',
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await response.json().catch(() => null)) as {
        status?: unknown;
        message?: unknown;
        messages?: unknown;
      } | null;
      ok = response.ok && body?.status === 'success';
      reason = `HTTP ${response.status} ${smsFailure(body?.messages ?? body?.message)}`;
    } catch {
      // The provider's error text could echo the request; only the kind of failure is kept.
    }
    if (!ok) {
      this.logger.warn(`SMS ${template} failed: ${reason.trim()}`);
      throw new ServiceUnavailableException(
        'پیامک ارسال نشد. کمی بعد دوباره امتحان کن.',
      );
    }
  }

  /** For notices: a failed SMS must never undo what it reports. */
  notify<T extends SmsTemplate>(
    template: T,
    to: string | null | undefined,
    params: Params<T>,
  ): void {
    if (!to || !this.enabled) return;
    this.send(template, to, params).catch(() => undefined);
  }
}
