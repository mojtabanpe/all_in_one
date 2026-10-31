import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '@all-in-one/api/db';
import type { TasksService } from '@all-in-one/applets/planner/api';
import { pushSubscriptionSchema } from '@all-in-one/shared/schemas';
import { PushService, reminderOffset } from './push.service';

describe('Web Push reminders', () => {
  it('rejects private addresses and malformed keys', () => {
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: 'https://127.0.0.1/push',
        keys: { p256dh: 'a'.repeat(87), auth: 'a'.repeat(22) },
      }).success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: 'https://fcm.googleapis.com/push',
        keys: { p256dh: 'bad', auth: 'bad' },
      }).success,
    ).toBe(false);
  });
  it('parses reminder metadata and bounds advance reminders', () => {
    expect(reminderOffset('TRIGGER:-PT15M')).toBe(-900000);
    expect(reminderOffset('TRIGGER:PT0M')).toBe(-0);
    expect(reminderOffset('-PT1H30M')).toBe(-5400000);
    expect(reminderOffset('TRIGGER:-PT999999H')).toBeNull();
    expect(reminderOffset('unrecognized')).toBeNull();
  });
  it('deduplicates sends, ignores stale sessions, and rechecks current task state', async () => {
    const keys = new Set<string>();
    const db = {
      plannerHabit: { findMany: vi.fn().mockResolvedValue([]) },
      pushSubscription: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 's1',
            userId: 'u1',
            sessionVersion: 0,
            user: { sessionVersion: 0 },
          },
          {
            id: 'old',
            userId: 'u1',
            sessionVersion: 0,
            user: { sessionVersion: 1 },
          },
        ]),
      },
      pushDelivery: {
        createMany: vi.fn(async ({ data }) => {
          const key = data[0].subscriptionId + data[0].key;
          if (keys.has(key)) return { count: 0 };
          keys.add(key);
          return { count: 1 };
        }),
        deleteMany: vi.fn(),
      },
    };
    const task = {
      id: 't1',
      title: 'test',
      date: '2026-10-31',
      time: '12:30',
      kind: 'TASK',
      reminders: ['TRIGGER:PT0M'],
    };
    const tasks = { filter: vi.fn().mockResolvedValue([task]) };
    const service = new PushService(
      db as unknown as PrismaService,
      new ConfigService(),
      tasks as unknown as TasksService,
    );
    const send = vi.spyOn(service, 'send').mockResolvedValue(true);
    const now = new Date('2026-10-31T09:00:05Z');
    await service.tick(now);
    await service.tick(now);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][2]).toBe('/app/planner?task=t1');
    tasks.filter.mockResolvedValue([]); // Completed/deleted tasks are absent on the next scan.
    await service.tick(new Date('2026-10-31T09:01:00Z'));
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('skips overdue and unrequested reminders', async () => {
    const db = {
      plannerHabit: { findMany: vi.fn().mockResolvedValue([]) },
      pushSubscription: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 's1',
            userId: 'u1',
            sessionVersion: 0,
            user: { sessionVersion: 0 },
          },
        ]),
      },
      pushDelivery: { createMany: vi.fn(), deleteMany: vi.fn() },
    };
    const tasks = {
      filter: vi.fn().mockResolvedValue([
        {
          id: 'old',
          date: '2026-10-31',
          time: '12:20',
          kind: 'TASK',
          reminders: ['TRIGGER:PT0M'],
        },
        {
          id: 'off',
          date: '2026-10-31',
          time: '12:30',
          kind: 'TASK',
          reminders: [],
        },
      ]),
    };
    const service = new PushService(
      db as unknown as PrismaService,
      new ConfigService(),
      tasks as unknown as TasksService,
    );
    await service.tick(new Date('2026-10-31T09:00:05Z'));
    expect(db.pushDelivery.createMany).not.toHaveBeenCalled();
  });
});

describe('habit reminders', () => {
  function fixture() {
    const claimed = new Set<string>();
    const habit = {
      id: 'h1',
      userId: 'u1',
      name: 'آب خوردن',
      goal: 2,
      weekdays: [6],
      reminders: ['09:00', '18:00', '18:00'],
      checkins: [] as { date: Date; value: number }[],
    };
    const db = {
      pushSubscription: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 's1',
            userId: 'u1',
            sessionVersion: 0,
            user: { sessionVersion: 0 },
          },
        ]),
      },
      plannerHabit: { findMany: vi.fn().mockResolvedValue([habit]) },
      pushDelivery: {
        createMany: vi.fn(async ({ data }) => {
          const key = data[0].subscriptionId + data[0].key;
          if (claimed.has(key)) return { count: 0 };
          claimed.add(key);
          return { count: 1 };
        }),
        deleteMany: vi.fn(async (args) => {
          if (args.where.key)
            claimed.delete(args.where.subscriptionId + args.where.key);
          return { count: 1 };
        }),
      },
    };
    const service = new PushService(
      db as unknown as PrismaService,
      new ConfigService(),
      { filter: vi.fn().mockResolvedValue([]) } as unknown as TasksService,
    );
    const send = vi.spyOn(service, 'send').mockResolvedValue(true);
    return { service, send, habit, db };
  }
  it('sends each configured time once in Tehran and opens habits', async () => {
    const { service, send } = fixture();
    await service.tick(new Date('2026-10-31T05:30:05Z'));
    await service.tick(new Date('2026-10-31T05:30:35Z'));
    expect(send).toHaveBeenCalledTimes(1);
    await service.tick(new Date('2026-10-31T14:30:05Z'));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][2]).toBe('/app/planner/habits');
  });
  it('skips unscheduled days and completed daily goals', async () => {
    const { service, send, habit } = fixture();
    await service.tick(new Date('2026-11-01T05:30:05Z'));
    habit.checkins = [{ date: new Date('2026-10-31T00:00:00Z'), value: 2 }];
    await service.tick(new Date('2026-10-31T05:30:05Z'));
    expect(send).not.toHaveBeenCalled();
  });
  it('still reminds partially completed habits and retries failed sends', async () => {
    const { service, send, habit } = fixture();
    habit.checkins = [{ date: new Date('2026-10-31T00:00:00Z'), value: 1 }];
    send.mockResolvedValueOnce(false).mockResolvedValue(true);
    await service.tick(new Date('2026-10-31T05:30:05Z'));
    await service.tick(new Date('2026-10-31T05:30:35Z'));
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('ignores invalid metadata and catches reminders across Tehran midnight', async () => {
    const { service, send, habit } = fixture();
    habit.reminders = ['23:59', '24:00', 'legacy metadata'];
    await service.tick(new Date('2026-10-31T20:31:00Z')); // Sunday 00:01 Tehran, previous Saturday reminder.
    expect(send).toHaveBeenCalledTimes(1);
  });
});
