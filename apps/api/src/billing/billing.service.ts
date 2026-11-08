import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Optional,
  UnprocessableEntityException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';
import { SmsService, smsDate } from '@all-in-one/api/auth';
import {
  BILLING_RENEW_WINDOW_MS,
  billingPlanCodeFromSku,
  billingStoreSku,
  canBuyPlan,
} from '@all-in-one/shared/schemas';
import type {
  BillingAccessState,
  BillingRewardInput,
  BillingRewardOffer,
  BillingRewardRequestInput,
  BillingPendingReward,
  BillingAccount,
  BillingAdjustmentInput,
  BillingAdminOrderPage,
  BillingAdminOrdersQuery,
  BillingMetrics,
  BillingOrderSummary,
  BillingPlan,
  BillingPlanInput,
  BillingRefundInput,
  BillingReturnStatus,
  BillingStoreIntent,
  BillingStoreIntentInput,
  BillingStoreVerifyInput,
  BillingSubscriptionState,
} from '@all-in-one/shared/schemas';
import { StoreGateway } from './store.gateway';
import { ZibalGateway } from './zibal.gateway';

const STORE_PROVIDERS = { bazaar: 'BAZAAR', myket: 'MYKET' } as const;
const invalidPurchase = () =>
  new UnprocessableEntityException({
    code: 'BILLING_STORE_INVALID',
    message: 'Purchase could not be verified',
  });

const SOCIAL_OFFERS = [
  {
    campaign: 'TELEGRAM_JOIN',
    url: 'https://t.me/poshtetgarm',
    flag: 'BILLING_TELEGRAM_OFFER_ENABLED',
  },
  {
    campaign: 'INSTAGRAM_FOLLOW',
    url: 'https://www.instagram.com/poshtetgarm/',
    flag: 'BILLING_INSTAGRAM_OFFER_ENABLED',
  },
] as const;

const WEEK_MS = 7 * 86_400_000;
/** SUBSCRIPTION_EXPIRING goes out when paid access ends within three days. */
export const EXPIRY_NOTICE_MS = BILLING_RENEW_WINDOW_MS;
/**
 * Trials launched on this day (Tehran midnight). Accounts confirmed earlier get their week from here, so no
 * customer meets the paywall without having had a trial.
 */
export const TRIAL_LAUNCH = new Date('2026-11-06T20:30:00.000Z');
const trialEnd = (verifiedAt: Date) =>
  new Date(Math.max(verifiedAt.getTime(), TRIAL_LAUNCH.getTime()) + WEEK_MS);

const planFields = {
  code: true,
  titleFa: true,
  titleEn: true,
  months: true,
  priceRial: true,
  active: true,
} as const;

/** An order that has no gateway reference after this long never reached the gateway. */
const ABANDONED_MS = 10 * 60_000;
/** Long enough for someone still on the gateway page to finish paying. */
const RECONCILE_AFTER_MS = 30 * 60_000;
const RECONCILE_WITHIN_MS = 7 * 86_400_000;
const RECONCILE_BATCH = 20;

/** Adds calendar months in UTC, clamping to the last day (Jan 31 + 1 month → Feb 28/29). */
export function addMonths(from: Date, months: number): Date {
  const date = new Date(from);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date;
}

