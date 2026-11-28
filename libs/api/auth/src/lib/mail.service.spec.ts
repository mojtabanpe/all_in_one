import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '@all-in-one/api/db';
import { AuthService } from './auth.service';
import {
  buildSmtpOptions,
  MailService,
  SMTP_CONNECTION_TIMEOUT_MS,
  SMTP_GREETING_TIMEOUT_MS,
  SMTP_MAX_DIRECT_ATTEMPTS,
  SMTP_MAX_DIRECT_ATTEMPTS_WITH_PROXY,
  SMTP_PROXY_RESERVED_BUDGET_MS,
  SMTP_PROXY_TUNNEL_TIMEOUT_MS,
  SMTP_RETRY_DELAYS_MS,
  SMTP_SEND_DEADLINE_MS,
  SMTP_SOCKET_TIMEOUT_MS,
  validateSmtpProxyUrl,
} from './mail.service';

const {
  directSendMail,
  proxySendMail,
  directClose,
  proxyClose,
  setupProxy,
  createTransport,
} = vi.hoisted(() => {
  const directSendMail = vi.fn().mockResolvedValue({});
  const proxySendMail = vi.fn().mockResolvedValue({});
  const directClose = vi.fn();
  const proxyClose = vi.fn();
  const setupProxy = vi.fn();
  const createTransport = vi.fn((options?: { proxy?: string } | string) => {
    if (typeof options === 'object' && options?.proxy) {
      return { sendMail: proxySendMail, close: proxyClose, setupProxy };
    }
    return { sendMail: directSendMail, close: directClose, setupProxy };
  });
  return {
    directSendMail,
    proxySendMail,
    directClose,
    proxyClose,
    setupProxy,
    createTransport,
  };
});

vi.mock('nodemailer', () => ({ createTransport }));

