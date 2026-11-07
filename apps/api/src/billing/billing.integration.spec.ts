import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  NotFoundException,
  UnprocessableEntityException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@all-in-one/api/db';
import { IS_PUBLIC, ROLES } from '@all-in-one/api/auth';
import {
  billingAdjustmentSchema,
  billingCheckoutSchema,
  billingPlanInputSchema,
} from '@all-in-one/shared/schemas';
import { BillingController, PaymentsController } from './billing.controller';
import { addMonths, BillingService } from './billing.service';
import type { ZibalGateway } from './zibal.gateway';

describe('Billing rules', () => {
  it('adds calendar months and clamps to the month end', () => {
    expect(addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString()).toBe(
      '2026-02-28T10:00:00.000Z',
    );
    expect(addMonths(new Date('2026-11-06T00:00:00Z'), 12).toISOString()).toBe(
      '2027-11-06T00:00:00.000Z',
    );
  });

  it('keeps checkout and account routes private and plan edits admin-only', () => {
    const reflector = new Reflector();
    const billing = BillingController.prototype;
    for (const handler of [
      billing.checkout,
      billing.subscription,
      billing.orders,
      billing.recheck,
    ])
      expect(reflector.get(IS_PUBLIC, handler)).not.toBe(true);
    for (const handler of [
      billing.adminPlans,
      billing.savePlan,
      billing.adminOrders,
      billing.account,
      billing.adjust,
    ])
      expect(reflector.get(ROLES, handler)).toEqual(['ADMIN']);
    expect(reflector.get(IS_PUBLIC, billing.plans)).toBe(true);
    expect(
      reflector.get(IS_PUBLIC, PaymentsController.prototype.callback),
    ).toBe(true);
  });

  it('sends the browser back to the app billing page with only the settled status', async () => {
    const settle = vi.fn(async () => 'paid' as const);
    const controller = new PaymentsController(
      { settle } as unknown as BillingService,
      { appUrl: 'https://poshtetgarm.ir/app/' } as never,
    );
    expect(await controller.callback('123')).toEqual({
      url: 'https://poshtetgarm.ir/app/billing?payment=paid',
      statusCode: 303,
    });
    await controller.callback(['1', '2']);
    expect(settle).toHaveBeenLastCalledWith('');
  });

  it('requires a reason and whole days for a manual extension', () => {
    const base = { email: 'a@example.invalid', reason: 'support' };
    expect(
      billingAdjustmentSchema.safeParse({ ...base, action: 'extend', days: 30 })
        .success,
    ).toBe(true);
    expect(
      billingAdjustmentSchema.safeParse({ ...base, action: 'end' }).success,
    ).toBe(true);
    for (const input of [
      { ...base, action: 'extend' },
      { ...base, action: 'extend', days: 0 },
      { ...base, action: 'extend', days: 1.5 },
      { ...base, action: 'end', reason: 'x' },
      { ...base, action: 'end', days: 3 },
      { ...base, action: 'pause' },
    ])
      expect(billingAdjustmentSchema.safeParse(input).success).toBe(false);
  });

  it('accepts only a plan code at checkout and whole-Toman Rial prices', () => {
    expect(billingCheckoutSchema.safeParse({ plan: 'monthly' }).success).toBe(
      true,
    );
    for (const input of [
      { plan: 'monthly', amountRial: 10 },
      { plan: 'Monthly' },
      { plan: '../x' },
    ])
      expect(billingCheckoutSchema.safeParse(input).success).toBe(false);
    const plan = {
      code: 'monthly',
      titleFa: 'ماهانه',
      titleEn: 'Monthly',
      months: 1,
      priceRial: 990_000,
      active: true,
    };
    expect(billingPlanInputSchema.safeParse(plan).success).toBe(true);
    for (const priceRial of [990_005, 0, 1.5])
      expect(
        billingPlanInputSchema.safeParse({ ...plan, priceRial }).success,
      ).toBe(false);
  });
});