/**
 * Orders, Zibal checkout and subscription activation. The browser's return from the gateway is untrusted:
 * only a server-side verify of an owned order activates, exactly once per order.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ZibalGateway,
    private readonly config: ConfigService = new ConfigService(),
    @Optional() private readonly sms?: SmsService,
    @Optional() private readonly store?: StoreGateway,
  ) {}

  /**
   * SUBSCRIPTION_EXPIRING: one SMS per paid period, when its end is less than EXPIRY_NOTICE_MS away, to accounts
   * with a confirmed number. Claimed per row first, so overlapping sweeps never send twice.
   */
  async notifyExpiring(now = new Date()): Promise<number> {
    if (!this.sms?.enabled) return 0;
    const rows = await this.prisma.billingSubscription.findMany({
      where: {
        paidUntil: { gt: now, lte: new Date(now.getTime() + EXPIRY_NOTICE_MS) },
        user: { phone: { not: null } },
      },
      select: {
        userId: true,
        paidUntil: true,
        expiryNoticeFor: true,
        user: { select: { phone: true } },
      },
      take: 100,
    });
    let sent = 0;
    for (const row of rows) {
      if (row.expiryNoticeFor?.getTime() === row.paidUntil.getTime()) continue;
      const claimed = await this.prisma.billingSubscription.updateMany({
        where: {
          userId: row.userId,
          paidUntil: row.paidUntil,
          OR: [
            { expiryNoticeFor: null },
            { expiryNoticeFor: { not: row.paidUntil } },
          ],
        },
        data: { expiryNoticeFor: row.paidUntil },
      });
      if (!claimed.count || !row.user.phone) continue;
      this.sms.notify('SUBSCRIPTION_EXPIRING', row.user.phone, {
        plan: await this.planTitle(row.userId),
        expiry_date: smsDate(row.paidUntil),
      });
      sent++;
    }
    return sent;
  }

  /** The `%plan%` of an account: its latest paid plan's Persian title (30 characters at most). */
  private async planTitle(userId: string): Promise<string> {
    const order = await this.prisma.billingOrder.findFirst({
      where: { userId, status: 'PAID' },
      orderBy: { paidAt: 'desc' },
      select: { plan: { select: { titleFa: true } } },
    });
    return (order?.plan.titleFa ?? 'Poshtetgarm').slice(0, 30);
  }

  plans(): Promise<BillingPlan[]> {
    return this.prisma.billingPlan.findMany({
      where: { active: true },
      select: planFields,
      orderBy: [{ months: 'asc' }, { priceRial: 'asc' }],
    });
  }

  adminPlans(): Promise<BillingPlan[]> {
    return this.prisma.billingPlan.findMany({
      select: planFields,
      orderBy: [{ months: 'asc' }, { code: 'asc' }],
    });
  }

  /** Existing orders keep the months/amount they were created with. */
  savePlan(input: BillingPlanInput): Promise<BillingPlan> {
    const { code, ...data } = input;
    return this.prisma.billingPlan.upsert({
      where: { code },
      create: input,
      update: data,
      select: planFields,
    });
  }

  async subscription(
    userId: string,
    now = new Date(),
  ): Promise<BillingSubscriptionState> {
    const row = await this.prisma.billingSubscription.findUnique({
      where: { userId },
    });
    return {
      paidUntil: row?.paidUntil.toISOString() ?? null,
      active: !!row && row.paidUntil > now,
    };
  }

  /**
   * Trial time starts after email confirmation, when the account can sign in (not before TRIAL_LAUNCH).
   * Admins run the service and always have AI.
   */
  async access(userId: string, now = new Date()): Promise<BillingAccessState> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        emailVerifiedAt: true,
        billingSubscription: { select: { paidUntil: true } },
        billingRewards: {
          where: { startsAt: { lte: now }, expiresAt: { gt: now } },
          orderBy: { expiresAt: 'desc' },
          take: 1,
          select: { expiresAt: true },
        },
      },
    });
    const trialUntil =
      user?.role === 'CUSTOMER' && user.emailVerifiedAt
        ? trialEnd(user.emailVerifiedAt)
        : null;
    const paidUntil = user?.billingSubscription?.paidUntil ?? null;
    const earnedUntil = user?.billingRewards[0]?.expiresAt ?? null;
    let tier: BillingAccessState['tier'] = 'free';
    if (user?.role === 'ADMIN') tier = 'staff';
    else if (paidUntil && paidUntil > now) tier = 'paid';
    else if (earnedUntil) tier = 'earned';
    else if (trialUntil && trialUntil > now) tier = 'trial';
    return {
      tier,
      trialUntil: trialUntil?.toISOString() ?? null,
      earnedUntil: earnedUntil?.toISOString() ?? null,
      paidUntil: paidUntil?.toISOString() ?? null,
    };
  }

  /** Server-side entitlement check for paid features. */
  async isPaid(userId: string, now = new Date()): Promise<boolean> {
    return (await this.subscription(userId, now)).active;
  }

  async orders(userId: string): Promise<BillingOrderSummary[]> {
    const rows = await this.prisma.billingOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        months: true,
        amountRial: true,
        status: true,
        refNumber: true,
        createdAt: true,
        paidAt: true,
        plan: { select: { code: true } },
        refund: { select: { amountRial: true } },
      },
    });
    return rows.map(({ plan, createdAt, paidAt, refund, ...row }) => ({
      ...row,
      plan: plan.code,
      createdAt: createdAt.toISOString(),
      paidAt: paidAt?.toISOString() ?? null,
      refundedRial: refund?.amountRial ?? null,
    }));
  }

  /** Support view: every order, newest first, 50 a page, with the last 30 days at a glance. */
  async adminOrders(
    query: BillingAdminOrdersQuery,
    now = new Date(),
  ): Promise<BillingAdminOrderPage> {
    const where = query.status ? { status: query.status } : {};
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const recent = { createdAt: { gte: since } };
    const [
      rows,
      total,
      activeSubscribers,
      paid,
      gatewayOrders,
      failedOrders,
      pendingOrders,
      refunds,
    ] = await Promise.all([
      this.prisma.billingOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: ((query.page ?? 1) - 1) * 50,
        take: 50,
        select: {
          id: true,
          months: true,
          amountRial: true,
          status: true,
          refNumber: true,
          trackId: true,
          provider: true,
          createdAt: true,
          paidAt: true,
          plan: { select: { code: true } },
          user: { select: { email: true } },
          refund: { select: { amountRial: true } },
        },
      }),
      this.prisma.billingOrder.count({ where }),
      this.prisma.billingSubscription.count({
        where: { paidUntil: { gt: now } },
      }),
      // A refunded order was still paid; the money returned is reported on its own.
      this.prisma.billingOrder.aggregate({
        where: { status: { in: ['PAID', 'REFUNDED'] }, paidAt: { gte: since } },
        _count: true,
        _sum: { amountRial: true },
      }),
      this.prisma.billingOrder.count({
        where: { ...recent, trackId: { not: null } },
      }),
      this.prisma.billingOrder.count({
        where: { status: 'FAILED', ...recent },
      }),
      this.prisma.billingOrder.count({ where: { status: 'PENDING' } }),
      this.prisma.billingRefund.aggregate({
        where: { createdAt: { gte: since } },
        _count: true,
        _sum: { amountRial: true },
      }),
    ]);
    return {
      orders: rows.map(({ plan, user, createdAt, paidAt, refund, ...row }) => ({
        ...row,
        plan: plan.code,
        email: user.email,
        createdAt: createdAt.toISOString(),
        paidAt: paidAt?.toISOString() ?? null,
        refundedRial: refund?.amountRial ?? null,
      })),
      total,
      overview: {
        activeSubscribers,
        paidOrders: paid._count,
        paidRial: paid._sum.amountRial ?? 0,
        refunds: refunds._count,
        refundedRial: refunds._sum.amountRial ?? 0,
        gatewayOrders,
        failedOrders,
        pendingOrders,
      },
    };
  }

  /** Recurring-revenue view for admins; see `BillingMetrics` for each definition. */
  async metrics(now = new Date()): Promise<BillingMetrics> {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const [row] = await this.prisma.$queryRaw<
      {
        paidUsers: number;
        manualPaidUsers: number;
        mrrRial: number;
        newPaidUsers: number;
        renewals: number;
        endedPaidUsers: number;
      }[]
    >`
      WITH active AS (
        SELECT "userId" FROM billing_subscriptions WHERE "paidUntil" > ${now}
      ),
      latest AS (
        SELECT DISTINCT ON (o."userId")
          o."userId", (o."amountRial" - COALESCE(r."amountRial", 0))::float8 / o.months AS monthly
        FROM billing_orders o
        JOIN active a ON a."userId" = o."userId"
        LEFT JOIN billing_refunds r ON r."orderId" = o.id
        WHERE o.status = 'PAID'
        ORDER BY o."userId", o."paidAt" DESC
      ),
      firsts AS (
        SELECT "userId", MIN("paidAt") AS first
        FROM billing_orders WHERE status IN ('PAID', 'REFUNDED') GROUP BY "userId"
      )
      SELECT
        (SELECT COUNT(*) FROM active)::int AS "paidUsers",
        (SELECT COUNT(*) FROM active a WHERE NOT EXISTS
          (SELECT 1 FROM latest l WHERE l."userId" = a."userId"))::int AS "manualPaidUsers",
        COALESCE((SELECT ROUND(SUM(monthly)) FROM latest), 0)::int AS "mrrRial",
        (SELECT COUNT(*) FROM firsts WHERE first >= ${since})::int AS "newPaidUsers",
        (SELECT COUNT(*) FROM billing_orders o JOIN firsts f ON f."userId" = o."userId"
          WHERE o.status IN ('PAID', 'REFUNDED') AND o."paidAt" >= ${since}
            AND o."paidAt" > f.first)::int AS "renewals",
        (SELECT COUNT(*) FROM billing_subscriptions
          WHERE "paidUntil" > ${since} AND "paidUntil" <= ${now})::int AS "endedPaidUsers"
    `;
    return row;
  }

  /** Support view of one account: paid access, latest orders and every manual change. */
  async account(email: string, now = new Date()): Promise<BillingAccount> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('Account not found');
    const [subscription, orders, adjustments, rewards, refunds] =
      await Promise.all([
        this.subscription(user.id, now),
        this.orders(user.id),
        this.prisma.billingAdjustment.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { admin: { select: { email: true } } },
        }),
        this.prisma.billingReward.findMany({
          where: { userId: user.id },
          orderBy: { startsAt: 'asc' },
          include: { admin: { select: { email: true } } },
        }),
        this.prisma.billingRefund.findMany({
          where: { order: { userId: user.id } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { admin: { select: { email: true } } },
        }),
      ]);
    return {
      email: user.email,
      name: user.name,
      subscription,
      orders,
      rewards: rewards.map((row) => ({
        campaign: row.campaign,
        startsAt: row.startsAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        reason: row.reason,
        adminEmail: row.admin.email,
      })),
      refunds: refunds.map((row) => ({
        orderId: row.orderId,
        amountRial: row.amountRial,
        reason: row.reason,
        reference: row.reference,
        adminEmail: row.admin.email,
        createdAt: row.createdAt.toISOString(),
      })),
      adjustments: adjustments.map((row) => ({
        id: row.id,
        action: row.action,
        days: row.days,
        reason: row.reason,
        adminEmail: row.admin.email,
        previousUntil: row.previousUntil?.toISOString() ?? null,
        newUntil: row.newUntil.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async rewardOffers(
    userId: string,
    now = new Date(),
  ): Promise<BillingRewardOffer[]> {
    const offers = SOCIAL_OFFERS.filter(
      ({ flag }) => this.config.get(flag) === 'true',
    );
    if (!offers.length) return [];
    // Every confirmed customer can earn each week once, from signup on (directive 108); the week is
    // queued after the trial, paid time and earlier rewards.
    if (!(await this.access(userId, now)).trialUntil) return [];
    const [grants, requests] = await Promise.all([
      this.prisma.billingReward.findMany({
        where: { userId },
        select: { campaign: true },
      }),
      this.prisma.billingRewardRequest.findMany({
        where: { userId },
        select: { campaign: true },
      }),
    ]);
    return offers.map(({ campaign, url }) => ({
      campaign,
      url,
      status: grants.some((item) => item.campaign === campaign)
        ? 'earned'
        : requests.some((item) => item.campaign === campaign)
          ? 'pending'
          : 'available',
    }));
  }

  async requestReward(
    userId: string,
    input: BillingRewardRequestInput,
    now = new Date(),
  ) {
    const eligible = (await this.rewardOffers(userId, now)).find(
      ({ campaign }) => campaign === input.campaign,
    );
    if (!eligible || eligible.status === 'earned')
      throw new ForbiddenException('این پیشنهاد برای حساب تو در دسترس نیست.');
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const granted = await tx.billingReward.findUnique({
        where: { userId_campaign: { userId, campaign: input.campaign } },
        select: { id: true },
      });
      if (granted) return;
      await tx.billingRewardRequest.createMany({
        data: [
          {
            userId,
            campaign: input.campaign,
            handle: input.handle.replace(/^@/, ''),
          },
        ],
        skipDuplicates: true,
      });
    });
    return this.rewardOffers(userId, now);
  }

  async pendingRewards(): Promise<BillingPendingReward[]> {
    const rows = await this.prisma.billingRewardRequest.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 30,
      include: { user: { select: { email: true } } },
    });
    return rows.map(({ id, campaign, handle, createdAt, user }) => ({
      id,
      campaign,
      handle,
      createdAt: createdAt.toISOString(),
      email: user.email,
    }));
  }

  async dismissRewardRequest(id: string): Promise<void> {
    await this.prisma.billingRewardRequest.deleteMany({ where: { id } });
  }

  async grantReward(
    adminId: string,
    input: BillingRewardInput,
    now = new Date(),
  ): Promise<BillingAccount> {
    const email = input.email.trim().toLowerCase();
    await this.prisma.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw<
        { id: string; role: string; emailVerifiedAt: Date | null }[]
      >`
        SELECT id, role, "emailVerifiedAt" FROM users WHERE email = ${email} FOR UPDATE
      `;
      if (!user) throw new NotFoundException('Account not found');
      if (user.role !== 'CUSTOMER' || !user.emailVerifiedAt) {
        throw new UnprocessableEntityException(
          'هدیه فقط برای حساب کاربری تأییدشده فعال می‌شود.',
        );
      }
      const rewards = await tx.billingReward.findMany({
        where: { userId: user.id },
        select: { campaign: true, expiresAt: true },
      });
      if (rewards.some((reward) => reward.campaign === input.campaign)) {
        throw new ConflictException(
          'این هدیه قبلاً برای این حساب ثبت شده است.',
        );
      }
      const paid = await tx.billingSubscription.findUnique({
        where: { userId: user.id },
        select: { paidUntil: true },
      });
      const start = Math.max(
        now.getTime(),
        trialEnd(user.emailVerifiedAt).getTime(),
        paid?.paidUntil.getTime() ?? 0,
        ...rewards.map((reward) => reward.expiresAt.getTime()),
      );
      await tx.billingReward.create({
        data: {
          userId: user.id,
          adminId,
          campaign: input.campaign,
          reason: input.reason,
          startsAt: new Date(start),
          expiresAt: new Date(start + WEEK_MS),
        },
      });
      await tx.billingRewardRequest.deleteMany({
        where: { userId: user.id, campaign: input.campaign },
      });
    });
    return this.account(email, now);
  }

  /**
   * Admin change to someone's paid access: extend by days from max(now, paidUntil), or end it now. The change
   * and its audit row commit together, under the same account lock as payment activation.
   */
  async adjust(
    adminId: string,
    input: BillingAdjustmentInput,
    now = new Date(),
  ): Promise<BillingAccount> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Account not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "users" WHERE "id" = ${user.id}::uuid FOR UPDATE`;
      const current = await tx.billingSubscription.findUnique({
        where: { userId: user.id },
      });
      const previousUntil = current?.paidUntil ?? null;
      let newUntil: Date;
      if (input.action === 'extend') {
        const start =
          previousUntil && previousUntil > now ? previousUntil : now;
        newUntil = new Date(start.getTime() + input.days * 86_400_000);
      } else {
        if (!previousUntil || previousUntil <= now)
          throw new UnprocessableEntityException(
            'There is no active subscription to end',
          );
        newUntil = now;
      }
      await tx.billingSubscription.upsert({
        where: { userId: user.id },
        create: { userId: user.id, paidUntil: newUntil },
        update: { paidUntil: newUntil },
      });
      await tx.billingAdjustment.create({
        data: {
          userId: user.id,
          adminId,
          action: input.action === 'extend' ? 'EXTEND' : 'END',
          days: input.action === 'extend' ? input.days : null,
          reason: input.reason.trim(),
          previousUntil,
          newUntil,
        },
      });
    });
    return this.account(input.email, now);
  }

  /**
   * Records money returned for a paid order, once. The order and the account are locked like activation, so a
   * refund and a payment of the same account never interleave. `remove` takes the order's months back from paid
   * access (never before now) and writes a REFUND adjustment row; a full refund marks the order REFUNDED.
   */
  async refund(
    adminId: string,
    input: BillingRefundInput,
    now = new Date(),
  ): Promise<BillingAccount> {
    const email = await this.prisma.$transaction(async (tx) => {
      const [order] = await tx.$queryRaw<
        {
          userId: string;
          status: string;
          amountRial: number;
          months: number;
        }[]
      >`SELECT "userId", status::text AS status, "amountRial", months FROM billing_orders
        WHERE id = ${input.orderId}::uuid FOR UPDATE`;
      if (!order) throw new NotFoundException('سفارش پیدا نشد.');
      if (order.status !== 'PAID')
        throw new UnprocessableEntityException(
          'فقط سفارش پرداخت‌شده بازپرداخت می‌شود.',
        );
      if (input.amountRial > order.amountRial)
        throw new UnprocessableEntityException(
          'مبلغ بازپرداخت از مبلغ پرداخت‌شده بیشتر است.',
        );
      if (
        await tx.billingRefund.findUnique({ where: { orderId: input.orderId } })
      )
        throw new ConflictException('این سفارش قبلاً بازپرداخت شده است.');
      await tx.$executeRaw`SELECT 1 FROM "users" WHERE "id" = ${order.userId}::uuid FOR UPDATE`;
      const reason = input.reason.trim();
      await tx.billingRefund.create({
        data: {
          orderId: input.orderId,
          adminId,
          amountRial: input.amountRial,
          reason,
          reference: input.reference?.trim() || null,
        },
      });
      if (input.amountRial === order.amountRial)
        await tx.billingOrder.update({
          where: { id: input.orderId },
          data: { status: 'REFUNDED' },
        });
      if (input.access === 'remove') {
        const current = await tx.billingSubscription.findUnique({
          where: { userId: order.userId },
        });
        if (current && current.paidUntil > now) {
          const back = addMonths(current.paidUntil, -order.months);
          const newUntil = back > now ? back : now;
          await tx.billingSubscription.update({
            where: { userId: order.userId },
            data: { paidUntil: newUntil },
          });
          await tx.billingAdjustment.create({
            data: {
              userId: order.userId,
              adminId,
              action: 'REFUND',
              reason,
              previousUntil: current.paidUntil,
              newUntil,
            },
          });
        }
      }
      const user = await tx.user.findUniqueOrThrow({
        where: { id: order.userId },
        select: { email: true },
      });
      return user.email;
    });
    return this.account(email, now);
  }

  /** Creates an owned order with the plan's current price, then asks Zibal for a payment page. */
  /** Refused while paid access has more than three days left (directive 118), so nobody pays twice by mistake. */
  async checkout(
    userId: string,
    code: string,
    now = new Date(),
  ): Promise<{ paymentUrl: string }> {
    const plan = await this.buyablePlan(userId, code, now);
    const order = await this.prisma.billingOrder.create({
      data: {
        userId,
        planId: plan.id,
        months: plan.months,
        amountRial: plan.priceRial,
      },
    });
    try {
      const { trackId, paymentUrl } = await this.gateway.request(
        order.id,
        order.amountRial,
      );
      await this.prisma.billingOrder.update({
        where: { id: order.id },
        data: { trackId },
      });
      return { paymentUrl };
    } catch (error) {
      await this.prisma.billingOrder.update({
        where: { id: order.id },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }

  /** An active plan the account may buy now: refused while paid access has more than three days left. */
  private async buyablePlan(userId: string, code: string, now: Date) {
    const plan = await this.prisma.billingPlan.findUnique({ where: { code } });
    if (!plan?.active) throw new NotFoundException('Plan is not available');
    const subscription = await this.prisma.billingSubscription.findUnique({
      where: { userId },
      select: { paidUntil: true },
    });
    if (!canBuyPlan(subscription?.paidUntil ?? null, now))
      throw new ConflictException({
        code: 'BILLING_STILL_ACTIVE',
        message:
          'اشتراکت هنوز فعال است. تمدید از سه روز مانده به پایان آن ممکن می‌شود.',
      });
    return plan;
  }

  /**
   * Store builds call this before opening the store's purchase sheet, so directive 118 holds there too (the
   * store charges before our server hears of it). The payload ties the purchase to this account.
   */
  async storeIntent(
    userId: string,
    input: BillingStoreIntentInput,
    now = new Date(),
  ): Promise<BillingStoreIntent> {
    const plan = await this.buyablePlan(userId, input.plan, now);
    return { sku: billingStoreSku(plan.code), payload: userId };
  }

  /**
   * Activates a store purchase once. The token is checked with the store's developer API for this SKU and must
   * carry this account's payload; the order is created with the plan's price and months and then goes through
   * the same locked activation as a Zibal payment. A replay by the same account is answered `paid` without a
   * second month; another account's replay is refused. A store outage writes nothing. The renewal window is
   * not checked here: the store has already charged, so a late purchase extends from the current end.
   */
  async storeVerify(
    userId: string,
    input: BillingStoreVerifyInput,
  ): Promise<BillingReturnStatus> {
    const provider = STORE_PROVIDERS[input.store];
    const plan = await this.prisma.billingPlan.findUnique({
      where: { code: billingPlanCodeFromSku(input.sku) },
    });
    if (!plan || billingStoreSku(plan.code) !== input.sku)
      throw invalidPurchase();
    const key = {
      provider_purchaseToken: {
        provider,
        purchaseToken: input.purchaseToken,
      },
    };
    const used = () =>
      this.prisma.billingOrder.findUnique({
        where: key,
        select: { id: true, userId: true, status: true, planId: true },
      });
    let order = await used();
    if (order) {
      if (order.userId !== userId || order.planId !== plan.id)
        throw new ConflictException({
          code: 'BILLING_PURCHASE_USED',
          message: 'This purchase was already used',
        });
      if (order.status === 'PAID') return 'paid';
      if (order.status !== 'PENDING') throw invalidPurchase();
    }
    if (!this.store)
      throw new ServiceUnavailableException('Store billing is unavailable');
    const purchase = await this.store.verify(
      input.store,
      input.sku,
      input.purchaseToken,
    );
    if (purchase.kind !== 'purchased' || purchase.payload !== userId)
      throw invalidPurchase();
    if (!order) {
      try {
        order = await this.prisma.billingOrder.create({
          data: {
            userId,
            planId: plan.id,
            months: plan.months,
            amountRial: plan.priceRial,
            provider,
            purchaseToken: input.purchaseToken,
          },
          select: { id: true, userId: true, status: true, planId: true },
        });
      } catch (error) {
        // The same purchase verified concurrently: whichever request created the order activates it once.
        if ((error as { code?: unknown }).code !== 'P2002') throw error;
        order = await used();
        if (!order || order.userId !== userId) throw invalidPurchase();
      }
    }
    await this.activate(order.id, null);
    return 'paid';
  }

  /**
   * Gateway callback. Never trusts the query's success flag: the order is found by its trackId and verified
   * with Zibal for its own amount. A gateway outage leaves it pending so a later callback can still settle it.
   */
  async settle(trackId: string): Promise<BillingReturnStatus> {
    if (!/^\d{1,20}$/.test(trackId)) return 'failed';
    const order = await this.prisma.billingOrder.findUnique({
      where: { trackId },
    });
    if (order?.status === 'PAID') return 'paid';
    // Failed or refunded orders are closed: never verified or activated again.
    if (order?.status !== 'PENDING') return 'failed';
    let refNumber: string | null;
    try {
      ({ refNumber } = await this.gateway.verify(
        trackId,
        order.amountRial,
        order.id,
      ));
    } catch (error) {
      if (error instanceof ServiceUnavailableException) return 'pending';
      await this.prisma.billingOrder.updateMany({
        where: { id: order.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      return 'failed';
    }
    await this.activate(order.id, refNumber);
    return 'paid';
  }

  /** The owner retries a pending order (e.g. the gateway was down when they came back). */
  async recheck(
    userId: string,
    orderId: string,
    now = new Date(),
  ): Promise<BillingReturnStatus> {
    const order = await this.prisma.billingOrder.findFirst({
      where: { id: orderId, userId },
      select: { trackId: true, status: true, createdAt: true, provider: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    // Store orders are settled by storeVerify, which the app repeats until the purchase is consumed.
    if (order.provider !== 'ZIBAL')
      return order.status === 'PAID'
        ? 'paid'
        : order.status === 'PENDING'
          ? 'pending'
          : 'failed';
    if (order.trackId) return this.settle(order.trackId);
    if (order.status !== 'PENDING') return 'failed';
    // Never reached the gateway. A young one may still be inside checkout, so only an old one is closed.
    if (now.getTime() - order.createdAt.getTime() < ABANDONED_MS)
      return 'pending';
    await this.prisma.billingOrder.updateMany({
      where: { id: orderId, status: 'PENDING', trackId: null },
      data: { status: 'FAILED' },
    });
    return 'failed';
  }

  /**
   * Settles orders the browser never brought back (closed tab, failed redirect): every pending order older
   * than RECONCILE_AFTER_MS is verified with Zibal, oldest first, a bounded batch per sweep.
   */
  async reconcile(now = new Date()): Promise<number> {
    const stale = await this.prisma.billingOrder.findMany({
      where: {
        status: 'PENDING',
        provider: 'ZIBAL',
        createdAt: {
          lt: new Date(now.getTime() - RECONCILE_AFTER_MS),
          // Older ones are left for an admin, so they never starve newer orders out of the batch.
          gt: new Date(now.getTime() - RECONCILE_WITHIN_MS),
        },
      },
      orderBy: { createdAt: 'asc' },
      take: RECONCILE_BATCH,
      select: { id: true, userId: true },
    });
    for (const order of stale) await this.recheck(order.userId, order.id, now);
    return stale.length;
  }

  /** Marks the order paid and extends the subscription in one transaction; a repeat is a no-op. */
  private async activate(orderId: string, refNumber: string | null) {
    const activated = await this.prisma.$transaction(async (tx) => {
      const paidAt = new Date();
      const claimed = await tx.billingOrder.updateMany({
        where: { id: orderId, status: 'PENDING' },
        data: { status: 'PAID', paidAt, refNumber },
      });
      if (claimed.count !== 1) return null;
      const { userId, months } = await tx.billingOrder.findUniqueOrThrow({
        where: { id: orderId },
        select: { userId: true, months: true },
      });
      // Serialize activations of one account so two orders both extend the subscription.
      await tx.$executeRaw`SELECT 1 FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      const current = await tx.billingSubscription.findUnique({
        where: { userId },
      });
      const start =
        current && current.paidUntil > paidAt ? current.paidUntil : paidAt;
      const paidUntil = addMonths(start, months);
      await tx.billingSubscription.upsert({
        where: { userId },
        create: { userId, paidUntil },
        update: { paidUntil },
      });
      return { userId, paidUntil };
    });
    // After the commit, and only for the request that activated: a failed SMS never undoes a payment.
    if (activated && this.sms?.enabled) {
      const user = await this.prisma.user.findUnique({
        where: { id: activated.userId },
        select: { phone: true },
      });
      this.sms.notify('SUBSCRIPTION_ACTIVATED', user?.phone, {
        plan: await this.planTitle(activated.userId),
        expiry_date: smsDate(activated.paidUntil),
      });
    }
  }
}
