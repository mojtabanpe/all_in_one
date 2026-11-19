import type { PrismaService } from '@all-in-one/api/db';
import type { BillingService } from '../billing/billing.service';
import type { PushService } from './push.service';
import { TrialEndingPush } from './trial-ending';

describe('trial-ending push', () => {
  // 10:00 Tehran.
  const now = new Date('2026-11-17T06:30:00Z');
  const hours = (count: number) =>
    new Date(now.getTime() + count * 3_600_000).toISOString();
  function setup(access: Record<string, unknown>) {
    const keys = new Set<string>();
    const db = {
      pushSubscription: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'current',
            userId: 'u1',
            sessionVersion: 1,
            user: { sessionVersion: 1 },
          },
          {
            id: 'stale',
            userId: 'u1',
            sessionVersion: 0,
            user: { sessionVersion: 1 },
          },
        ]),
      },
      pushDelivery: {
        createMany: vi.fn(async ({ data: [row] }) => {
          if (keys.has(row.key)) return { count: 0 };
          keys.add(row.key);
          return { count: 1 };
        }),
        deleteMany: vi.fn(async ({ where }) => ({
          count: Number(keys.delete(where.key)),
        })),
      },
    };
    const send = vi.fn().mockResolvedValue(true);
    const billing = { access: vi.fn().mockResolvedValue(access) };
    const sweep = new TrialEndingPush(
      db as unknown as PrismaService,
      billing as unknown as BillingService,
      { send } as unknown as PushService,
    );
    return { db, send, sweep };
  }

  it('tells a current device once in the last day of a trial', async () => {
    const { db, send, sweep } = setup({
      tier: 'trial',
      trialUntil: hours(20),
      aiUntil: hours(20),
    });
    await sweep.tick(now);
    await sweep.tick(new Date(now.getTime() + 600_000));
    expect(db.pushSubscription.findMany.mock.calls[0][0].where).toEqual({
      user: { role: 'CUSTOMER' },
    });
    expect(send.mock.calls.map(([device, , url]) => [device.id, url])).toEqual([
      ['current', '/app/billing'],
    ]);
  });

  it('retries a failed send', async () => {
    const { send, sweep } = setup({ tier: 'trial', trialUntil: hours(20) });
    send.mockResolvedValueOnce(false);
    await sweep.tick(now);
    await sweep.tick(now);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['more than a day left', { tier: 'trial', trialUntil: hours(30) }],
    ['a trial that already ended', { tier: 'free', trialUntil: hours(-2) }],
    ['a paid account', { tier: 'paid', trialUntil: hours(20) }],
    [
      'an earned week queued after the trial',
      { tier: 'trial', trialUntil: hours(20), aiUntil: hours(188) },
    ],
  ])('stays silent with %s', async (_name, access) => {
    const { send, sweep } = setup(access);
    await sweep.tick(now);
    expect(send).not.toHaveBeenCalled();
  });

  it('never sends at night in Tehran', async () => {
    const { db, send, sweep } = setup({
      tier: 'trial',
      trialUntil: hours(20),
    });
    // 23:30 Tehran.
    await sweep.tick(new Date('2026-11-17T20:00:00Z'));
    expect(db.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  describe('on-device reminder (Android)', () => {
    it('is scheduled one day before the end, inside 09:00–20:00 Tehran', async () => {
      // Ends 2026-11-20 03:00 Tehran → a day before is 03:00, moved to 09:00 on 11-19.
      const { sweep } = setup({
        tier: 'trial',
        trialUntil: '2026-11-19T23:30:00Z',
        aiUntil: '2026-11-19T23:30:00Z',
      });
      const reminder = await sweep.localReminder('u1', 'en', now);
      expect(reminder).toMatchObject({
        at: Date.parse('2026-11-19T05:30:00Z'),
        url: '/app/billing',
      });
      expect(reminder?.title).not.toContain('هوش');
    });

    it('is not scheduled when paid time or an earned week follows, or outside a trial', async () => {
      for (const access of [
        { tier: 'trial', trialUntil: hours(60), aiUntil: hours(200) },
        { tier: 'paid', trialUntil: null, aiUntil: hours(200) },
        { tier: 'trial', trialUntil: hours(-1), aiUntil: hours(-1) },
      ]) {
        const { sweep } = setup(access);
        expect(await sweep.localReminder('u1', 'fa', now)).toBeNull();
      }
    });
  });
});
