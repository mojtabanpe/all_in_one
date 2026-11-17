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
