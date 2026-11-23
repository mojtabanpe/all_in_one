import { ConfigService } from '@nestjs/config';
import { InAppNotificationsService } from './in-app-notifications';
import { PrismaService } from '@all-in-one/api/db';
import type { BillingService } from './billing/billing.service';

const content = {
  title: { fa: 'خبر', en: 'News' },
  message: { fa: 'پیام', en: 'Message' },
  actions: [],
};
function setup() {
  const db = {
    inAppNotification: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      upsert: vi.fn().mockResolvedValue({ id: 'id' }),
      findMany: vi.fn().mockResolvedValue([{ id: 'general', content }]),
    },
  };
  const billing = {
    access: vi.fn().mockResolvedValue({ tier: 'free', trialUntil: null }),
    rewardOffers: vi.fn().mockResolvedValue([]),
  };
  return {
    db,
    billing,
    service: new InAppNotificationsService(
      db as unknown as PrismaService,
      billing as unknown as BillingService,
    ),
  };
}
describe('server-driven in-app notifications', () => {
  const now = new Date('2026-11-13T10:00:00Z');
  it('returns arbitrary server content and queries only this account’s unexpired, undismissed messages', async () => {
    const { db, service } = setup();
    expect(await service.pending('owner', now)).toEqual([
      { id: 'general', ...content },
    ]);
    expect(db.inAppNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'owner', dismissedAt: null, expiresAt: { gt: now } },
      }),
    );
  });
  it('dismisses only owned notices, idempotently', async () => {
    const { db, service } = setup();
    await service.dismiss('owner', 'notice');
    expect(db.inAppNotification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notice', userId: 'owner', dismissedAt: null },
      data: { dismissedAt: expect.any(Date) },
    });
  });
  it('creates an eligible daily trial reminder without resetting a previous dismissal', async () => {
    const { db, billing, service } = setup();
    const end = new Date(now.getTime() + 2 * 86_400_000).toISOString();
    billing.access.mockResolvedValue({
      tier: 'trial',
      trialUntil: end,
      aiUntil: end,
    } as never);
    billing.rewardOffers.mockResolvedValue([
      { campaign: 'TELEGRAM_JOIN', status: 'available' },
    ] as never);
    await service.pending('owner', now);
    const request = db.inAppNotification.upsert.mock.calls[0][0];
    expect(request.create.content.actions).toHaveLength(2);
    expect(request.update).not.toHaveProperty('dismissedAt');
    expect(request.create.expiresAt).toEqual(new Date(end));
  });
  it('does not create trial reminders before the window, after expiry, or with queued gift time', async () => {
    for (const offset of [4 * 86_400_000, 0, -1]) {
      const { db, billing, service } = setup();
      billing.access.mockResolvedValue({
        tier: 'trial',
        trialUntil: new Date(+now + offset).toISOString(),
      } as never);
      await service.pending('owner', now);
      expect(db.inAppNotification.upsert).not.toHaveBeenCalled();
    }
    const { db, billing, service } = setup();
    billing.access.mockResolvedValue({
      tier: 'trial',
      trialUntil: new Date(+now + 1000).toISOString(),
      aiUntil: new Date(+now + 86_400_000).toISOString(),
    } as never);
    await service.pending('owner', now);
    expect(db.inAppNotification.upsert).not.toHaveBeenCalled();
  });
});

