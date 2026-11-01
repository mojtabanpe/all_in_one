import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

const { sendMail } = vi.hoisted(() => ({
  sendMail: vi.fn().mockResolvedValue({}),
}));
vi.mock('nodemailer', () => ({ createTransport: vi.fn(() => ({ sendMail })) }));

describe('Email sender branding', () => {
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
