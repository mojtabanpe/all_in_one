import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

const { sendMail } = vi.hoisted(() => ({
  sendMail: vi.fn().mockResolvedValue({}),
}));
vi.mock('nodemailer', () => ({ createTransport: vi.fn(() => ({ sendMail })) }));

describe('Email sender branding', () => {
  it('preserves the app base path and only safe campaign keys in verification links', () => {
    const service = new MailService(
      new ConfigService({
        APP_PUBLIC_URL: 'https://poshtetgarm.ir/app',
        SMTP_URL: '',
      }),
    );
    const url = new URL(
      service.link('verify-email', 'original-token', {
        utm_source: 'newsletter',
        utm_campaign: 'Persian campaign',
        token: 'replace-token',
        redirect: 'https://example.com',
        visitorId: 'private-id',
      } as never),
    );
    expect(url.origin + url.pathname).toBe(
      'https://poshtetgarm.ir/app/verify-email',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      token: 'original-token',
      utm_source: 'newsletter',
      utm_campaign: 'Persian campaign',
    });
    expect(new URL(service.link('reset-password', 'reset-token')).search).toBe(
      '?token=reset-token',
    );
  });
  it('drops oversized/control-character campaign values', () => {
    const service = new MailService(
      new ConfigService({
        APP_PUBLIC_URL: 'https://poshtetgarm.ir/app',
        SMTP_URL: '',
      }),
    );
    const url = new URL(
      service.link('verify-email', 'original-token', {
        utm_source: 'x'.repeat(201),
        utm_medium: 'bad\nvalue',
        utm_content: 'valid&encoded',
      }),
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      token: 'original-token',
      utm_content: 'valid&encoded',
    });
  });
  it.each([
    ['Legacy name <sender@example.com>', 'sender@example.com'],
    ['sender@example.com', 'sender@example.com'],
    [undefined, 'no-reply@localhost'],
  ])(
    'uses Poshtetgarm while preserving the configured mailbox',
    async (from, address) => {
      sendMail.mockClear();
      const service = new MailService(
        new ConfigService({ SMTP_URL: 'smtp://localhost', MAIL_FROM: from }),
      );
      await service.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test',
      });
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: { name: 'Poshtetgarm', address } }),
      );
    },
  );
});
