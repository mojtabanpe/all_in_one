import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  ServiceUnavailableException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';
import { TasksService } from '@all-in-one/applets/planner/api';
import {
  addDays,
  isoDateIn,
  habitDueOn,
  zonedInstant,
} from '@all-in-one/applets/planner/contracts';
import type {
  PushSubscriptionInput,
  ReviewReminderSettings,
} from '@all-in-one/shared/schemas';
import * as webpush from 'web-push';

export function reminderOffset(value: string): number | null {
  const match = /^(?:TRIGGER:)?-?PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  return minutes <= 7 * 1440 ? -minutes * 60000 : null;
}
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly tasks: TasksService,
  ) {}
  status() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    return {
      enabled: !!(
        publicKey &&
        this.config.get('VAPID_PRIVATE_KEY') &&
        this.config.get('VAPID_SUBJECT')
      ),
      publicKey: publicKey ?? null,
    };
  }
  onModuleInit() {
    if (this.status().enabled) {
      this.timer = setInterval(() => {
        void this.tick();
      }, 30000);
      this.timer.unref();
      void this.tick();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async reviewSettings(userId: string): Promise<ReviewReminderSettings> {
    const settings = await this.db.reviewReminderSetting.findUnique({
      where: { userId },
    });
    return settings
      ? { enabled: settings.enabled, time: settings.time }
      : { enabled: false, time: '20:00' };
  }
  async updateReviewSettings(
    userId: string,
    input: ReviewReminderSettings,
  ): Promise<ReviewReminderSettings> {
    const settings = await this.db.reviewReminderSetting.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
    });
    return { enabled: settings.enabled, time: settings.time };
  }

  async subscribe(userId: string, input: PushSubscriptionInput) {
    if (!this.status().enabled)
      throw new ServiceUnavailableException(
        'اعلان‌های سرور هنوز تنظیم نشده‌اند.',
      );
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const existing = await this.db.pushSubscription.findUnique({
      where: { endpoint: input.endpoint },
    });
    if (existing && existing.userId !== userId)
      throw new ConflictException(
        'ابتدا اعلان‌های حساب قبلی را در این مرورگر غیرفعال کن.',
      );
    const data = {
      userId,
      endpoint: input.endpoint,
      ...input.keys,
      sessionVersion: user.sessionVersion,
    };
    await this.db.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: data,
      update: data,
    });
    return { ok: true };
  }
  async remove(userId: string, endpoint: string) {
    await this.db.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { ok: true };
  }
  async send(
    subscription: {
      id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    },
    title: string,
    url: string,
    tag: string,
  ) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({
          notification: {
            title,
            body: 'پشتت گرم',
            icon: '/app/icons/icon-192.png',
            tag,
            dir: 'rtl',
            lang: 'fa',
            data: {
              onActionClick: {
                default: { operation: 'navigateLastFocusedOrOpen', url },
              },
            },
          },
        }),
        {
          TTL: 300,
          timeout: 10000,
          vapidDetails: {
            subject: this.config.getOrThrow<string>('VAPID_SUBJECT'),
            publicKey: this.config.getOrThrow<string>('VAPID_PUBLIC_KEY'),
            privateKey: this.config.getOrThrow<string>('VAPID_PRIVATE_KEY'),
          },
        },
      );
      return true;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410)
        await this.db.pushSubscription.deleteMany({
          where: { id: subscription.id },
        });
      // Never log subscription endpoints, keys, or provider response bodies.
      this.logger.warn(`Push failed (${status ?? 'network'})`);
      return false;
    }
  }
  async test(userId: string, endpoint: string) {
    if (!this.status().enabled)
      throw new ServiceUnavailableException(
        'اعلان‌های سرور هنوز تنظیم نشده‌اند.',
      );
    const sub = await this.db.pushSubscription.findFirst({
      where: { userId, endpoint },
      include: { user: true },
    });
    if (!sub || sub.sessionVersion !== sub.user.sessionVersion)
      throw new ConflictException('اعلان‌های این دستگاه را دوباره فعال کن.');
    const sent = await this.send(
      sub,
      'اعلان آزمایشی پشتت گرم',
      '/app/account',
      'test',
    );
    if (!sent)
      throw new ServiceUnavailableException(
        'ارسال اعلان موفق نبود. دوباره تلاش کن.',
      );
    return { ok: true };
  }
  async testDevices(userId: string) {
    const subscriptions = await this.db.pushSubscription.findMany({
      where: { userId },
      include: { user: { select: { sessionVersion: true } } },
    });
    let sent = 0;
    for (const sub of subscriptions) {
      if (sub.sessionVersion === sub.user.sessionVersion) {
        await this.test(userId, sub.endpoint);
        sent++;
      }
    }
    return { sent };
  }

  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const subscriptions = await this.db.pushSubscription.findMany({
        include: { user: { select: { sessionVersion: true } } },
      });
      const users = [...new Set(subscriptions.map((s) => s.userId))];
      const today = isoDateIn(now, 'Asia/Tehran');
      for (const userId of users) {
        const tasks = await this.tasks.filter(
          userId,
          { from: addDays(today, -1), to: addDays(today, 7), status: 'open' },
          true,
        );
        for (const task of tasks) {
          if (!task.date || !task.time || task.kind !== 'TASK') continue;
          const at = zonedInstant(task.date, task.time, 'Asia/Tehran');
          if (!at) continue;
          const offsets = task.reminders.length
            ? task.reminders
                .map(reminderOffset)
                .filter((x): x is number => x !== null)
            : [];
          for (const offset of new Set(offsets)) {
            const due = at.getTime() + offset;
            if (due > now.getTime() || due < now.getTime() - 300000) continue;
            for (const sub of subscriptions.filter(
              (s) =>
                s.userId === userId &&
                s.sessionVersion === s.user.sessionVersion,
            )) {
              const key = `${task.id}:${due}`;
              const claimed = await this.db.pushDelivery.createMany({
                data: [{ subscriptionId: sub.id, key }],
                skipDuplicates: true,
              });
              if (!claimed.count) continue;
              const sent = await this.send(
                sub,
                task.title,
                `/app/planner?task=${encodeURIComponent(task.id)}`,
                key,
              );
              if (!sent)
                await this.db.pushDelivery.deleteMany({
                  where: { subscriptionId: sub.id, key },
                });
            }
          }
        }
      }
      // Check the previous day too: the five-minute retry window can cross midnight.
      const previousDay = addDays(today, -1);
      const habits = await this.db.plannerHabit.findMany({
        where: {
          userId: { in: users },
          archived: false,
          NOT: { reminders: { isEmpty: true } },
        },
        include: {
          checkins: {
            where: {
              date: {
                gte: new Date(`${previousDay}T00:00:00Z`),
                lte: new Date(`${today}T00:00:00Z`),
              },
            },
          },
        },
      });
      for (const habit of habits) {
        for (const date of [previousDay, today]) {
          if (!habitDueOn(habit, date)) continue;
          if (
            habit.checkins.some(
              (c) =>
                c.date.toISOString().slice(0, 10) === date &&
                c.value >= habit.goal,
            )
          )
            continue;
          for (const time of new Set(habit.reminders)) {
            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) continue;
            const due = zonedInstant(date, time, 'Asia/Tehran')?.getTime();
            if (
              due === undefined ||
              due > now.getTime() ||
              due < now.getTime() - 300000
            )
              continue;
            for (const sub of subscriptions.filter(
              (s) =>
                s.userId === habit.userId &&
                s.sessionVersion === s.user.sessionVersion,
            )) {
              const key = `habit:${habit.id}:${due}`;
              const claimed = await this.db.pushDelivery.createMany({
                data: [{ subscriptionId: sub.id, key }],
                skipDuplicates: true,
              });
              if (!claimed.count) continue;
              const sent = await this.send(
                sub,
                `وقت ${habit.name} است`,
                '/app/planner/habits',
                key,
              );
              if (!sent)
                await this.db.pushDelivery.deleteMany({
                  where: { subscriptionId: sub.id, key },
                });
            }
          }
        }
      }
      const reviewSettings = await this.db.reviewReminderSetting.findMany({
        where: { userId: { in: users }, enabled: true },
      });
      for (const setting of reviewSettings) {
        for (const date of [previousDay, today]) {
          const due = zonedInstant(
            date,
            setting.time,
            'Asia/Tehran',
          )?.getTime();
          if (
            due === undefined ||
            due > now.getTime() ||
            due < now.getTime() - 300000
          )
            continue;
          // Match the study queue: include new/due cards, but never suspended cards.
          const count = await this.db.englishCard.count({
            where: {
              userId: setting.userId,
              suspended: false,
              dueAt: { lte: now },
              deck: { userId: setting.userId },
            },
          });
          if (!count) continue;
          for (const sub of subscriptions.filter(
            (s) =>
              s.userId === setting.userId &&
              s.sessionVersion === s.user.sessionVersion,
          )) {
            // One successful reminder per device/day, even if the time is changed later.
            const key = `review:${date}`;
            const claimed = await this.db.pushDelivery.createMany({
              data: [{ subscriptionId: sub.id, key }],
              skipDuplicates: true,
            });
            if (!claimed.count) continue;
            const sent = await this.send(
              sub,
              `${count.toLocaleString('fa-IR')} کارت آمادهٔ مرور داری`,
              '/app/english',
              key,
            );
            if (!sent)
              await this.db.pushDelivery.deleteMany({
                where: { subscriptionId: sub.id, key },
              });
          }
        }
      }
      await this.db.pushDelivery.deleteMany({
        where: { createdAt: { lt: new Date(now.getTime() - 30 * 86400000) } },
      });
    } catch {
      this.logger.error('Push reminder sweep failed');
    } finally {
      this.running = false;
    }
  }
}