describe.skipIf(process.env['GROWTH_DB_INTEGRATION'] !== '1')(
  'Billing PostgreSQL lifecycle',
  () => {
    const email = `billing-${randomUUID()}@example.invalid`;
    const code = `t-${randomUUID().slice(0, 8)}`;
    let prisma: PrismaService;
    let userId: string;
    let track = 9_000_000_000 + Math.floor(Math.random() * 1_000_000);
    const gateway = {
      request: vi.fn(async () => {
        track += 1;
        return {
          trackId: String(track),
          paymentUrl: `https://gateway.zibal.ir/start/${track}`,
        };
      }),
      verify: vi.fn(async () => ({
        kind: 'verified' as const,
        refNumber: 'ref-1',
      })),
    };
    const service = () =>
      new BillingService(prisma, gateway as unknown as ZibalGateway);
    const trackOf = (url: string) => url.split('/').pop() as string;

    beforeAll(async () => {
      const url = process.env['DATABASE_URL'];
      if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
        throw new Error('A local database is required');
      prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
      userId = (
        await prisma.user.create({
          data: { email, passwordHash: 'synthetic-integration-fixture' },
        })
      ).id;
      await service().savePlan({
        code,
        titleFa: 'آزمایشی',
        titleEn: 'Test',
        months: 1,
        priceRial: 990_000,
        active: true,
      });
    });
    afterAll(async () => {
      if (prisma) {
        await prisma.billingAdjustment.deleteMany({ where: { userId } });
        await prisma.billingOrder.deleteMany({ where: { userId } });
        await prisma.billingPlan.deleteMany({ where: { code } });
        await prisma.user.deleteMany({ where: { email } });
        await prisma.$disconnect();
      }
    });
    beforeEach(() => {
      gateway.request.mockClear();
      gateway.verify.mockClear();
    });

    it('starts a seven-day trial at email confirmation and gives active payment priority', async () => {
      const verified = new Date('2026-11-07T12:00:00.000Z');
      const customer = await prisma.user.create({
        data: {
          email: `trial-${randomUUID()}@example.test`,
          passwordHash: 'fixture',
        },
      });
      try {
        expect((await service().access(customer.id, verified)).tier).toBe(
          'free',
        );
        await prisma.user.update({
          where: { id: customer.id },
          data: { emailVerifiedAt: verified },
        });
        const end = new Date('2026-11-14T12:00:00.000Z');
        expect(await service().access(customer.id, verified)).toEqual({
          tier: 'trial',
          trialUntil: end.toISOString(),
          paidUntil: null,
        });
        expect((await service().access(customer.id, end)).tier).toBe('free');
        await prisma.billingSubscription.create({
          data: {
            userId: customer.id,
            paidUntil: new Date('2026-12-01T00:00:00.000Z'),
          },
        });
        expect((await service().access(customer.id, verified)).tier).toBe(
          'paid',
        );
      } finally {
        await prisma.billingSubscription.deleteMany({
          where: { userId: customer.id },
        });
        await prisma.user.delete({ where: { id: customer.id } });
      }
    });

    it('activates once for concurrent callbacks and extends from the current end', async () => {
      const first = trackOf(
        (await service().checkout(userId, code)).paymentUrl,
      );
      expect(gateway.request).toHaveBeenCalledWith(expect.any(String), 990_000);
      expect((await service().subscription(userId)).active).toBe(false);
      const results = await Promise.all([
        service().settle(first),
        service().settle(first),
        service().settle(first),
      ]);
      expect(results).toEqual(['paid', 'paid', 'paid']);
      const once = await service().subscription(userId);
      expect(once.active).toBe(true);
      const until = new Date(once.paidUntil as string);
      // Replayed callback: no second verify, no second month.
      expect(await service().settle(first)).toBe('paid');
      expect((await service().subscription(userId)).paidUntil).toBe(
        once.paidUntil,
      );
      const second = trackOf(
        (await service().checkout(userId, code)).paymentUrl,
      );
      expect(await service().settle(second)).toBe('paid');
      expect((await service().subscription(userId)).paidUntil).toBe(
        addMonths(until, 1).toISOString(),
      );
      const orders = await service().orders(userId);
      expect(orders.map((order) => order.status)).toEqual(['PAID', 'PAID']);
      expect(orders[0]).toMatchObject({ plan: code, amountRial: 990_000 });
    });

    it('keeps an order pending on outage and fails it on rejection or mismatch', async () => {
      const before = (await service().subscription(userId)).paidUntil;
      const track = trackOf(
        (await service().checkout(userId, code)).paymentUrl,
      );
      gateway.verify.mockRejectedValueOnce(
        new ServiceUnavailableException('down'),
      );
      expect(await service().settle(track)).toBe('pending');
      const pending = await prisma.billingOrder.findUniqueOrThrow({
        where: { trackId: track },
      });
      await expect(
        service().recheck(randomUUID(), pending.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      gateway.verify.mockRejectedValueOnce(
        new ServiceUnavailableException('down'),
      );
      expect(await service().recheck(userId, pending.id)).toBe('pending');
      expect(
        (
          await prisma.billingOrder.findUniqueOrThrow({
            where: { trackId: track },
          })
        ).status,
      ).toBe('PENDING');
      gateway.verify.mockRejectedValueOnce(new BadGatewayException('no'));
      expect(await service().settle(track)).toBe('failed');
      gateway.verify.mockClear();
      expect(await service().settle(track)).toBe('failed');
      expect(gateway.verify).not.toHaveBeenCalled();
      expect(await service().settle('123abc')).toBe('failed');
      expect(await service().settle('1')).toBe('failed');
      expect((await service().subscription(userId)).paidUntil).toBe(before);
    });

    it('closes an order that never reached the gateway only once it is old', async () => {
      const plan = await prisma.billingPlan.findUniqueOrThrow({
        where: { code },
      });
      const order = await prisma.billingOrder.create({
        data: { userId, planId: plan.id, months: 1, amountRial: 990_000 },
      });
      expect(await service().recheck(userId, order.id)).toBe('pending');
      const later = new Date(order.createdAt.getTime() + 11 * 60_000);
      expect(await service().recheck(userId, order.id, later)).toBe('failed');
      expect(
        (
          await prisma.billingOrder.findUniqueOrThrow({
            where: { id: order.id },
          })
        ).status,
      ).toBe('FAILED');
      expect(gateway.verify).not.toHaveBeenCalled();
    });

    it('reconciles only pending orders older than half an hour', async () => {
      const fresh = trackOf(
        (await service().checkout(userId, code)).paymentUrl,
      );
      gateway.verify.mockClear();
      const order = await prisma.billingOrder.findUniqueOrThrow({
        where: { trackId: fresh },
      });
      // Earlier tests left no pending order with a trackId, so only this one can be swept.
      expect(
        await service().reconcile(new Date(order.createdAt.getTime() + 60_000)),
      ).toBe(0);
      expect(gateway.verify).not.toHaveBeenCalled();
      const later = new Date(order.createdAt.getTime() + 31 * 60_000);
      gateway.verify.mockRejectedValueOnce(new BadGatewayException('unpaid'));
      expect(await service().reconcile(later)).toBeGreaterThan(0);
      expect(gateway.verify).toHaveBeenCalledWith(fresh, 990_000, order.id);
      expect(
        (
          await prisma.billingOrder.findUniqueOrThrow({
            where: { id: order.id },
          })
        ).status,
      ).toBe('FAILED');
    });

    it('lists orders for support with emails and a 30-day overview', async () => {
      const page = await service().adminOrders({ status: 'PAID' });
      const mine = page.orders.filter((order) => order.email === email);
      expect(mine.length).toBe(2);
      expect(mine.every((order) => order.status === 'PAID')).toBe(true);
      expect(mine[0].trackId).toMatch(/^\d+$/);
      expect(page.overview.activeSubscribers).toBeGreaterThanOrEqual(1);
      expect(page.overview.paidRial).toBeGreaterThanOrEqual(2 * 990_000);
      expect(page.total).toBeGreaterThanOrEqual(2);
    });

    it('extends or ends access by hand and records who, why and what changed', async () => {
      const now = new Date();
      const before = new Date(
        (await service().subscription(userId)).paidUntil as string,
      );
      const extended = await service().adjust(
        userId,
        {
          email,
          action: 'extend',
          days: 30,
          reason: 'support: gateway outage',
        },
        now,
      );
      expect(extended.subscription.paidUntil).toBe(
        new Date(before.getTime() + 30 * 86_400_000).toISOString(),
      );
      const ended = await service().adjust(
        userId,
        { email, action: 'end', reason: 'refunded' },
        now,
      );
      expect(ended.subscription).toEqual({
        paidUntil: now.toISOString(),
        active: false,
      });
      await expect(
        service().adjust(
          userId,
          { email, action: 'end', reason: 'again' },
          now,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(ended.adjustments.map((row) => row.action)).toEqual([
        'END',
        'EXTEND',
      ]);
      expect(ended.adjustments[0]).toMatchObject({
        reason: 'refunded',
        adminEmail: email,
        previousUntil: extended.subscription.paidUntil,
        newUntil: now.toISOString(),
        days: null,
      });
      expect(ended.adjustments[1]).toMatchObject({
        days: 30,
        previousUntil: before.toISOString(),
      });
      await expect(
        service().account('nobody@example.invalid'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('records a failed request and refuses inactive or unknown plans', async () => {
      gateway.request.mockRejectedValueOnce(
        new ServiceUnavailableException('down'),
      );
      await expect(service().checkout(userId, code)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      const [latest] = await service().orders(userId);
      expect(latest.status).toBe('FAILED');
      await expect(
        service().checkout(userId, 'no-such-plan'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await prisma.billingPlan.update({
        where: { code },
        data: { active: false },
      });
      expect((await service().plans()).some((plan) => plan.code === code)).toBe(
        false,
      );
      await expect(service().checkout(userId, code)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  },
);