describe('Email sender branding', () => {
  beforeEach(() => {
    directSendMail.mockReset().mockResolvedValue({});
    proxySendMail.mockReset().mockResolvedValue({});
    directClose.mockReset();
    proxyClose.mockReset();
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
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    directSendMail.mockReset().mockResolvedValue({});
    proxySendMail.mockReset().mockResolvedValue({});
    directClose.mockReset();
    proxyClose.mockReset();
    setupProxy.mockReset();
    createTransport.mockClear();
    logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('succeeds on the first try with explicit timeouts and logs a sanitized delivery line', async () => {
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
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^SMTP delivery succeeded \(attempts=1, route=direct, durationMs=\d+\)$/,
      ),
    );
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

    const service = createService(false);
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

  it('falls back to the proxy transport after at most 2 direct attempts when proxy is configured', async () => {
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
      .mockRejectedValueOnce(tempSmtpErr);
    proxySendMail.mockResolvedValueOnce({});

    const service = createService(true);
    expect(createTransport).toHaveBeenCalledTimes(2);
    // setupProxy is handled inside nodemailer createTransport({ proxy }), not called a second time
    expect(setupProxy).not.toHaveBeenCalled();

    await service.send({
      to: recipient,
      subject: 'Verify',
      text: 'Body',
    });

    expect(directSendMail).toHaveBeenCalledTimes(
      SMTP_MAX_DIRECT_ATTEMPTS_WITH_PROXY,
    );
    expect(proxySendMail).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^SMTP delivery succeeded after retry \(attempts=3, route=proxy, durationMs=\d+\)$/,
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

    expect(directSendMail).toHaveBeenCalledTimes(
      SMTP_MAX_DIRECT_ATTEMPTS_WITH_PROXY,
    );
    expect(proxySendMail).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const loggedLines = [
      ...logSpy.mock.calls.map((call) => call.join(' ')),
      ...errorSpy.mock.calls.map((call) => call.join(' ')),
      ...warnSpy.mock.calls.map((call) => call.join(' ')),
      thrownMessage,
    ].join('\n');

    expect(loggedLines).toContain('attempts=3, route=proxy, code=EPROXY');
    expect(loggedLines).not.toContain(recipient);
    expect(loggedLines).not.toContain(secretKey);
    expect(loggedLines).not.toContain(smtpUrl);
    expect(loggedLines).not.toContain(proxyUrl);
  });

  it('keeps the worst-case send budget under 45 s (< 60 s gate) and bounds hanging attempts via the shared deadline', async () => {
    expect(SMTP_SEND_DEADLINE_MS).toBeLessThanOrEqual(45_000);
    expect(SMTP_PROXY_RESERVED_BUDGET_MS).toBeGreaterThanOrEqual(15_000);

    const maxDirectSocketStallWithProxy =
      SMTP_MAX_DIRECT_ATTEMPTS_WITH_PROXY * SMTP_SOCKET_TIMEOUT_MS +
      SMTP_RETRY_DELAYS_MS[0] +
      SMTP_PROXY_TUNNEL_TIMEOUT_MS +
      SMTP_SOCKET_TIMEOUT_MS;
    expect(maxDirectSocketStallWithProxy).toBeLessThanOrEqual(
      SMTP_SEND_DEADLINE_MS,
    );

    const maxDirectWithoutProxy =
      SMTP_MAX_DIRECT_ATTEMPTS * SMTP_SOCKET_TIMEOUT_MS +
      SMTP_RETRY_DELAYS_MS[0] +
      SMTP_RETRY_DELAYS_MS[1];
    expect(maxDirectWithoutProxy).toBeLessThanOrEqual(SMTP_SEND_DEADLINE_MS);

    vi.useFakeTimers();
    // Simulate a transport that ignores socketTimeout and hangs forever
    directSendMail.mockImplementation(() => new Promise(() => undefined));
    proxySendMail.mockResolvedValueOnce({});

    const service = new MailService(
      new ConfigService({
        SMTP_URL: smtpUrl,
        SMTP_PROXY_URL: proxyUrl,
      }),
    );

    const start = Date.now();
    const sendPromise = service.send({
      to: recipient,
      subject: 'Verify',
      text: 'Body',
    });

    await vi.advanceTimersByTimeAsync(
      SMTP_SEND_DEADLINE_MS - SMTP_PROXY_RESERVED_BUDGET_MS + 100,
    );
    await sendPromise;
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThanOrEqual(SMTP_SEND_DEADLINE_MS);
    expect(proxySendMail).toHaveBeenCalledTimes(1);
  });

  it('tears down a timed-out direct attempt and destroys its tracked socket before starting the proxy send', async () => {
    vi.useFakeTimers();
    const events: string[] = [];

    directSendMail.mockImplementation(() => {
      events.push('direct:start');
      return new Promise(() => undefined);
    });
    directClose.mockImplementation(() => {
      events.push('direct:abort');
    });
    proxySendMail.mockImplementation(async () => {
      events.push('proxy:start');
      return {};
    });

    const service = new MailService(
      new ConfigService({
        SMTP_URL: smtpUrl,
        SMTP_PROXY_URL: proxyUrl,
      }),
    );

    // Also verify the per-attempt socket controller directly destroys an in-flight socket
    const controller = (
      service as unknown as {
        createAttemptSocketController: (
          route: 'direct' | 'proxy',
          timeoutMs: number,
        ) => {
          getSocket: (
            options: {
              host?: string;
              port?: number;
              connectionTimeout?: number;
            },
            cb: (
              err: Error | null,
              res?: { connection: unknown } | false,
            ) => void,
          ) => void;
          abortAttempt: () => void;
        };
      }
    ).createAttemptSocketController('direct', 5_000);
    controller.abortAttempt();
    let abortedSocketErr: Error | null = null;
    controller.getSocket({ host: '127.0.0.1', port: 465 }, (err) => {
      abortedSocketErr = err;
    });
    expect(abortedSocketErr).toMatchObject({
      message: 'SMTP send deadline exceeded',
      code: 'ETIMEDOUT',
    });

    const sendPromise = service.send({
      to: recipient,
      subject: 'Verify',
      text: 'Body',
    });

    await vi.advanceTimersByTimeAsync(
      SMTP_SEND_DEADLINE_MS - SMTP_PROXY_RESERVED_BUDGET_MS + 100,
    );
    await sendPromise;

    expect(events).toEqual(['direct:start', 'direct:abort', 'proxy:start']);
  });

  it('validates SMTP_PROXY_URL protocol, strips IPv6 brackets and logs a sanitized warning on unparseable SMTP_URL', () => {
    const ipv6Opts = buildSmtpOptions('smtps://user:pass@[::1]:465');
    expect(ipv6Opts).toEqual(
      expect.objectContaining({
        host: '::1',
        port: 465,
        secure: true,
      }),
    );

    const warnings: string[] = [];
    const fallback = buildSmtpOptions(
      'not a url with secret_cred',
      undefined,
      (msg) => warnings.push(msg),
    );
    expect(fallback).toBe('not a url with secret_cred');
    expect(warnings).toEqual([
      'SMTP_URL could not be parsed into options; falling back to default transport settings.',
    ]);
    expect(warnings[0]).not.toContain('secret_cred');

    expect(() => validateSmtpProxyUrl('http://127.0.0.1:7890')).not.toThrow();
    expect(() =>
      validateSmtpProxyUrl('https://proxy.example.com:8443'),
    ).not.toThrow();
    expect(() => validateSmtpProxyUrl('socks5://127.0.0.1:7891')).toThrow(
      /only http: and https: are supported/,
    );
    expect(() => validateSmtpProxyUrl('127.0.0.1:7890')).toThrow();
  });
});

describe('AuthService.requestEmail fire-and-forget', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns without awaiting a stalled mail.send and logs a sanitized error when sending fails', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    let rejectSend!: (err: Error) => void;
    const sendPromise = new Promise<void>((_, reject) => {
      rejectSend = reject;
    });
    const mail = {
      enabled: true,
      send: vi.fn().mockReturnValue(sendPromise),
      link: vi
        .fn()
        .mockReturnValue('https://poshtetgarm.ir/app/verify-email?token=t'),
    };
    const prisma = {
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'u1',
          email: null,
          phone: '+989121234567',
        }),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      emailVerification: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const auth = new AuthService(
      prisma as unknown as PrismaService,
      {} as JwtService,
      mail as unknown as MailService,
      new ConfigService({}),
    );

    // Must resolve immediately even though mail.send has not settled
    await expect(
      auth.requestEmail('u1', 'NewUser@Example.com'),
    ).resolves.toBeUndefined();
    expect(prisma.emailVerification.create).toHaveBeenCalledTimes(1);
    expect(mail.send).toHaveBeenCalledTimes(1);

    // When the background send eventually fails, it logs instead of crashing or throwing 500
    rejectSend(
      new Error(
        'SMTP delivery failed (attempts=3, route=proxy, code=ETIMEDOUT)',
      ),
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(errorSpy).toHaveBeenCalledWith(
      'Verification email failed: SMTP delivery failed (attempts=3, route=proxy, code=ETIMEDOUT)',
    );
  });
});
