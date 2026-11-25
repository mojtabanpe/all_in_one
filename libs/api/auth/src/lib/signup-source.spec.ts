import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// Synthetic fixtures only.
const visitorId = '019a59e3-4070-7000-8000-000000000001';
const email = 'signup-source@example.invalid';

function setup(
  options: {
    analytics?: string;
    /** The visitor's earliest recorded utm_source and any retained QA tag. */
    first?: string;
    qa?: string;
    events?: { campaign: unknown }[];
    existingPhone?: boolean;
  } = {},
) {
  const create = vi.fn().mockResolvedValue({
    id: 'new-account',
    email,
    phone: null,
    passwordHash: null,
    name: null,
    role: 'CUSTOMER',
    enabledApplets: [],
    createdAt: new Date('2031-03-01T00:00:00Z'),
  });
  const update = vi.fn();
  const updateMany = vi.fn();
  const createMany = vi.fn();
  const prisma = {
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValue(options.existingPhone ? { id: 'old' } : null),
      create,
      update,
      updateMany,
    },
    growthEvent: {
      findMany: vi.fn().mockResolvedValue(options.events ?? []),
      createMany,
    },
    $queryRaw: vi
      .fn()
      .mockResolvedValue([
        { first: options.first ?? null, qa: options.qa ?? null },
      ]),
  };
  const auth = new AuthService(
    prisma as never,
    {} as never,
    {} as never,
    new ConfigService({
      REQUIRE_EMAIL_VERIFICATION: 'false',
      GROWTH_ANALYTICS_ENABLED: options.analytics ?? 'true',
    }),
  );
  const source = () => create.mock.calls[0]?.[0].data.signupSource;
  const event = () => createMany.mock.calls[0]?.[0].data[0];
  return {
    auth,
    prisma,
    create,
    update,
    updateMany,
    createMany,
    source,
    event,
  };
}

const register = (acquisition?: object) => ({
  email,
  password: 'synthetic-password',
  ...(acquisition ? { acquisition } : {}),
});
const tagged = (utm_source: string) => ({
  visitorId,
  language: 'fa' as const,
  campaign: { utm_source },
});

describe('Signup source on the new account', () => {
  it('keeps a known URL source, lower-cased, in the creating insert only', async () => {
    const t = setup();
    await t.auth.register(
      register({
        visitorId,
        language: 'fa',
        campaign: { utm_source: 'Instagram', utm_medium: 'organic' },
      }),
    );
    expect(t.source()).toBe('instagram');
    // Medium, campaign and the visitor stay in growth events only.
    expect(JSON.stringify(t.create.mock.calls[0][0].data)).not.toMatch(
      /organic|utm_|019a59e3/,
    );
    expect(t.event().campaign).toEqual({
      utm_source: 'Instagram',
      utm_medium: 'organic',
    });
  });

  it('prefers the visitor first touch over the signup URL, without changing signup_completed', async () => {
    const t = setup({ first: 'telegram' });
    await t.auth.register(register(tagged('instagram')));
    expect(t.source()).toBe('telegram');
    // The event keeps its existing contract: the URL campaign when it has one.
    expect(t.event().campaign).toEqual({ utm_source: 'instagram' });
  });

  it('keeps direct for an untagged signup and other for an unlisted or ID-like source', async () => {
    const untagged = setup();
    await untagged.auth.register(register({ visitorId, language: 'fa' }));
    expect(untagged.source()).toBe('direct');
    for (const value of ['09120000000', 'user-1234', 'tg_partner']) {
      const t = setup({ first: value });
      await t.auth.register(register(tagged('instagram')));
      expect(t.source()).toBe('other');
    }
  });

  it('marks a visitor with any retained QA tag, or a QA URL, as QA', async () => {
    const retained = setup({ first: 'instagram', qa: 'roadmap_check' });
    await retained.auth.register(register(tagged('telegram')));
    expect(retained.source()).toBe('roadmap_check');
    const url = setup({ first: 'instagram' });
    await url.auth.register(register(tagged('QA')));
    expect(url.source()).toBe('qa');
  });

  it('records unknown, apart from direct, when the source cannot be read', async () => {
    const t = setup();
    t.prisma.growthEvent.findMany.mockRejectedValue(new Error('down'));
    t.prisma.$queryRaw.mockRejectedValue(new Error('down'));
    await expect(
      t.auth.register(register({ visitorId, language: 'fa' })),
    ).resolves.toMatchObject({ id: 'new-account' });
    expect(t.source()).toBe('unknown');
  });

  it('records nothing for an opted-out visitor or with analytics off', async () => {
    const optedOut = setup();
    await optedOut.auth.register(register());
    expect(optedOut.source()).toBeNull();
    expect(optedOut.createMany).not.toHaveBeenCalled();
    const off = setup({ analytics: 'false' });
    await off.auth.register(register(tagged('instagram')));
    expect(off.source()).toBeNull();
    expect(off.createMany).not.toHaveBeenCalled();
    expect(off.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('sets the source once for a new phone account and never touches an existing one', async () => {
    const created = setup();
    await created.auth.signInByPhone('+989000000000', tagged('linkedin'));
    expect(created.source()).toBe('linkedin');
    const existing = setup({ existingPhone: true });
    const result = await existing.auth.signInByPhone(
      '+989000000000',
      tagged('linkedin'),
    );
    expect(result.created).toBe(false);
    expect(existing.create).not.toHaveBeenCalled();
    expect(existing.update).not.toHaveBeenCalled();
    expect(existing.updateMany).not.toHaveBeenCalled();
  });
});

describe('Opted-out signups that still send attribution', () => {
  const optOut = 'theme=dark; aio_growth_preference=denied';

  it('drops the payload on email signup: null source and no growth event', async () => {
    const t = setup({ first: 'instagram' });
    const controller = new AuthController(
      t.auth,
      {} as never,
      new ConfigService({}),
      {} as never,
    );
    Object.assign(controller, { startSession: vi.fn() });
    await controller.register(
      register(tagged('instagram')) as never,
      {},
      optOut,
    );
    expect(t.source()).toBeNull();
    expect(t.createMany).not.toHaveBeenCalled();
    expect(t.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('drops the payload on SMS signup, and keeps it without the cookie', async () => {
    for (const [cookie, expected] of [
      [optOut, null],
      ['aio_growth_preference=granted', 'instagram'],
    ] as const) {
      const t = setup();
      const controller = new AuthController(
        t.auth,
        {} as never,
        new ConfigService({}),
        { verifyLogin: vi.fn().mockResolvedValue('+989000000000') } as never,
      );
      Object.assign(controller, { startSession: vi.fn() });
      await controller.smsLogin(
        {
          phone: '+989000000000',
          code: '000000',
          acquisition: tagged('instagram'),
        } as never,
        {},
        cookie,
      );
      expect(t.source()).toBe(expected);
    }
  });
});
