import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser, Roles, type AuthUser } from '@all-in-one/api/auth';
import { PrismaService } from '@all-in-one/api/db';
import {
  createInAppNotificationSchema,
  inAppContentSchema,
  isNewerVersion,
  parseSemver,
  type CreateInAppNotification,
  type InAppContent,
  type InAppNotification,
} from '@all-in-one/shared/schemas';
import { BillingService } from './billing/billing.service';
import { InAppPrompts } from './in-app-prompts';

/** Store builds announce themselves in the user agent (directive 120). */
export function storeFromUserAgent(
  userAgent: string | undefined,
): 'bazaar' | 'myket' | null {
  const match = /PoshtetgarmStore\/(bazaar|myket)/i.exec(userAgent ?? '');
  return match ? (match[1].toLowerCase() as 'bazaar' | 'myket') : null;
}

/** Native shell 1.0.7+ announces its version in every flavor's user agent. */
export function shellVersionFromUserAgent(
  userAgent: string | undefined,
): string | null {
  const match = /\bPoshtetgarmApp\/(\d+\.\d+\.\d+)\b/i.exec(userAgent ?? '');
  return match ? match[1] : null;
}

export type AndroidShellClient = 'bazaar' | 'myket' | 'direct_apk';

export function androidShellClient(
  userAgent: string | undefined,
  clientHint?: string,
): AndroidShellClient | null {
  const store = storeFromUserAgent(userAgent);
  if (store) return store;
  if (
    /Android/i.test(userAgent ?? '') &&
    (shellVersionFromUserAgent(userAgent) || clientHint === 'direct_apk')
  ) {
    return 'direct_apk';
  }
  return null;
}

const STORE_PAGES = {
  bazaar: {
    url: 'https://cafebazaar.ir/app/ir.poshtetgarm.poshtetgarm_hybrid',
    fa: 'کافه‌بازار',
    en: 'Cafe Bazaar',
  },
  myket: {
    url: 'https://myket.ir/app/ir.poshtetgarm.poshtetgarm_hybrid',
    fa: 'مایکت',
    en: 'Myket',
  },
} as const;
const DIRECT_APK_RELEASES_URL =
  'https://github.com/mojtabanpe/all_in_one/releases/latest';
/** Ask only an account that has used the app on this many separate Tehran days. */
export const RATE_PROMPT_ACTIVE_DAYS = 3;

