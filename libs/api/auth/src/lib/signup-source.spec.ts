import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

// Synthetic fixtures only.
const visitorId = '019a59e3-4070-7000-8000-000000000001';
const email = 'signup-source@example.invalid';

function setup(
  options: {
    analytics?: string;
    qa?: string;
    events?: { campaign: unknown }[];
    existingPhone?: boolean;
  } = {},
) {
  const create = vi.fn().mockResolvedValue({ id: 'new-account', email });
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
      .mockResolvedValue(options.qa ? [{ source: options.qa }] : []),
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
  return { auth, prisma, create, update, updateMany, createMany, source };
}

const register = (acquisition?: object) => ({
  email,
  password: 'synthetic-password',
  ...(acquisition ? { acquisition } : {}),
});

describe('Signup source on the new account', () => {
  it('keeps the signup campaign source, lower-cased, in the creating insert', async () => {
    const t = setup();
    await t.auth.register(
      register({
        visitorId,
        language: 'fa',
        campaign: { utm_source: 'Instagram', utm_medium: 'organic' },
      }),
    );
    expect(t.source()).toBe('instagram');
    // The account keeps the source only; medium, campaign and visitor stay in growth events.
    expect(JSON.stringify(t.create.mock.calls[0][0].data)).not.toMatch(
      /organic|utm_|019a59e3/,
    );
    expect(t.createMany.mock.calls[0][0].data[0].campaign).toEqual({
      utm_source: 'Instagram',
      utm_medium: 'organic',
    });
  });

  it('uses the visitor first touch when the URL lost it, and direct without any tag', async () => {
    const tagged = setup({
      events: [{ campaign: { utm_source: 'telegram' } }],
    });
    await tagged.auth.register(register({ visitorId, language: 'fa' }));
    expect(tagged.source()).toBe('telegram');
    const untagged = setup();
    await untagged.auth.register(register({ visitorId, language: 'fa' }));
    expect(untagged.source()).toBe('direct');
  });

  it('marks a visitor with any retained QA tag as QA', async () => {
    const t = setup({ qa: 'roadmap_check' });
    await t.auth.register(
      register({ visitorId, language: 'fa', campaign: { utm_source: 'ads' } }),
    );
    expect(t.source()).toBe('roadmap_check');
  });

  it('records nothing for an opted-out visitor or with analytics off', async () => {
    const optedOut = setup();
    await optedOut.auth.register(register());
    expect(optedOut.source()).toBeNull();
    expect(optedOut.createMany).not.toHaveBeenCalled();
    const off = setup({ analytics: 'false' });
    await off.auth.register(
      register({ visitorId, language: 'fa', campaign: { utm_source: 'x' } }),
    );
    expect(off.source()).toBeNull();
    expect(off.createMany).not.toHaveBeenCalled();
  });

  it('sets the source once for a new phone account and never touches an existing one', async () => {
    const created = setup();
    await created.auth.signInByPhone('+989000000000', {
      visitorId,
      language: 'fa',
      campaign: { utm_source: 'myket' },
    });
    expect(created.source()).toBe('myket');
    const existing = setup({ existingPhone: true });
    const result = await existing.auth.signInByPhone('+989000000000', {
      visitorId,
      language: 'fa',
      campaign: { utm_source: 'myket' },
    });
    expect(result.created).toBe(false);
    expect(existing.create).not.toHaveBeenCalled();
    expect(existing.update).not.toHaveBeenCalled();
    expect(existing.updateMany).not.toHaveBeenCalled();
  });

  it('still creates the account when every analytics read fails', async () => {
    const t = setup();
    t.prisma.growthEvent.findMany.mockRejectedValue(new Error('down'));
    t.prisma.$queryRaw.mockRejectedValue(new Error('down'));
    await expect(
      t.auth.register(register({ visitorId, language: 'fa' })),
    ).resolves.toMatchObject({ id: 'new-account' });
    expect(t.source()).toBe('direct');
  });
});
