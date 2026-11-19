import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import { isoDateIn, zonedInstant } from '@all-in-one/applets/planner/contracts';
import { BillingService } from '../billing/billing.service';
import { PushService } from './push.service';
import { loadMessages, translateMessage } from '@all-in-one/localization';
import type { LocalReminder } from '@all-in-one/shared/schemas';

const DAY = 86_400_000;

/**
 * One push per device in the last day of a trial that nothing follows (no paid time or earned week queued).
 * The in-app notice of directive 131 only reaches people who open the app; this reaches the others.
 */
@Injectable()
export class TrialEndingPush implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrialEndingPush.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    private readonly db: PrismaService,
    private readonly billing: BillingService,
    private readonly push: PushService,
  ) {}

  onModuleInit() {
    const status = this.push.status();
    if (!status.enabled && !status.nativeEnabled) return;
    this.timer = setInterval(() => void this.tick(), 10 * 60_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * The same reminder for the Android app to schedule on the device: one day before a trial that nothing follows
   * ends, moved into the 09:00–21:00 Tehran window of that day.
   */
  async localReminder(
    userId: string,
    language: 'fa' | 'en',
    now = new Date(),
  ): Promise<LocalReminder | null> {
    const access = await this.billing.access(userId, now);
    const end = access.trialUntil ? Date.parse(access.trialUntil) : 0;
    if (
      access.tier !== 'trial' ||
      end <= now.getTime() ||
      (access.aiUntil && Date.parse(access.aiUntil) > end)
    )
      return null;
    let at = end - DAY;
    const day = isoDateIn(new Date(at), 'Asia/Tehran');
    const from = zonedInstant(day, '09:00', 'Asia/Tehran')?.getTime();
    const until = zonedInstant(day, '20:00', 'Asia/Tehran')?.getTime();
    if (from !== undefined && at < from) at = from;
    if (until !== undefined && at > until) at = until;
    if (at <= now.getTime()) return null;
    await loadMessages();
    return {
      id: `trial-ending:${end}`,
      at,
      title: translateMessage(
        'دسترسی آزمایشی هوش مصنوعی‌ات فردا تمام می‌شود',
        language,
      ),
      url: '/app/billing',
    };
  }

  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      // Tehran daytime only: an account notice is not worth waking anyone.
      const today = isoDateIn(now, 'Asia/Tehran');
      const from = zonedInstant(today, '09:00', 'Asia/Tehran');
      const until = zonedInstant(today, '21:00', 'Asia/Tehran');
      if (!from || !until || now < from || now >= until) return;
      const subscriptions = (
        await this.db.pushSubscription.findMany({
          where: { user: { role: 'CUSTOMER' } },
          include: { user: { select: { sessionVersion: true } } },
        })
      ).filter((sub) => sub.sessionVersion === sub.user.sessionVersion);
      for (const userId of new Set(subscriptions.map((sub) => sub.userId))) {
        const access = await this.billing.access(userId, now);
        const end = access.trialUntil ? Date.parse(access.trialUntil) : 0;
        const remaining = end - now.getTime();
        if (
          access.tier !== 'trial' ||
          remaining <= 0 ||
          remaining > DAY ||
          (access.aiUntil && Date.parse(access.aiUntil) > end)
        )
          continue;
        const key = `trial-ending:${end}`;
        for (const sub of subscriptions.filter((s) => s.userId === userId)) {
          const claimed = await this.db.pushDelivery.createMany({
            data: [{ subscriptionId: sub.id, key }],
            skipDuplicates: true,
          });
          if (!claimed.count) continue;
          const sent = await this.push.send(
            sub,
            'دسترسی آزمایشی هوش مصنوعی‌ات فردا تمام می‌شود',
            '/app/billing',
            key,
          );
          if (!sent)
            await this.db.pushDelivery.deleteMany({
              where: { subscriptionId: sub.id, key },
            });
        }
      }
    } catch {
      this.logger.error('Trial-ending push sweep failed');
    } finally {
      this.running = false;
    }
  }
}
