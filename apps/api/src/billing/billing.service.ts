import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import type {
  BillingAccessState,
  BillingRewardInput,
  BillingAccount,
  BillingAdjustmentInput,
  BillingAdminOrderPage,
  BillingAdminOrdersQuery,
  BillingOrderSummary,
  BillingPlan,
  BillingPlanInput,
  BillingReturnStatus,
  BillingSubscriptionState,
} from '@all-in-one/shared/schemas';
import { ZibalGateway } from './zibal.gateway';

const WEEK_MS = 7 * 86_400_000;
const trialEnd = (verifiedAt: Date) => new Date(verifiedAt.getTime() + WEEK_MS);

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
  ) {}

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

  /** Trial time starts after email confirmation, when the account can sign in. */
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
    if (paidUntil && paidUntil > now) tier = 'paid';
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
      },
    });
    return rows.map(({ plan, createdAt, paidAt, ...row }) => ({
      ...row,
      plan: plan.code,
      createdAt: createdAt.toISOString(),
      paidAt: paidAt?.toISOString() ?? null,
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
    const [rows, total, activeSubscribers, paid, failedOrders, pendingOrders] =
      await Promise.all([
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
            createdAt: true,
            paidAt: true,
            plan: { select: { code: true } },
            user: { select: { email: true } },
          },
        }),
        this.prisma.billingOrder.count({ where }),
        this.prisma.billingSubscription.count({
          where: { paidUntil: { gt: now } },
        }),
        this.prisma.billingOrder.aggregate({
          where: { status: 'PAID', paidAt: { gte: since } },
          _count: true,
          _sum: { amountRial: true },
        }),
        this.prisma.billingOrder.count({
          where: { status: 'FAILED', ...recent },
        }),
        this.prisma.billingOrder.count({ where: { status: 'PENDING' } }),
      ]);
    return {
      orders: rows.map(({ plan, user, createdAt, paidAt, ...row }) => ({
        ...row,
        plan: plan.code,
        email: user.email,
        createdAt: createdAt.toISOString(),
        paidAt: paidAt?.toISOString() ?? null,
      })),
      total,
      overview: {
        activeSubscribers,
        paidOrders: paid._count,
        paidRial: paid._sum.amountRial ?? 0,
        failedOrders,
        pendingOrders,
      },
    };
  }

  /** Support view of one account: paid access, latest orders and every manual change. */
  async account(email: string, now = new Date()): Promise<BillingAccount> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('Account not found');
    const [subscription, orders, adjustments, rewards] = await Promise.all([
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

  /** Creates an owned order with the plan's current price, then asks Zibal for a payment page. */
  async checkout(
    userId: string,
    code: string,
  ): Promise<{ paymentUrl: string }> {
    const plan = await this.prisma.billingPlan.findUnique({ where: { code } });
    if (!plan?.active) throw new NotFoundException('Plan is not available');
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

  /**
   * Gateway callback. Never trusts the query's success flag: the order is found by its trackId and verified
   * with Zibal for its own amount. A gateway outage leaves it pending so a later callback can still settle it.
   */
  async settle(trackId: string): Promise<BillingReturnStatus> {
    if (!/^\d{1,20}$/.test(trackId)) return 'failed';
    const order = await this.prisma.billingOrder.findUnique({
      where: { trackId },
    });
    if (!order || order.status === 'FAILED') return 'failed';
    if (order.status === 'PAID') return 'paid';
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
      select: { trackId: true, status: true, createdAt: true },
    });
    if (!order) throw new NotFoundException('Order not found');
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
    await this.prisma.$transaction(async (tx) => {
      const paidAt = new Date();
      const claimed = await tx.billingOrder.updateMany({
        where: { id: orderId, status: 'PENDING' },
        data: { status: 'PAID', paidAt, refNumber },
      });
      if (claimed.count !== 1) return;
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
    });
  }
}
