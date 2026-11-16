import type { SmsService } from '@all-in-one/api/auth';
import type { PrismaService } from '@all-in-one/api/db';
import type { TasksService } from '@all-in-one/applets/planner/api';
import type { BillingService } from '../billing/billing.service';
import { SmsNotices } from './sms-notices';

describe('informational account SMS', () => {
  // 11:00 Tehran on 2026-11-17.
  const now = new Date('2026-11-17T07:30:00Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
  function setup({
    createdAt = daysAgo(1),
    notices = [] as { kind: string; createdAt: Date }[],
    established = false,
    tasks = [] as { kind: string }[],
    cards = 0,
    access = { tier: 'trial', trialUntil: daysAgo(-5).toISOString() } as Record<
      string,
      unknown
    >,
    enabled = true,
  } = {}) {
    const rows = [...notices];
    const db = {
      user: {
        findMany: vi.fn(async () => [
          { id: 'u1', phone: '+989121234567', createdAt, smsNotices: rows },
        ]),
      },
      smsNotice: {
        createMany: vi.fn(async ({ data: [row] }) => {
          if (rows.some((notice) => notice.kind === row.kind))
            return { count: 0 };
          rows.push({ kind: row.kind, createdAt: now });
          return { count: 1 };
        }),
        deleteMany: vi.fn(async ({ where }) => {
          const index = rows.findIndex((notice) => notice.kind === where.kind);
          if (index >= 0) rows.splice(index, 1);
          return { count: Number(index >= 0) };
        }),
      },
      plannerTask: {
        findFirst: vi.fn().mockResolvedValue(established ? {} : null),
      },
      englishCard: {
        findFirst: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(cards),
      },
      mealLog: { findFirst: vi.fn().mockResolvedValue(null) },
      workoutLog: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const send = vi.fn().mockResolvedValue(undefined);
    const sweep = new SmsNotices(
      db as unknown as PrismaService,
      { enabled, send } as unknown as SmsService,
      {
        access: vi.fn().mockResolvedValue(access),
      } as unknown as BillingService,
      { filter: vi.fn().mockResolvedValue(tasks) } as unknown as TasksService,
    );
    return { db, send, sweep, rows };
  }
  const sent = (send: ReturnType<typeof setup>['send']) =>
    send.mock.calls.map(([kind, , params]) => [kind, params]);

  it('only looks at confirmed phones without a push device that did not turn it off', async () => {
    const { db, sweep } = setup();
    await sweep.tick(now);
    expect(db.user.findMany.mock.calls[0][0].where).toMatchObject({
      role: 'CUSTOMER',
      phone: { not: null },
      phoneVerifiedAt: { not: null },
      pushSubscriptions: { none: {} },
      OR: [
        { progressNotification: null },
        { progressNotification: { sms: true } },
      ],
    });
  });

  it('tells an account that did nothing that it is ready, once, the day after signup', async () => {
    const { send, sweep } = setup();
    await sweep.tick(now);
    await sweep.tick(new Date(now.getTime() + 600_000));
    expect(sent(send)).toEqual([['ACCOUNT_READY', {}]]);

    const active = setup({ established: true });
    await active.sweep.tick(now);
    expect(active.send).not.toHaveBeenCalled();

    const signupDay = setup({ createdAt: daysAgo(0.1) });
    await signupDay.sweep.tick(now);
    expect(signupDay.send).not.toHaveBeenCalled();
  });

  it('sends the day-three summary only with something really planned', async () => {
    const nothing = setup({ createdAt: daysAgo(3) });
    await nothing.sweep.tick(now);
    expect(nothing.send).not.toHaveBeenCalled();

    const { send, sweep } = setup({
      createdAt: daysAgo(3),
      tasks: [{ kind: 'TASK' }, { kind: 'NOTE' }],
      cards: 4,
    });
    await sweep.tick(now);
    expect(sent(send)).toEqual([['DAILY_SUMMARY', { count: '5' }]]);
  });

  it('announces the last day of a trial that nothing follows', async () => {
    const ending = {
      tier: 'trial',
      trialUntil: new Date(now.getTime() + 20 * 3_600_000).toISOString(),
    };
    const { send, sweep } = setup({ createdAt: daysAgo(6), access: ending });
    await sweep.tick(now);
    expect(sent(send)).toEqual([['TRIAL_ENDING', { days: '1' }]]);

    const queued = setup({
      createdAt: daysAgo(6),
      access: {
        ...ending,
        aiUntil: new Date(now.getTime() + 8 * 86_400_000).toISOString(),
      },
    });
    await queued.sweep.tick(now);
    expect(queued.send).not.toHaveBeenCalled();
  });

  it('never sends two in one day, and forgets a failed send so it can retry', async () => {
    const sameDay = setup({
      createdAt: daysAgo(6),
      notices: [{ kind: 'DAILY_SUMMARY', createdAt: now }],
      access: {
        tier: 'trial',
        trialUntil: new Date(now.getTime() + 3_600_000).toISOString(),
      },
    });
    await sameDay.sweep.tick(now);
    expect(sameDay.send).not.toHaveBeenCalled();

    const { send, sweep, rows } = setup();
    send.mockRejectedValueOnce(new Error('provider down'));
    await sweep.tick(now);
    expect(rows).toEqual([]);
    await sweep.tick(now);
    expect(send).toHaveBeenCalledTimes(2);
    expect(rows.map((notice) => notice.kind)).toEqual(['ACCOUNT_READY']);
  });

  it('stays silent at night and when SMS is off', async () => {
    const night = setup();
    // 22:30 Tehran.
    await night.sweep.tick(new Date('2026-11-17T19:00:00Z'));
    expect(night.db.user.findMany).not.toHaveBeenCalled();

    const off = setup({ enabled: false });
    await off.sweep.tick(now);
    expect(off.db.user.findMany).not.toHaveBeenCalled();
  });
});
