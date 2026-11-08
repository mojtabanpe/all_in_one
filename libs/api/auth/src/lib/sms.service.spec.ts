import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { iranMobile } from '@all-in-one/shared/schemas';
import { FARAZ_API, SmsService, smsDate } from './sms.service';

const KEY = 'test-only-faraz-key';
const service = (config: Record<string, string> = {}) =>
  new SmsService(
    new ConfigService({
      SMS_ENABLED: 'true',
      FARAZ_SMS_API_KEY: KEY,
      ...config,
    }),
  );

function reply(status: number, body: unknown) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SmsService (Faraz)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is off without the switch or the key, and sends nothing', async () => {
    const fetchMock = reply(200, {});
    for (const config of [
      { SMS_ENABLED: 'false' },
      { FARAZ_SMS_API_KEY: ' ' },
    ]) {
      const sms = service(config);
      expect(sms.enabled).toBe(false);
      await expect(
        sms.send('AUTH_CODE', '+989121234567', {
          code: '123456',
          minutes: '5',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      sms.notify('PASSWORD_CHANGED', '+989121234567', {});
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the approved pattern from the account line with the key as Api-Key', async () => {
    const fetchMock = reply(201, {
      status: 'success',
      data: 1,
      messages: null,
    });
    await service().send('SUBSCRIPTION_ACTIVATED', '+989121234567', {
      plan: 'ماهانه',
      expiry_date: '1405/09/16',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(FARAZ_API);
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Api-Key': KEY,
    });
    expect(JSON.parse(init.body)).toEqual({
      code: 'K1pz92FHPc',
      attributes: { plan: 'ماهانه', expiry_date: '1405/09/16' },
      recipient: '09121234567',
      line_number: '3000505',
      number_format: 'english',
    });
  });

  it('fails without exposing the key or the code when Faraz refuses', async () => {
    const warn = vi.spyOn(
      (service() as unknown as { logger: { warn: () => void } }).logger,
      'warn',
    );
    for (const [status, body] of [
      [401, { status: 'error', data: null, message: 'Unauthorized' }],
      [
        422,
        {
          status: 'error',
          data: null,
          messages: { recipient: ['09121234567 is invalid'] },
        },
      ],
      [
        200,
        { status: 'error', data: null, messages: 'pattern 654321 not found' },
      ],
    ] as const) {
      reply(status, body);
      const sms = service();
      const logged = vi.spyOn(
        (sms as unknown as { logger: { warn: (m: string) => void } }).logger,
        'warn',
      );
      await expect(
        sms.send('AUTH_CODE', '+989121234567', {
          code: '654321',
          minutes: '5',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      const message = String(logged.mock.calls[0]?.[0]);
      expect(message).toContain('AUTH_CODE failed');
      expect(message).not.toContain(KEY);
      expect(message).not.toContain('654321');
      expect(message).not.toContain('912');
      expect(message).toMatch(
        /HTTP (401 Unauthorized|422 recipient|200 pattern)/,
      );
    }
    warn.mockRestore();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(KEY)));
    await expect(
      service().send('PASSWORD_CHANGED', '+989121234567', {}),
    ).rejects.toThrow('پیامک ارسال نشد');
  });

  it('never lets a failed notice escape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(() =>
      service().notify('PASSWORD_CHANGED', '+989121234567', {}),
    ).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('writes %expiry_date% as a Tehran Solar Hijri day with Latin digits', () => {
    expect(smsDate(new Date('2026-11-07T12:00:00Z'))).toBe('1405/08/16');
    // 22:00 UTC is already the next day in Tehran.
    expect(smsDate(new Date('2026-12-06T22:00:00Z'))).toBe('1405/09/16');
  });
});

describe('iranMobile', () => {
  it.each([
    ['09121234567', '+989121234567'],
    ['9121234567', '+989121234567'],
    ['+98 912 123 4567', '+989121234567'],
    ['00989121234567', '+989121234567'],
    ['۰۹۱۲۱۲۳۴۵۶۷', '+989121234567'],
    ['0912-123-4567', '+989121234567'],
  ])('reads %s', (input, expected) => {
    expect(iranMobile(input)).toBe(expected);
  });

  it.each(['02112345678', '0912123456', '+14155550100', '0912123456789', ''])(
    'rejects %s',
    (input) => {
      expect(iranMobile(input)).toBeNull();
    },
  );
});