describe.skipIf(process.env['IN_APP_DB_INTEGRATION'] !== '1')(
  'in-app persistence (PostgreSQL)',
  () => {
    let db: PrismaService;
    const users: string[] = [];
    const billing = {
      access: vi.fn().mockResolvedValue({ tier: 'free', trialUntil: null }),
      rewardOffers: vi.fn().mockResolvedValue([]),
    };
    beforeAll(() => {
      const url = process.env['DATABASE_URL'];
      if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
        throw new Error('A local database is required');
      db = new PrismaService(new ConfigService({ DATABASE_URL: url }));
    });
    afterAll(async () => {
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });
    it('persists generic notices, isolates accounts, and remembers dismissal across service instances', async () => {
      const first = await db.user.create({ data: {} });
      const second = await db.user.create({ data: {} });
      users.push(first.id, second.id);
      const service = new InAppNotificationsService(
        db,
        billing as unknown as BillingService,
      );
      const input = {
        userId: first.id,
        key: 'announcement',
        content,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      };
      const notice = await service.create(input);
      expect((await service.create(input)).id).toBe(notice.id);
      expect(await service.pending(second.id)).toEqual([]);
      await service.dismiss(second.id, notice.id);
      expect(await service.pending(first.id)).toEqual([
        { id: notice.id, ...content },
      ]);
      await service.dismiss(first.id, notice.id);
      const otherDevice = new InAppNotificationsService(
        db,
        billing as unknown as BillingService,
      );
      expect(await otherDevice.pending(first.id)).toEqual([]);
      await service.create({
        ...input,
        key: 'expired',
        expiresAt: new Date(0).toISOString(),
      });
      expect(await service.pending(first.id)).toEqual([]);
    });

    it('creates the old Android shell update notice once per account and skips accounts with local reminder devices', async () => {
      const oldUser = await db.user.create({ data: {} });
      const updatedUser = await db.user.create({ data: {} });
      users.push(oldUser.id, updatedUser.id);
      await db.localReminderDevice.create({
        data: { userId: updatedUser.id, client: 'bazaar', reminders: 2 },
      });
      const service = new InAppNotificationsService(
        db,
        billing as unknown as BillingService,
        undefined,
        new ConfigService({ ANDROID_SHELL_LATEST_VERSION: '1.0.7' }),
      );
      const bazaar =
        'Mozilla/5.0 (Linux; Android 14; wv) PoshtetgarmStore/bazaar';

      expect(await service.pending(updatedUser.id, new Date(), bazaar)).toEqual(
        [],
      );
      const firstRun = await service.pending(oldUser.id, new Date(), bazaar);
      expect(firstRun).toHaveLength(1);
      expect(firstRun[0].actions[0]?.url).toBe(
        'https://cafebazaar.ir/app/ir.poshtetgarm.poshtetgarm_hybrid',
      );
      await service.dismiss(oldUser.id, firstRun[0].id);
      expect(await service.pending(oldUser.id, new Date(), bazaar)).toEqual([]);
    });
  },
);

describe('store rating notice', () => {
  const now = new Date('2026-11-18T10:00:00Z');
  const bazaar = 'Mozilla/5.0 (Linux; Android 14) PoshtetgarmStore/bazaar';
  function rating(opts: {
    existing?: boolean;
    ageDays?: number;
    role?: string;
    activeDays?: number;
  }) {
    const db = {
      inAppNotification: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({ id: 'id' }),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi
          .fn()
          .mockResolvedValue(opts.existing ? { id: 'old' } : null),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          role: opts.role ?? 'CUSTOMER',
          createdAt: new Date(+now - (opts.ageDays ?? 5) * 86_400_000),
        }),
      },
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ days: BigInt(opts.activeDays ?? 4) }]),
    };
    const billing = {
      access: vi.fn().mockResolvedValue({ tier: 'free', trialUntil: null }),
      rewardOffers: vi.fn().mockResolvedValue([]),
    };
    const service = new InAppNotificationsService(
      db as unknown as PrismaService,
      billing as unknown as BillingService,
    );
    const ratingCalls = () =>
      db.inAppNotification.upsert.mock.calls.filter(
        ([call]) => call.create.source === 'rating',
      );
    return { db, service, ratingCalls };
  }

  it('asks an active store customer once, with that store’s page', async () => {
    const { service, ratingCalls } = rating({});
    await service.pending('owner', now, bazaar);
    const [[call]] = ratingCalls();
    expect(call.where).toEqual({
      userId_key: { userId: 'owner', key: 'rate:bazaar' },
    });
    expect(call.update).toEqual({});
    expect(call.create.content.actions[0].url).toBe(
      'https://cafebazaar.ir/app/ir.poshtetgarm.poshtetgarm_hybrid',
    );
  });

  it('uses the Myket page in the Myket build', async () => {
    const { service, ratingCalls } = rating({});
    await service.pending('owner', now, 'Android PoshtetgarmStore/myket');
    expect(ratingCalls()[0][0].create.content.actions[0].url).toBe(
      'https://myket.ir/app/ir.poshtetgarm.poshtetgarm_hybrid',
    );
  });

  it.each([
    ['outside a store build', {}, 'Mozilla/5.0 Chrome'],
    ['after it was shown once', { existing: true }, bazaar],
    ['to a new account', { ageDays: 1 }, bazaar],
    ['to an account active on fewer days', { activeDays: 2 }, bazaar],
    ['to an admin', { role: 'ADMIN' }, bazaar],
  ])('does not ask %s', async (_label, opts, agent) => {
    const { service, ratingCalls } = rating(opts);
    await service.pending('owner', now, agent);
    expect(ratingCalls()).toHaveLength(0);
  });
});

