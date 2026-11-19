import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { SmsService } from '@all-in-one/api/auth';
import { PrismaService } from '@all-in-one/api/db';
import {
  resolveEnabledApplets,
  type InAppContent,
  type InAppWidgetKind,
} from '@all-in-one/shared/schemas';
import { BillingService } from './billing/billing.service';
import { TelegramService } from './telegram/telegram.service';

/** Wait this long after any prompt before offering the next one. */
export const PROMPT_COOLDOWN_MS = 3 * 86_400_000;
/** A prompt that was not answered disappears after a week. */
export const PROMPT_TTL_MS = 7 * 86_400_000;
/** Active days before every prompt is open; on day one only the Telegram link is offered, after the first action. */
export const PROMPT_ACTIVE_DAYS = 2;
/** Due cards needed before the quick-review prompt is worth a sheet. */
export const REVIEW_PROMPT_DUE = 5;

interface Prompt {
  key: string;
  content: InAppContent;
}
type Copy = { fa: string; en: string };
const prompt = (
  kind: InAppWidgetKind,
  key: string,
  title: Copy,
  message: Copy,
  data?: Record<string, string>,
): Prompt => ({
  key,
  content: {
    title,
    message,
    widget: { kind, ...(data ? { data } : {}) },
    actions: [],
  },
});

/**
 * Bottom sheets that finish a step users find hard (owner, 2026-11-19): enabling notifications, linking Telegram,
 * confirming a second contact, a daily repeat, a weight goal, a quick review, the social weeks and the ChatGPT/Claude
 * connection. The step is done inside the sheet. At most one prompt is live, a new one waits for the cooldown and for
 * the other notices, each kind is offered once (a review again only after a new idle spell), and nothing is asked
 * before the account has really used the app.
 */
@Injectable()
export class InAppPrompts {
  constructor(
    private readonly db: PrismaService,
    private readonly billing: BillingService,
    private readonly sms: SmsService,
    private readonly telegram: TelegramService,
  ) {}

