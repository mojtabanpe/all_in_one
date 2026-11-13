import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '@all-in-one/api/auth';
import { PrismaService } from '@all-in-one/api/db';
import {
  createInAppNotificationSchema,
  inAppContentSchema,
  type CreateInAppNotification,
  type InAppContent,
  type InAppNotification,
} from '@all-in-one/shared/schemas';
import { BillingService } from './billing/billing.service';

@Injectable()
export class InAppNotificationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly billing: BillingService,
  ) {}

  async pending(
    userId: string,
    now = new Date(),
  ): Promise<InAppNotification[]> {
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
  pending(@CurrentUser() user: AuthUser) {
    return this.service.pending(user.id);
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
