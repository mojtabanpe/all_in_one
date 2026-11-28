import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MailService,
  SMTP_CONNECTION_TIMEOUT_MS,
  SMTP_GREETING_TIMEOUT_MS,
  SMTP_SOCKET_TIMEOUT_MS,
} from './mail.service';

const { directSendMail, proxySendMail, setupProxy, createTransport } =
  vi.hoisted(() => {
    const directSendMail = vi.fn().mockResolvedValue({});
    const proxySendMail = vi.fn().mockResolvedValue({});
    const setupProxy = vi.fn();
    const createTransport = vi.fn((options?: { proxy?: string } | string) => {
      if (typeof options === 'object' && options?.proxy) {
        return { sendMail: proxySendMail, setupProxy };
      }
      return { sendMail: directSendMail, setupProxy };
    });
    return { directSendMail, proxySendMail, setupProxy, createTransport };
  });

vi.mock('nodemailer', () => ({ createTransport }));

describe('Email sender branding', () => {
  beforeEach(() => {
    directSendMail.mockReset().mockResolvedValue({});
    proxySendMail.mockReset().mockResolvedValue({});
    setupProxy.mockReset();
    createTransport.mockClear();
  });

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
      const service = new MailService(
        new ConfigService({ SMTP_URL: 'smtp://localhost', MAIL_FROM: from }),
      );
      await service.send({
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Test',
      });
      expect(directSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: { name: 'Poshtetgarm', address } }),
      );
    },
  );
});

describe('MailService SMTP timeouts, retry and proxy fallback', () => {
  const secretKey = 're_super_secret_token_value';
  const smtpUrl = `smtps://resend:${secretKey}@smtp.resend.com:465`;
  const proxyUrl = 'http://127.0.0.1:7890';
  const recipient = 'user-private@example.com';

  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    directSendMail.mockReset().mockResolvedValue({});
    proxySendMail.mockReset().mockResolvedValue({});
    setupProxy.mockReset();
    createTransport.mockClear();
    logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createService(withProxy = true): MailService {
    const service = new MailService(
      new ConfigService({
        SMTP_URL: smtpUrl,
        ...(withProxy ? { SMTP_PROXY_URL: proxyUrl } : {}),
        MAIL_FROM: 'Poshtetgarm <no-reply@poshtetgarm.ir>',
      }),
    );
    vi.spyOn(
      service as unknown as { delay: (ms: number) => Promise<void> },
      'delay',
    ).mockResolvedValue(undefined);
    return service;
  }

  it('succeeds on the first try with explicit timeouts and logs no retry line', async () => {
    const service = createService(false);

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass: secretKey },
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    });

    await service.send({
      to: recipient,
      subject: 'Verify',
      text: 'Body',
    });

    expect(directSendMail).toHaveBeenCalledTimes(1);
    expect(proxySendMail).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('retries transient connection timeouts and logs a single info line on recovery', async () => {
    const timeoutErr = Object.assign(new Error('Connection timeout'), {
      code: 'ETIMEDOUT',
    });
    const greetingErr = Object.assign(new Error('Greeting never received'), {
      code: 'ETIMEDOUT',
    });
    directSendMail
      .mockRejectedValueOnce(timeoutErr)
      .mockRejectedValueOnce(greetingErr)
      .mockResolvedValueOnce({});

    const service = createService(true);
    await service.send({
      to: recipient,
      subject: 'Verify',
      text: 'Body',
    });

    expect(directSendMail).toHaveBeenCalledTimes(3);
    expect(proxySendMail).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^SMTP delivery succeeded after retry \(attempts=3, route=direct, durationMs=\d+\)$/,
      ),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('falls back to the proxy transport when all direct attempts fail transiently', async () => {
    const socketErr = Object.assign(
      new Error('Connection closed unexpectedly'),
      {
        code: 'ECONNECTION',
      },
    );
    const tempSmtpErr = Object.assign(new Error('Try again later'), {
      code: 'EENVELOPE',
      responseCode: 421,
    });
    directSendMail
      .mockRejectedValueOnce(socketErr)
      .mockRejectedValueOnce(tempSmtpErr)
      .mockRejectedValueOnce(socketErr);
    proxySendMail.mockResolvedValueOnce({});

    const service = createService(true);
    expect(createTransport).toHaveBeenCalledTimes(2);
    expect(setupProxy).toHaveBeenCalledWith(proxyUrl);

    await service.send({
      to: recipient,
      subject: 'Verify',
      text: 'Body',
    });

    expect(directSendMail).toHaveBeenCalledTimes(3);
    expect(proxySendMail).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^SMTP delivery succeeded after retry \(attempts=4, route=proxy, durationMs=\d+\)$/,
      ),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not retry permanent 5xx rejections and does not fall back to proxy', async () => {
    const permErr = Object.assign(
      new Error(`550 5.1.1 <${recipient}>: Recipient address rejected`),
      {
        code: 'EENVELOPE',
        responseCode: 550,
      },
    );
    directSendMail.mockRejectedValueOnce(permErr);

    const service = createService(true);
    await expect(
      service.send({
        to: recipient,
        subject: 'Verify',
        text: 'Body',
      }),
    ).rejects.toThrow(
      'SMTP delivery failed (attempts=1, route=direct, code=SMTP_550)',
    );

    expect(directSendMail).toHaveBeenCalledTimes(1);
    expect(proxySendMail).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^SMTP delivery failed \(attempts=1, route=direct, code=SMTP_550, durationMs=\d+\)$/,
      ),
    );
  });

  it('never leaks SMTP_URL, credentials, proxy URL or recipient address in logs or thrown error', async () => {
    const directErr = Object.assign(
      new Error(`Connection timeout to ${smtpUrl} for ${recipient}`),
      { code: 'ETIMEDOUT' },
    );
    const proxyErr = Object.assign(
      new Error(`Proxy ${proxyUrl} failed for ${recipient} with ${secretKey}`),
      { code: 'EPROXY' },
    );
    directSendMail.mockRejectedValue(directErr);
    proxySendMail.mockRejectedValueOnce(proxyErr);

    const service = createService(true);
    let thrownMessage = '';
    try {
      await service.send({
        to: recipient,
        subject: 'Verify',
        text: 'Body',
      });
    } catch (error) {
      thrownMessage = (error as Error).message;
    }

    expect(directSendMail).toHaveBeenCalledTimes(3);
    expect(proxySendMail).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const loggedLines = [
      ...logSpy.mock.calls.map((call) => call.join(' ')),
      ...errorSpy.mock.calls.map((call) => call.join(' ')),
      thrownMessage,
    ].join('\n');

    expect(loggedLines).toContain('attempts=4, route=proxy, code=EPROXY');
    expect(loggedLines).not.toContain(recipient);
    expect(loggedLines).not.toContain(secretKey);
    expect(loggedLines).not.toContain(smtpUrl);
    expect(loggedLines).not.toContain(proxyUrl);
  });
});
