import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '@all-in-one/api/db';
import type { TasksService } from '@all-in-one/applets/planner/api';
import { focusPushTimerSchema } from '@all-in-one/shared/schemas';
import { PushService } from './push.service';

describe('Pomodoro completion push', () => {
  function setup() {
    const claims = new Set<string>();
    const dueAt = new Date('2026-11-11T12:00:00Z');
    const db = {
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ sessionVersion: 2 }),
      },
      focusPushTimer: {
        create: vi.fn().mockResolvedValue({ id: 'timer', dueAt }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'timer',
            userId: 'user',
            sessionVersion: 2,
            user: { sessionVersion: 2 },
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      pushSubscription: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'web' },
            { id: 'native', platform: 'ANDROID' },
          ]),
      },
      pushDelivery: {
        createMany: vi.fn().mockImplementation(({ data }) => {
          const key = data[0].subscriptionId + data[0].key;
          if (claims.has(key)) return { count: 0 };
          claims.add(key);
          return { count: 1 };
        }),
        deleteMany: vi.fn().mockImplementation(({ where }) => {
          claims.delete(where.subscriptionId + where.key);
          return { count: 1 };
        }),
      },
    };
    const service = new PushService(
      db as unknown as PrismaService,
      new ConfigService({}),
      {} as TasksService,
    );
    const send = vi.spyOn(service, 'send').mockResolvedValue(true);
    return { db, service, send, dueAt };
  }
  it('validates positive bounded integer durations', () => {
    for (const remainingMs of [0, -1, 1.5, 43_200_001])
      expect(focusPushTimerSchema.safeParse({ remainingMs }).success).toBe(
        false,
      );
    expect(
      focusPushTimerSchema.safeParse({ remainingMs: 60_000 }).success,
    ).toBe(true);
  });
  it('persists the deadline and scopes cancellation to its owner', async () => {
    const { service, db } = setup();
    await service.scheduleFocus('user', 60_000);
    expect(db.focusPushTimer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user',
        sessionVersion: 2,
        dueAt: expect.any(Date),
      }),
    });
    await service.cancelFocus('user', 'timer');
    expect(db.focusPushTimer.deleteMany).toHaveBeenCalledWith({
      where: { id: 'timer', userId: 'user' },
    });
  });
  it('sends once per web/native device, retries failures and bounds restart recovery', async () => {
    const { service, send, db, dueAt } = setup();
    send.mockResolvedValueOnce(false);
    await service.sendFocusReminders(dueAt);
    await service.sendFocusReminders(dueAt);
    await service.sendFocusReminders(dueAt);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      'پومودورو تمام شد؛ وقت استراحت است.',
      '/app/planner/focus',
      'focus:timer',
    );
    expect(db.focusPushTimer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dueAt: { lte: dueAt, gte: new Date(dueAt.getTime() - 300_000) },
        },
      }),
    );
  });
  it('skips revoked sessions and timers cancelled during a sweep', async () => {
    const { service, db, send, dueAt } = setup();
    db.focusPushTimer.findMany.mockResolvedValueOnce([
      {
        id: 'timer',
        userId: 'user',
        sessionVersion: 1,
        user: { sessionVersion: 2 },
      },
    ]);
    await service.sendFocusReminders(dueAt);
    expect(send).not.toHaveBeenCalled();
    db.focusPushTimer.count.mockResolvedValue(0);
    await service.sendFocusReminders(dueAt);
    expect(send).not.toHaveBeenCalled();
  });
});
