import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  SmsService,
  smsTemplateReady,
  type SmsTemplate,
} from '@all-in-one/api/auth';
import { PrismaService } from '@all-in-one/api/db';
import { TasksService } from '@all-in-one/applets/planner/api';
import {
  addDays,
  isoDateIn,
  zonedInstant,
} from '@all-in-one/applets/planner/contracts';
import { BillingService } from '../billing/billing.service';

const DAY = 86_400_000;
/** Older accounts are past every notice; this bounds the scan. */
const WINDOW_DAYS = 10;

type Notice = Extract<
  SmsTemplate,
  'ACCOUNT_READY' | 'FIRST_STEP' | 'DAILY_SUMMARY' | 'TRIAL_ENDING'
>;

/**
 * Informational SMS (directive 150) for customers who confirmed a phone and have no push device, so the
 * app has no other way to reach them. Each kind is sent at most once per account, in Tehran daytime, and
 * never more than one a day; the account can turn them off.
 */
@Injectable()
export class SmsNotices implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmsNotices.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    private readonly db: PrismaService,
    private readonly sms: SmsService,
    private readonly billing: BillingService,
    private readonly tasks: TasksService,
  ) {}

  onModuleInit() {
    if (!this.sms.enabled) return;
    this.timer = setInterval(() => void this.tick(), 10 * 60_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()) {
    if (this.running || !this.sms.enabled) return;
    this.running = true;
    try {
      const today = isoDateIn(now, 'Asia/Tehran');
      const from = zonedInstant(today, '10:00', 'Asia/Tehran');
      const until = zonedInstant(today, '20:00', 'Asia/Tehran');
      if (!from || !until || now < from || now >= until) return;
      const accounts = await this.db.user.findMany({
        where: {
          role: 'CUSTOMER',
          phone: { not: null },
          phoneVerifiedAt: { not: null },
          createdAt: { gte: new Date(now.getTime() - WINDOW_DAYS * DAY) },
          pushSubscriptions: { none: {} },
          OR: [
            { progressNotification: null },
            { progressNotification: { sms: true } },
          ],
        },
        select: {
          id: true,
          phone: true,
          createdAt: true,
          smsNotices: { select: { kind: true, createdAt: true } },
        },
      });
      for (const account of accounts) {
        if (!account.phone) continue;
        // One SMS a day at most, whatever its kind.
        if (
          account.smsNotices.some(
            (notice) => isoDateIn(notice.createdAt, 'Asia/Tehran') === today,
          )
        )
          continue;
        const sent = new Set(account.smsNotices.map((notice) => notice.kind));
        const signup = isoDateIn(account.createdAt, 'Asia/Tehran');
        const { id, phone } = account;
        try {
          if (
            !sent.has('ACCOUNT_READY') &&
            addDays(signup, 1) === today &&
            !(await this.established(id))
          ) {
            await this.deliver(id, 'ACCOUNT_READY', () =>
              this.sms.send('ACCOUNT_READY', phone, {}),
            );
            continue;
          }
          // Day two and still nothing of its own: only 4 of 41 new accounts came back on a later day (2026-11-19),
          // and most have only a phone, so SMS is the one way to reach them.
          if (
            smsTemplateReady('FIRST_STEP') &&
            !sent.has('FIRST_STEP') &&
            addDays(signup, 2) === today &&
            !(await this.established(id))
          ) {
            await this.deliver(id, 'FIRST_STEP', () =>
              this.sms.send('FIRST_STEP', phone, {}),
            );
            continue;
          }
          if (!sent.has('DAILY_SUMMARY') && addDays(signup, 3) === today) {
            const count = await this.planned(id, today, now);
            if (count) {
              await this.deliver(id, 'DAILY_SUMMARY', () =>
                this.sms.send('DAILY_SUMMARY', phone, { count: String(count) }),
              );
              continue;
            }
          }
          if (!sent.has('TRIAL_ENDING') && (await this.trialEnding(id, now)))
            await this.deliver(id, 'TRIAL_ENDING', () =>
              this.sms.send('TRIAL_ENDING', phone, { days: '1' }),
            );
        } catch {
          // Counts only: never a number, name or provider text.
          this.logger.warn('An account SMS notice could not be prepared');
        }
      }
    } catch {
      this.logger.error('SMS notice sweep failed');
    } finally {
      this.running = false;
    }
  }

  /** Claims the notice first, so two sweeps or two api colours never send it twice. */
  private async deliver(
    userId: string,
    kind: Notice,
    send: () => Promise<void>,
  ) {
    const claimed = await this.db.smsNotice.createMany({
      data: [{ userId, kind }],
      skipDuplicates: true,
    });
    if (!claimed.count) return;
    try {
      await send();
    } catch {
      await this.db.smsNotice.deleteMany({ where: { userId, kind } });
    }
  }

  private async established(userId: string): Promise<boolean> {
    const where = { where: { userId }, select: { userId: true } };
    const found = await Promise.all([
      this.db.plannerTask.findFirst(where),
      this.db.englishCard.findFirst(where),
      this.db.mealLog.findFirst(where),
      this.db.workoutLog.findFirst(where),
    ]);
    return found.some(Boolean);
  }

  /** Open tasks dated today plus cards due for review: what the summary's number means. */
  private async planned(userId: string, today: string, now: Date) {
    const [tasks, cards] = await Promise.all([
      this.tasks.filter(
        userId,
        { from: today, to: today, status: 'open' },
        true,
      ),
      this.db.englishCard.count({
        where: { userId, suspended: false, dueAt: { lte: now } },
      }),
    ]);
    return tasks.filter((task) => task.kind === 'TASK').length + cards;
  }

  private async trialEnding(userId: string, now: Date): Promise<boolean> {
    const access = await this.billing.access(userId, now);
    const end = access.trialUntil ? Date.parse(access.trialUntil) : 0;
    const remaining = end - now.getTime();
    return (
      access.tier === 'trial' &&
      remaining > 0 &&
      remaining <= DAY &&
      !(access.aiUntil && Date.parse(access.aiUntil) > end)
    );
  }
}