@Injectable()
export class InAppNotificationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly billing: BillingService,
    @Optional() private readonly prompts?: InAppPrompts,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async pending(
    userId: string,
    now = new Date(),
    userAgent?: string,
    clientHint?: string,
  ): Promise<InAppNotification[]> {
    await this.offerAndroidShellUpdate(userId, now, userAgent, clientHint);
    await this.offerStoreRating(userId, now, storeFromUserAgent(userAgent));
    const access = await this.billing.access(userId, now);
    const end = access.trialUntil ? Date.parse(access.trialUntil) : 0;
    const remaining = end - now.getTime();
    const eligible =
      access.tier === 'trial' &&
      remaining > 0 &&
      remaining <= 3 * 86_400_000 &&
      (!access.aiUntil || Date.parse(access.aiUntil) <= end);
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const key = eligible ? `trial:${end}:${day}` : '';
    // Old reminders must disappear after a payment or earned week, including on another device.
    await this.db.inAppNotification.updateMany({
      where: {
        userId,
        source: 'trial',
        key: { not: key },
        expiresAt: { gt: now },
      },
      data: { expiresAt: now },
    });
    if (eligible) {
      const offers = await this.billing.rewardOffers(userId, now);
      const canEarn = offers.some(
        (o) =>
          (o.campaign === 'TELEGRAM_JOIN' ||
            o.campaign === 'INSTAGRAM_FOLLOW') &&
          o.status === 'available',
      );
      const days = Math.ceil(remaining / 86_400_000);
      const content: InAppContent = {
        title: {
          fa: 'دورهٔ آزمایشی‌ات رو به پایان است',
          en: 'Your trial is ending soon',
        },
        message: {
          fa: `فقط ${new Intl.NumberFormat('fa').format(days)} روز از دسترسی آزمایشی هوش مصنوعی‌ات باقی مانده است. با خرید اشتراک، ادامه بده.`,
          en: `You have ${days} days left in your AI trial. Choose a subscription to keep going.`,
        },
        ...(canEarn
          ? {
              detail: {
                fa: 'با عضویت در تلگرام یا اینستاگرام، برای هر کدام یک هفته هوش مصنوعی هدیه بگیر. بعد از عضویت، نام کاربری‌ات را برای بررسی بفرست.',
                en: 'Join us on Telegram or Instagram to earn one week of AI access for each. After joining, submit your username for verification.',
              },
            }
          : {}),
        actions: [
          {
            label: { fa: 'دیدن پلن‌ها', en: 'View plans' },
            url: '/billing',
            primary: true,
          },
          ...(canEarn
            ? [
                {
                  label: {
                    fa: 'تمدید رایگان با تلگرام و اینستاگرام',
                    en: 'Extend for free with Telegram and Instagram',
                  },
                  url: '/billing#offers-heading',
                },
              ]
            : []),
        ],
      };
      await this.db.inAppNotification.upsert({
        where: { userId_key: { userId, key } },
        create: {
          userId,
          key,
          source: 'trial',
          content,
          expiresAt: new Date(end),
        },
        update: { content },
      });
    }
    // Last: a hard step done in the sheet, only when no other notice is waiting (one sheet at a time).
    await this.prompts?.offer(userId, now, () => this.activeDays(userId));
    const rows = await this.db.inAppNotification.findMany({
      where: { userId, dismissedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    return rows.map((row) => ({
      id: row.id,
      ...inAppContentSchema.parse(row.content),
    }));
  }

  /**
   * Notice for older Android shells, gated by `ANDROID_SHELL_LATEST_VERSION` so it only fires after a new APK is
   * actually published. Shells 1.0.7+ carry `PoshtetgarmApp/<ver>` for an exact SemVer check; older shells have no
   * version in the user agent, so lacking a `local_reminder_devices` row is used as an honest heuristic (guess) that
   * the shell predates local reminders (1.0.6, directives 175/180). Shown at most once per account per published
   * version; dismissing or tapping the button ends it.
   */
  private async offerAndroidShellUpdate(
    userId: string,
    now: Date,
    userAgent: string | undefined,
    clientHint?: string,
  ): Promise<void> {
    const latest = (
      this.config?.get<string>('ANDROID_SHELL_LATEST_VERSION') ??
      process.env['ANDROID_SHELL_LATEST_VERSION']
    )?.trim();
    if (!latest || !parseSemver(latest)) return;
    const client = androidShellClient(userAgent, clientHint);
    if (!client) return;
    const key = `android-shell-update:${latest}`;
    if (
      await this.db.inAppNotification.findUnique({
        where: { userId_key: { userId, key } },
        select: { id: true },
      })
    )
      return;
    const shellVersion = shellVersionFromUserAgent(userAgent);
    if (shellVersion) {
      if (!isNewerVersion(latest, shellVersion)) return;
    } else {
      // Heuristic (guess) for shells before 1.0.7: no local-reminder schedule recorded means likely < 1.0.6.
      const hasLocalReminders = await this.db.localReminderDevice.findFirst({
        where: { userId },
        select: { userId: true },
      });
      if (hasLocalReminders) return;
    }
    const action =
      client === 'direct_apk'
        ? {
            label: { fa: 'دریافت نسخهٔ تازه', en: 'Download latest version' },
            url: DIRECT_APK_RELEASES_URL,
            primary: true,
          }
        : {
            label: {
              fa: `به‌روزرسانی در ${STORE_PAGES[client].fa}`,
              en: `Update on ${STORE_PAGES[client].en}`,
            },
            url: STORE_PAGES[client].url,
            primary: true,
          };
    const content: InAppContent = {
      title: {
        fa: 'نسخهٔ تازهٔ برنامه آماده است',
        en: 'A newer app version is available',
      },
      message: {
        fa: 'نسخهٔ تازهٔ برنامه اعلان‌ها را بهتر می‌کند.',
        en: 'The newer version of the app improves notifications.',
      },
      actions: [action],
    };
    await this.db.inAppNotification.upsert({
      where: { userId_key: { userId, key } },
      create: {
        userId,
        key,
        source: 'shell-update',
        content,
        expiresAt: new Date(now.getTime() + 30 * 86_400_000),
      },
      update: {},
    });
  }

  /**
   * Store ratings decide ranking in Cafe Bazaar and Myket, where most new accounts come from (2026-11-17), and both
   * listings had none. Ask once, from the store build itself, an account that has really used the app; closing or
   * tapping the notice ends it for good (the key is unique per account and store).
   */
  private async offerStoreRating(
    userId: string,
    now: Date,
    store: 'bazaar' | 'myket' | null,
  ): Promise<void> {
    if (!store) return;
    const key = `rate:${store}`;
    if (
      await this.db.inAppNotification.findUnique({
        where: { userId_key: { userId, key } },
        select: { id: true },
      })
    )
      return;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, role: true },
    });
    if (
      !user ||
      user.role !== 'CUSTOMER' ||
      now.getTime() - user.createdAt.getTime() <
        RATE_PROMPT_ACTIVE_DAYS * 86_400_000
    )
      return;
    if ((await this.activeDays(userId)) < RATE_PROMPT_ACTIVE_DAYS) return;
    const page = STORE_PAGES[store];
    const content: InAppContent = {
      title: {
        fa: 'از Poshtetgarm راضی هستی؟',
        en: 'Enjoying Poshtetgarm?',
      },
      message: {
        fa: `اگر به کارت می‌آید، با یک امتیاز و نظر در ${page.fa} کمک کن دیگران هم پیدایش کنند.`,
        en: `If it helps you, a rating and a short review on ${page.en} helps others find it.`,
      },
      actions: [
        {
          label: { fa: `امتیاز در ${page.fa}`, en: `Rate on ${page.en}` },
          url: page.url,
          primary: true,
        },
      ],
    };
    await this.db.inAppNotification.upsert({
      where: { userId_key: { userId, key } },
      create: {
        userId,
        key,
        source: 'rating',
        content,
        expiresAt: new Date(now.getTime() + 30 * 86_400_000),
      },
      update: {},
    });
  }

  /** Separate Tehran days on which the account saved something of its own or used the AI. */
  private async activeDays(userId: string): Promise<number> {
    const [row] = await this.db.$queryRaw<{ days: bigint }[]>`
      SELECT COUNT(DISTINCT d) AS days FROM (
        SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::date AS d FROM planner_tasks WHERE "userId" = ${userId}::uuid
        UNION SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::date FROM english_cards WHERE "userId" = ${userId}::uuid
        UNION SELECT date::date FROM english_review_days WHERE "userId" = ${userId}::uuid
        UNION SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::date FROM meal_logs WHERE "userId" = ${userId}::uuid
        UNION SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::date FROM workout_logs WHERE "userId" = ${userId}::uuid
        UNION SELECT c.date::date FROM planner_habit_checkins c JOIN planner_habits h ON h.id = c."habitId" WHERE h."userId" = ${userId}::uuid
        UNION SELECT day::date FROM ai_usage_days WHERE "userId" = ${userId}::uuid
      ) AS active
    `;
    return Number(row?.days ?? 0);
  }

  async dismiss(userId: string, id: string) {
    await this.db.inAppNotification.updateMany({
      where: { id, userId, dismissedAt: null },
      data: { dismissedAt: new Date() },
    });
    return { ok: true };
  }

  create(input: CreateInAppNotification) {
    return this.db.inAppNotification.upsert({
      where: { userId_key: { userId: input.userId, key: input.key } },
      create: {
        userId: input.userId,
        key: input.key,
        content: input.content,
        expiresAt: new Date(input.expiresAt),
      },
      update: {},
    });
  }
}

@Controller('in-app-notifications')
export class InAppNotificationsController {
  constructor(private readonly service: InAppNotificationsService) {}
  @Get()
  pending(
    @CurrentUser() user: AuthUser,
    @Headers('user-agent') userAgent?: string,
    @Query('client') client?: string,
  ) {
    return this.service.pending(user.id, new Date(), userAgent, client);
  }

  @Post(':id/dismiss')
  @HttpCode(200)
  dismiss(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.dismiss(user.id, id);
  }

  @Post()
  @Roles('ADMIN')
  create(
    @Body({ schema: createInAppNotificationSchema })
    input: CreateInAppNotification,
  ) {
    return this.service.create(input);
  }
}
