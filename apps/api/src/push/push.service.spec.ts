import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '@all-in-one/api/db';
import type { TasksService } from '@all-in-one/applets/planner/api';
import {
  pushSubscriptionSchema,
  reviewReminderSchema,
  nativePushSchema,
  removePushSchema,
} from '@all-in-one/shared/schemas';
import { PushService, reminderOffset } from './push.service';
import { NativePush } from './native-push';

describe('Native push', () => {
  const token = 'device-token:'.repeat(5);
  function setup(owner = 'u1') {
    const db = {
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ sessionVersion: 7 }),
      },
      pushSubscription: {
        findUnique: vi.fn().mockResolvedValue(owner ? { userId: owner } : null),
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new PushService(
      db as unknown as PrismaService,
      new ConfigService({ FCM_SERVICE_ACCOUNT_JSON: '{}' }),
      {} as TasksService,
    );
    return { db, service };
  }
  it('validates native tokens and never accepts native endpoints as Web Push URLs', () => {
    expect(
      nativePushSchema.safeParse({ token, platform: 'MACOS' }).success,
    ).toBe(true);
    expect(
      nativePushSchema.safeParse({ token: 'x', platform: 'ANDROID' }).success,
    ).toBe(false);
    expect(nativePushSchema.safeParse({ token, platform: 'WEB' }).success).toBe(
      false,
    );
    const endpoint = `native:${'a'.repeat(64)}`;
    expect(removePushSchema.safeParse({ endpoint }).success).toBe(true);
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint,
        keys: { p256dh: 'a'.repeat(87), auth: 'a'.repeat(22) },
      }).success,
    ).toBe(false);
  });
  it('registers per-user native devices with a stable hashed endpoint and session version', async () => {
    const { db, service } = setup('');
    const result = await service.subscribeNative('u1', {
      token,
      platform: 'ANDROID',
    });
    expect(result.endpoint).toMatch(/^native:[a-f0-9]{64}$/);
    expect(result.endpoint).not.toContain(token);
    expect(db.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 'u1',
          platform: 'ANDROID',
          fcmToken: token,
          sessionVersion: 7,
        }),
      }),
    );
    const again = await service.subscribeNative('u1', {
      token,
      platform: 'ANDROID',
    });
    expect(again.endpoint).toBe(result.endpoint);
  });
  it('rejects stealing another account’s token', async () => {
    const { db, service } = setup('other-user');
    await expect(
      service.subscribeNative('u1', { token, platform: 'MACOS' }),
    ).rejects.toThrow('حساب قبلی');
    expect(db.pushSubscription.upsert).not.toHaveBeenCalled();
  });
  it('uses FCM for native devices and removes unregistered tokens', async () => {
    const { db, service } = setup();
    const send = vi
      .spyOn(NativePush.prototype, 'send')
      .mockResolvedValue(undefined);
    const subscription = {
      id: 's1',
      endpoint: 'native:hash',
      p256dh: '',
      auth: '',
      platform: 'MACOS',
      fcmToken: token,
    };
    try {
      expect(
        await service.send(
          subscription,
          'یادآوری',
          '/app/english',
          'review:today',
        ),
      ).toBe(true);
      expect(send).toHaveBeenCalledWith(
        token,
        'یادآوری',
        '/app/english',
        'review:today',
      );
      send.mockRejectedValue({
        code: 'messaging/registration-token-not-registered',
      });
      expect(
        await service.send(
          subscription,
          'یادآوری',
          '/app/english',
          'review:today',
        ),
      ).toBe(false);
      expect(db.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { id: 's1' },
      });
      db.pushSubscription.deleteMany.mockClear();
      send.mockRejectedValue({ code: 'messaging/server-unavailable' });
      expect(
        await service.send(
          subscription,
          'یادآوری',
          '/app/english',
          'review:today',
        ),
      ).toBe(false);
      expect(db.pushSubscription.deleteMany).not.toHaveBeenCalled();
    } finally {
      send.mockRestore();
    }
  });
});

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
      reviewReminderSetting: { findMany: vi.fn().mockResolvedValue([]) },
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
    expect(send.mock.calls[0][2]).toBe('/app/planner?remind=task%3At1');
    tasks.filter.mockResolvedValue([]); // Completed/deleted tasks are absent on the next scan.
    await service.tick(new Date('2026-10-31T09:01:00Z'));
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('skips overdue and unrequested reminders', async () => {
    const db = {
      reviewReminderSetting: { findMany: vi.fn().mockResolvedValue([]) },
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
      reviewReminderSetting: { findMany: vi.fn().mockResolvedValue([]) },
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
    expect(send.mock.calls[1][2]).toMatch(
      /^\/app\/planner\/habits\?remind=habit%3A.+%3A2026-10-31$/,
    );
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

describe('language review reminders', () => {
  function fixture(count = 3) {
    const sentKeys = new Set<string>();
    const db = {
      pushSubscription: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'active',
            userId: 'u1',
            sessionVersion: 1,
            user: { sessionVersion: 1 },
          },
          {
            id: 'expired',
            userId: 'u1',
            sessionVersion: 0,
            user: { sessionVersion: 1 },
          },
        ]),
      },
      plannerHabit: { findMany: vi.fn().mockResolvedValue([]) },
      reviewReminderSetting: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: 'u1', enabled: true, time: '20:00' }]),
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(async ({ create }) => create),
      },
      englishCard: { count: vi.fn().mockResolvedValue(count) },
      pushDelivery: {
        createMany: vi.fn(async ({ data }) => {
          const key = data[0].subscriptionId + data[0].key;
          if (sentKeys.has(key)) return { count: 0 };
          sentKeys.add(key);
          return { count: 1 };
        }),
        deleteMany: vi.fn(async ({ where }) => {
          if (where.key) sentKeys.delete(where.subscriptionId + where.key);
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
    return { service, send, db };
  }
  it('validates 24-hour times and defaults to off without writing settings', async () => {
    const { service, db } = fixture();
    expect(
      reviewReminderSchema.safeParse({ enabled: true, time: '24:00' }).success,
    ).toBe(false);
    expect(
      reviewReminderSchema.safeParse({ enabled: true, time: '09:30' }).success,
    ).toBe(true);
    expect(await service.reviewSettings('u1')).toEqual({
      enabled: false,
      time: '20:00',
    });
    expect(db.reviewReminderSetting.upsert).not.toHaveBeenCalled();
    await service.updateReviewSettings('u1', { enabled: true, time: '09:30' });
    expect(db.reviewReminderSetting.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: { userId: 'u1', enabled: true, time: '09:30' },
      update: { enabled: true, time: '09:30' },
    });
  });
  it('sends only at the selected Tehran time, once per day, and excludes expired sessions', async () => {
    const { service, send, db } = fixture();
    await service.tick(new Date('2026-10-31T16:29:00Z'));
    expect(send).not.toHaveBeenCalled();
    await service.tick(new Date('2026-10-31T16:30:05Z'));
    await service.tick(new Date('2026-10-31T16:30:35Z'));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][2]).toBe('/app/english');
    expect(db.englishCard.count).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        suspended: false,
        dueAt: { lte: new Date('2026-10-31T16:30:35Z') },
        deck: { userId: 'u1' },
      },
    });
    db.reviewReminderSetting.findMany.mockResolvedValue([
      { userId: 'u1', enabled: true, time: '21:00' },
    ]);
    await service.tick(new Date('2026-10-31T17:30:05Z'));
    expect(send).toHaveBeenCalledTimes(1);
    await service.tick(new Date('2026-11-01T17:30:05Z'));
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('does not notify when there are no due cards or the reminder is disabled', async () => {
    const { service, send, db } = fixture(0);
    await service.tick(new Date('2026-10-31T16:30:05Z'));
    expect(send).not.toHaveBeenCalled();
    expect(db.pushDelivery.createMany).not.toHaveBeenCalled();
    db.reviewReminderSetting.findMany.mockResolvedValue([]);
    db.englishCard.count.mockClear();
    await service.tick(new Date('2026-10-31T16:30:35Z'));
    expect(db.englishCard.count).not.toHaveBeenCalled();
    expect(db.reviewReminderSetting.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['u1'] }, enabled: true },
    });
  });
  it('retries failed sends within the grace period without sending stale reminders', async () => {
    const { service, send } = fixture();
    send.mockResolvedValueOnce(false).mockResolvedValue(true);
    await service.tick(new Date('2026-10-31T16:30:05Z'));
    await service.tick(new Date('2026-10-31T16:30:35Z'));
    expect(send).toHaveBeenCalledTimes(2);
    await service.tick(new Date('2026-11-01T16:36:00Z'));
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('checks the previous Tehran day when the retry window crosses midnight', async () => {
    const { service, send, db } = fixture();
    db.reviewReminderSetting.findMany.mockResolvedValue([
      { userId: 'u1', enabled: true, time: '23:59' },
    ]);
    await service.tick(new Date('2026-10-31T20:31:00Z'));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][3]).toBe('review:2026-10-31');
  });
});
