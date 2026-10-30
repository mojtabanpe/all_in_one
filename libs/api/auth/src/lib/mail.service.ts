import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
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
  readonly outbox: Mail[] = [];

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('SMTP_URL');
    this.transport = url ? createTransport(url) : null;
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
  link(path: string, token: string): string {
    const url = new URL(path, this.appUrl);
    url.searchParams.set('token', token);
    return url.href;
  }

  async send(mail: Mail): Promise<void> {
    if (this.transport) {
      await this.transport.sendMail({
        from:
          this.config.get<string>('MAIL_FROM') ||
          'همه در یک <no-reply@localhost>',
        ...mail,
      });
    } else if (this.env === 'test') {
      this.outbox.push(mail);
    } else if (this.env === 'production') {
      this.logger.warn('SMTP_URL is not set; email was not sent.');
    } else {
      this.logger.log(`Email to ${mail.to}: ${mail.subject}\n${mail.text}`);
    }
  }
}