  async offer(
    userId: string,
    now: Date,
    activeDays: () => Promise<number>,
  ): Promise<void> {
    const recent = await this.db.inAppNotification.findFirst({
      where: {
        userId,
        OR: [
          {
            source: 'prompt',
            createdAt: { gt: new Date(now.getTime() - PROMPT_COOLDOWN_MS) },
          },
          { dismissedAt: null, expiresAt: { gt: now } },
        ],
      },
      select: { id: true },
    });
    if (recent) return;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        createdAt: true,
        email: true,
        emailVerifiedAt: true,
        phone: true,
        phoneVerifiedAt: true,
        enabledApplets: true,
        onboardingGoal: true,
        onboardingCompletedAt: true,
      },
    });
    if (!user) return;
    const days = await activeDays();
    // Nothing before the first action (166).
    if (days < 1) return;
    // Day one: only 4 of 41 new accounts came back on a later day (2026-11-19), so a step that needs two active days
    // reaches almost nobody. Once the first step of /welcome is done, offer a way back: the Telegram bot, and for the
    // English goal also reminders (its /welcome goes straight to the cards, so reminders were not offered there yet).
    // Everything else waits for day two.
    const dayOne =
      now.getTime() - user.createdAt.getTime() < 86_400_000 ||
      days < PROMPT_ACTIVE_DAYS;
    if (dayOne && !user.onboardingCompletedAt) return;
    const used = new Set(
      (
        await this.db.inAppNotification.findMany({
          where: { userId, source: 'prompt' },
          select: { key: true },
        })
      ).map((row) => row.key),
    );
    const applets = new Set(
      resolveEnabledApplets(user.enabledApplets, user.role),
    );
    const candidates: (() => Promise<Prompt | null>)[] = dayOne
      ? [
          ...(user.onboardingGoal === 'english'
            ? [() => this.push(userId, { review: '20:00' })]
            : []),
          () => this.telegramLink(userId),
        ]
      : [
          () => this.push(userId),
          () => this.telegramLink(userId),
          async () =>
            user.email &&
            user.emailVerifiedAt &&
            !user.phoneVerifiedAt &&
            this.sms.enabled
              ? prompt(
                  'phone',
                  'prompt:phone',
                  {
                    fa: 'شماره‌ات را تأیید کن، یک هفته هدیه بگیر',
                    en: 'Confirm your number for a free week',
                  },
                  {
                    fa: 'با کد پیامکی تأیید کن؛ یک هفته هوش مصنوعی خودکار اضافه می‌شود و رمز را با پیامک هم می‌توانی بازیابی کنی.',
                    en: 'Confirm it with an SMS code: one week of AI is added automatically, and you can reset your password by SMS.',
                  },
                )
              : null,
          async () =>
            user.phoneVerifiedAt && !user.email
              ? prompt(
                  'email',
                  'prompt:email',
                  {
                    fa: 'ایمیلت را اضافه کن، یک هفته هدیه بگیر',
                    en: 'Add your email for a free week',
                  },
                  {
                    fa: 'لینک تأیید را باز کن؛ یک هفته هوش مصنوعی خودکار اضافه می‌شود.',
                    en: 'Open the confirmation link: one week of AI is added automatically.',
                  },
                )
              : null,
          () =>
            applets.has('planner')
              ? this.repeatTask(userId, now)
              : Promise.resolve(null),
          () =>
            applets.has('health')
              ? this.weightGoal(userId)
              : Promise.resolve(null),
          () =>
            applets.has('english')
              ? this.review(userId, now, used)
              : Promise.resolve(null),
          () => this.rewards(userId, now),
          () => this.aiConnection(userId, now),
        ];
    for (const candidate of candidates) {
      const next = await candidate();
      if (!next || used.has(next.key)) continue;
      await this.db.inAppNotification.upsert({
        where: { userId_key: { userId, key: next.key } },
        create: {
          userId,
          key: next.key,
          source: 'prompt',
          content: next.content,
          expiresAt: new Date(now.getTime() + PROMPT_TTL_MS),
        },
        update: {},
      });
      return;
    }
  }

  /** No device gets reminders yet. Phones that cannot (an iPhone browser tab) skip it in the app. */
  private async push(
    userId: string,
    /** `review`: also turn on the daily card review reminder at this Tehran time once push works. */
    data?: { review: string },
  ): Promise<Prompt | null> {
    if (
      await this.db.pushSubscription.findFirst({
        where: { userId },
        select: { id: true },
      })
    )
      return null;
    return data
      ? prompt(
          'push',
          'prompt:push',
          { fa: 'هر شب یادت بیندازیم؟', en: 'Remind you every evening?' },
          {
            fa: 'ساعت ۲۰ وقتی کارت برای مرور داری، روی همین دستگاه خبرت می‌کنیم.',
            en: 'At 20:00, when cards are due, we let you know on this device.',
          },
          data,
        )
      : prompt(
          'push',
          'prompt:push',
          { fa: 'یادآوری‌ها را روشن کن', en: 'Turn on reminders' },
          {
            fa: 'سر وقتِ کارها و عادت‌هایت روی همین دستگاه خبرت کنیم.',
            en: 'Get your tasks and habits on this device right on time.',
          },
        );
  }

  private async telegramLink(userId: string): Promise<Prompt | null> {
    if (!this.telegram.enabled) return null;
    if (
      await this.db.telegramLink.findUnique({
        where: { userId },
        select: { userId: true },
      })
    )
      return null;
    return prompt(
      'telegram',
      'prompt:telegram',
      { fa: 'پشتت گرم در تلگرام', en: 'Poshtetgarm in Telegram' },
      {
        fa: 'کار، وعده یا خرج را با یک پیام ثبت کن و ساعت ۱۰ صبح کارهای امروز را بگیر.',
        en: 'Log a task, meal or expense with one message and get today’s tasks at 10:00.',
      },
    );
  }

  /** The same one-off task title added on 3+ separate days in two weeks, with no repeating task of that name. */
  private async repeatTask(userId: string, now: Date): Promise<Prompt | null> {
    const since = new Date(now.getTime() - 14 * 86_400_000);
    const rows = await this.db.$queryRaw<{ title: string }[]>`
      SELECT min(title) AS title FROM planner_tasks
      WHERE "userId" = ${userId}::uuid AND "deletedAt" IS NULL AND "createdAt" > ${since}
        AND "repeatRule" IS NULL AND "recurrenceRule" IS NULL
      GROUP BY lower(btrim(title))
      HAVING COUNT(DISTINCT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::date) >= 3
      ORDER BY COUNT(*) DESC LIMIT 1
    `;
    const title = rows[0]?.title?.trim();
    if (!title) return null;
    const repeating = await this.db.plannerTask.findFirst({
      where: {
        userId,
        deletedAt: null,
        title: { equals: title, mode: 'insensitive' },
        OR: [{ repeatRule: { not: null } }, { recurrenceRule: { not: null } }],
      },
      select: { id: true },
    });
    if (repeating) return null;
    const hash = createHash('sha256')
      .update(title.toLowerCase())
      .digest('hex')
      .slice(0, 16);
    return prompt(
      'repeat-task',
      `prompt:repeat:${hash}`,
      { fa: 'هر روز تکرار شود؟', en: 'Repeat it every day?' },
      {
        fa: 'این کار را چند روز پشت‌سرهم ثبت کردی. یک بار ساعتش را بگو، هر روز خودش اضافه و یادآوری می‌شود.',
        en: 'You added this task on several days. Pick a time once and it repeats with a reminder every day.',
      },
      { title: title.slice(0, 200) },
    );
  }

  /** Meals are being logged but there is no weight goal, so the daily calorie target is a guess. */
  private async weightGoal(userId: string): Promise<Prompt | null> {
    const profile = await this.db.healthProfile.findUnique({
      where: { userId },
      select: { targetWeightKg: true },
    });
    if (profile?.targetWeightKg) return null;
    if ((await this.db.mealLog.count({ where: { userId } })) < 3) return null;
    return prompt(
      'weight-goal',
      'prompt:weight-goal',
      { fa: 'هدف وزنت را بگذار', en: 'Set your weight goal' },
      {
        fa: 'وزن فعلی، وزن هدف و تاریخش را بگو تا کالری روزانه‌ات درست حساب شود.',
        en: 'Your current weight, your goal and a date make your daily calories accurate.',
      },
    );
  }

  /** Cards are waiting and nothing was reviewed for three days: five quick cards in the sheet. */
  private async review(
    userId: string,
    now: Date,
    used: ReadonlySet<string>,
  ): Promise<Prompt | null> {
    if ([...used].filter((key) => key.startsWith('prompt:review:')).length >= 3)
      return null;
    const due = await this.db.englishCard.count({
      where: { userId, suspended: false, dueAt: { lte: now } },
    });
    if (due < REVIEW_PROMPT_DUE) return null;
    const recent = await this.db.englishReviewDay.findFirst({
      where: {
        userId,
        date: { gte: new Date(now.getTime() - 3 * 86_400_000) },
      },
      select: { userId: true },
    });
    if (recent) return null;
    return prompt(
      'review-cards',
      `prompt:review:${tehranDay(now)}`,
      { fa: 'پنج کارت، یک دقیقه', en: 'Five cards, one minute' },
      {
        fa: `${new Intl.NumberFormat('fa').format(due)} کارت منتظر مرور است. پنج‌تا را همین‌جا مرور کن.`,
        en: `${due} cards are waiting. Review five right here.`,
      },
    );
  }

  private async rewards(userId: string, now: Date): Promise<Prompt | null> {
    const offers = await this.billing.rewardOffers(userId, now);
    const open = offers.some(
      (o) =>
        (o.campaign === 'TELEGRAM_JOIN' || o.campaign === 'INSTAGRAM_FOLLOW') &&
        o.status === 'available',
    );
    return open
      ? prompt(
          'rewards',
          'prompt:rewards',
          { fa: 'هر عضویت، یک هفته هدیه', en: 'A free week for each follow' },
          {
            fa: 'در تلگرام یا اینستاگرام پشتت گرم عضو شو و نام کاربری‌ات را بفرست؛ بعد از بررسی، یک هفته هوش مصنوعی اضافه می‌شود.',
            en: 'Join Poshtetgarm on Telegram or Instagram and send your username; after a check, one week of AI is added.',
          },
        )
      : null;
  }

  /** Uses the assistant often (5+ days in two weeks) and has no ChatGPT/Claude token yet. */
  private async aiConnection(
    userId: string,
    now: Date,
  ): Promise<Prompt | null> {
    const since = new Date(now.getTime() - 14 * 86_400_000);
    const [row] = await this.db.$queryRaw<{ days: bigint }[]>`
      SELECT COUNT(DISTINCT day) AS days FROM ai_usage_days
      WHERE "userId" = ${userId}::uuid AND kind = 'chat' AND day >= ${since}::date
    `;
    if (Number(row?.days ?? 0) < 5) return null;
    if (
      await this.db.mcpKey.findFirst({
        where: { userId },
        select: { id: true },
      })
    )
      return null;
    return prompt(
      'ai-connection',
      'prompt:ai-connection',
      { fa: 'از داخل ChatGPT یا Claude', en: 'From inside ChatGPT or Claude' },
      {
        fa: 'پشتت گرم را به ChatGPT یا Claude وصل کن تا همان‌جا کار، کارت و وعده ثبت کنی.',
        en: 'Connect Poshtetgarm to ChatGPT or Claude and add tasks, cards and meals right there.',
      },
    );
  }
}

function tehranDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