describe('old Android shell update notice', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv)';
  const bazaar = `${android} PoshtetgarmStore/bazaar`;
  const myket = `${android} PoshtetgarmStore/myket`;

  function setupShell(opts: {
    latest?: string;
    perStore?: Record<string, string>;
    existing?: boolean;
    hasLocalReminders?: boolean;
  }) {
    const db = {
      inAppNotification: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({ id: 'id' }),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(({ where }) =>
          where.userId_key.key.startsWith('android-shell-update:')
            ? Promise.resolve(opts.existing ? { id: 'old' } : null)
            : Promise.resolve({ id: 'skip-rating' }),
        ),
      },
      localReminderDevice: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            opts.hasLocalReminders ? { userId: 'owner' } : null,
          ),
      },
    };
    const billing = {
      access: vi.fn().mockResolvedValue({ tier: 'free', trialUntil: null }),
      rewardOffers: vi.fn().mockResolvedValue([]),
    };
    const config = new ConfigService({
      ...(opts.latest ? { ANDROID_SHELL_LATEST_VERSION: opts.latest } : {}),
      ...opts.perStore,
    });
    const service = new InAppNotificationsService(
      db as unknown as PrismaService,
      billing as unknown as BillingService,
      undefined,
      config,
    );
    const updateCalls = () =>
      db.inAppNotification.upsert.mock.calls.filter(
        ([call]) => call.create.source === 'shell-update',
      );
    return { db, service, updateCalls };
  }

  it('offers the Bazaar update once to an old Bazaar shell with no local reminder device', async () => {
    const { service, updateCalls } = setupShell({ latest: '1.0.7' });
    await service.pending('owner', now, bazaar);
    const [[call]] = updateCalls();
    expect(call.where).toEqual({
      userId_key: { userId: 'owner', key: 'android-shell-update:1.0.7' },
    });
    expect(call.update).toEqual({});
    expect(call.create.content.actions[0].url).toBe(
      'https://cafebazaar.ir/app/ir.poshtetgarm.poshtetgarm_hybrid',
    );
  });

  it('uses the Myket page for Myket and GitHub Releases for direct APK', async () => {
    const myketRun = setupShell({ latest: '1.0.7' });
    await myketRun.service.pending('owner', now, myket);
    expect(myketRun.updateCalls()[0][0].create.content.actions[0].url).toBe(
      'https://myket.ir/app/ir.poshtetgarm.poshtetgarm_hybrid',
    );

    const directRun = setupShell({ latest: '1.0.7' });
    await directRun.service.pending('owner', now, android, 'direct_apk');
    expect(directRun.updateCalls()[0][0].create.content.actions[0].url).toBe(
      'https://github.com/mojtabanpe/all_in_one/releases/latest',
    );
  });

  it('lets one store hold the notice back while another is offered it', async () => {
    const perStore = { ANDROID_SHELL_LATEST_VERSION_MYKET: 'off' };
    const bazaarRun = setupShell({ latest: '1.0.7', perStore });
    await bazaarRun.service.pending('owner', now, bazaar);
    expect(bazaarRun.updateCalls()).toHaveLength(1);
    const myketRun = setupShell({ latest: '1.0.7', perStore });
    await myketRun.service.pending('owner', now, myket);
    expect(myketRun.updateCalls()).toHaveLength(0);
    const bazaarOnly = setupShell({
      perStore: { ANDROID_SHELL_LATEST_VERSION_BAZAAR: '1.0.7' },
    });
    await bazaarOnly.service.pending('owner', now, bazaar);
    expect(bazaarOnly.updateCalls()[0][0].where.userId_key.key).toBe(
      'android-shell-update:1.0.7',
    );
  });

  it('uses exact SemVer when PoshtetgarmApp/<ver> is present in the user agent', async () => {
    const newer = setupShell({ latest: '1.0.8', hasLocalReminders: true });
    await newer.service.pending(
      'owner',
      now,
      `${android} PoshtetgarmApp/1.0.7 PoshtetgarmStore/bazaar`,
    );
    expect(newer.updateCalls()).toHaveLength(1);

    const current = setupShell({ latest: '1.0.7', hasLocalReminders: false });
    await current.service.pending(
      'owner',
      now,
      `${android} PoshtetgarmApp/1.0.7 PoshtetgarmStore/bazaar`,
    );
    expect(current.updateCalls()).toHaveLength(0);
  });

  it.each([
    ['when no new shell version is published', {}, bazaar, undefined],
    [
      'when the account already has a local reminder device',
      { latest: '1.0.7', hasLocalReminders: true },
      bazaar,
      undefined,
    ],
    [
      'when the notice was already created once for this account',
      { latest: '1.0.7', existing: true },
      bazaar,
      undefined,
    ],
    [
      'in a regular web browser',
      { latest: '1.0.7' },
      'Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0.0',
      undefined,
    ],
    [
      'when direct_apk hint is sent from non-Android user agent',
      { latest: '1.0.7' },
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'direct_apk',
    ],
  ])('does not create the notice %s', async (_label, opts, agent, hint) => {
    const { service, updateCalls } = setupShell(opts);
    await service.pending('owner', now, agent, hint);
    expect(updateCalls()).toHaveLength(0);
  });
});
