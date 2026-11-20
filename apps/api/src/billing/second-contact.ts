import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ContactEvents } from '@all-in-one/api/auth';
import { PrismaService } from '@all-in-one/api/db';
import { BillingService } from './billing.service';

/** Days the "week added" notice waits for the account to open the app. */
const NOTICE_DAYS = 14;

/**
 * Grants the second-contact week when an account confirms its phone or email (directive 121), and tells the
 * customer with an in-app notice: before, the week was added silently and was found only on the billing page.
 */
@Injectable()
export class SecondContactWeek implements OnModuleInit {
  private readonly logger = new Logger(SecondContactWeek.name);

  constructor(
    private readonly events: ContactEvents,
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.events.onConfirmed(async (userId) => {
      const granted = await this.billing.grantSecondContact(userId);
      if (granted) await this.notify(userId);
      return granted;
    });
  }

  async notify(userId: string, now = new Date()): Promise<void> {
    const key = 'reward:SECOND_CONTACT';
    try {
      await this.prisma.inAppNotification.upsert({
        where: { userId_key: { userId, key } },
        create: {
          userId,
          key,
          source: 'reward',
          content: {
            title: {
              fa: 'یک هفته هوش مصنوعی هدیه گرفتی',
              en: 'You earned a week of AI',
            },
            message: {
              fa: 'راه دوم ارتباط با حسابت تأیید شد و یک هفته به اشتراکت اضافه شد.',
              en: 'Your second contact was confirmed and a week was added to your plan.',
            },
            actions: [
              {
                label: { fa: 'دیدن اشتراک', en: 'View plan' },
                url: '/billing',
                primary: true,
              },
            ],
          },
          expiresAt: new Date(now.getTime() + NOTICE_DAYS * 86_400_000),
        },
        update: {},
      });
    } catch (error) {
      this.logger.warn(`Second-contact notice failed: ${String(error)}`);
    }
  }
}
