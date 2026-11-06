import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import type {
  BillingOrderSummary,
  BillingPlan,
  BillingPlanInput,
  BillingReturnStatus,
  BillingSubscriptionState,
} from '@all-in-one/shared/schemas';
import { ZibalGateway } from './zibal.gateway';

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
