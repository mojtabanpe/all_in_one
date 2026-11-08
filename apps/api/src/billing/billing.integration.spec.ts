import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  ConflictException,
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
  billingRefundSchema,
  billingStoreSku,
  billingStoreVerifySchema,
} from '@all-in-one/shared/schemas';
import { BillingController, PaymentsController } from './billing.controller';
import { addMonths, BillingService, TRIAL_LAUNCH } from './billing.service';
import type { StoreGateway } from './store.gateway';
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
      billing.storeIntent,
      billing.storeVerify,
    ])
      expect(reflector.get(IS_PUBLIC, handler)).not.toBe(true);
    for (const handler of [
      billing.adminPlans,
      billing.savePlan,
      billing.adminOrders,
      billing.account,
      billing.adjust,
      billing.refund,
      billing.metrics,
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

  it('accepts a refund only for an order, in whole Toman, with a reason and a safe reference', () => {
    const base = {
      orderId: randomUUID(),
      amountRial: 990_000,
      access: 'remove',
      reason: 'customer asked',
    };
    expect(billingRefundSchema.safeParse(base).success).toBe(true);
    expect(
      billingRefundSchema.safeParse({ ...base, reference: 'ZB-1234/5' })
        .success,
    ).toBe(true);
    for (const input of [
      { ...base, amountRial: 0 },
      { ...base, amountRial: 990_005 },
      { ...base, access: 'end' },
      { ...base, reason: 'x' },
      { ...base, orderId: 'order-1' },
      { ...base, reference: '<script>' },
      { ...base, email: 'a@example.invalid' },
    ])
      expect(billingRefundSchema.safeParse(input).success).toBe(false);
  });

  it('maps plan codes to store SKUs both ways and accepts only a store, SKU and token', () => {
    expect(billingStoreSku('three-months')).toBe('three_months');
    const input = {
      store: 'bazaar',
      sku: 'three_months',
      purchaseToken: 'SDu7kQNDJ_C2x.9',
    };
    expect(billingStoreVerifySchema.safeParse(input).success).toBe(true);
    for (const bad of [
      { ...input, store: 'zibal' },
      { ...input, sku: 'Monthly' },
      { ...input, sku: 'three-months' },
      { ...input, purchaseToken: 'short' },
      { ...input, purchaseToken: 'a b c d e f g h' },
      { ...input, purchaseToken: 'x'.repeat(513) },
      { ...input, userId: randomUUID() },
    ])
      expect(billingStoreVerifySchema.safeParse(bad).success).toBe(false);
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
    /**
     * Checkout as if it were the last day of the current paid period: the renewal window (directive 118) is not what
     * these lifecycle tests are about, and the moment only feeds that check.
     */
    const buy = async (billing = service(), id = userId, plan = code) => {
      const sub = await prisma.billingSubscription.findUnique({
        where: { userId: id },
      });
      const at =
        sub && sub.paidUntil > new Date()
          ? new Date(sub.paidUntil.getTime() - 86_400_000)
          : new Date();
      return billing.checkout(id, plan, at);
    };

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
        await prisma.billingRefund.deleteMany({ where: { order: { userId } } });
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
          earnedUntil: null,
          trialUntil: end.toISOString(),
          paidUntil: null,
          aiUntil: end.toISOString(),
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

    it('grants each verified reward once, stacks weeks and does not activate paid access', async () => {
      const now = new Date('2026-11-07T12:00:00.000Z');
      const customer = await prisma.user.create({
        data: {
          email: `reward-${randomUUID()}@example.test`,
          passwordHash: 'fixture',
        },
      });
      const admin = await prisma.user.create({
        data: {
          email: `operator-${randomUUID()}@example.test`,
          passwordHash: 'fixture',
          role: 'ADMIN',
        },
      });
      try {
        const telegram = {
          email: customer.email,
          campaign: 'TELEGRAM_JOIN' as const,
          reason: 'Membership verified',
        };
        await expect(
          service().grantReward(admin.id, telegram, now),
        ).rejects.toMatchObject({ status: 422 });
        await prisma.user.update({
          where: { id: customer.id },
          data: { emailVerifiedAt: now },
        });

        const claims = await Promise.allSettled([
          service().grantReward(admin.id, telegram, now),
          service().grantReward(admin.id, telegram, now),
        ]);
        expect(
          claims.filter((claim) => claim.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(
          claims.find((claim) => claim.status === 'rejected'),
        ).toMatchObject({ reason: { status: 409 } });
        const account = await service().grantReward(
          admin.id,
          {
            ...telegram,
            campaign: 'INSTAGRAM_FOLLOW',
          },
          now,
        );
        expect(account.rewards).toEqual([
          {
            campaign: 'TELEGRAM_JOIN',
            startsAt: '2026-11-14T12:00:00.000Z',
            expiresAt: '2026-11-21T12:00:00.000Z',
            reason: telegram.reason,
            adminEmail: admin.email,
          },
          {
            campaign: 'INSTAGRAM_FOLLOW',
            startsAt: '2026-11-21T12:00:00.000Z',
            expiresAt: '2026-11-28T12:00:00.000Z',
            reason: telegram.reason,
            adminEmail: admin.email,
          },
        ]);
        expect((await service().access(customer.id, now)).tier).toBe('trial');
        expect(
          (
            await service().access(
              customer.id,
              new Date('2026-11-14T12:00:00.000Z'),
            )
          ).tier,
        ).toBe('earned');
        expect(
          (
            await service().access(
              customer.id,
              new Date('2026-11-21T12:00:00.000Z'),
            )
          ).tier,
        ).toBe('earned');
        expect(
          (
            await service().access(
              customer.id,
              new Date('2026-11-28T12:00:00.000Z'),
            )
          ).tier,
        ).toBe('free');
        expect(await service().isPaid(customer.id, now)).toBe(false);
      } finally {
        await prisma.user.delete({ where: { id: customer.id } });
        await prisma.user.delete({ where: { id: admin.id } });
      }
    });

    it('gives accounts confirmed before launch a week from launch and admins AI without a plan', async () => {
      const now = new Date('2026-11-08T12:00:00.000Z');
      const customer = await prisma.user.create({
        data: {
          email: `early-${randomUUID()}@example.test`,
          passwordHash: 'fixture',
          emailVerifiedAt: new Date('2026-09-01T12:00:00.000Z'),
        },
      });
      const admin = await prisma.user.create({
        data: {
          email: `staff-${randomUUID()}@example.test`,
          passwordHash: 'fixture',
          role: 'ADMIN',
        },
      });
      try {
        const end = new Date(TRIAL_LAUNCH.getTime() + 7 * 86_400_000);
        expect(await service().access(customer.id, now)).toMatchObject({
          tier: 'trial',
          trialUntil: end.toISOString(),
        });
        expect((await service().access(customer.id, end)).tier).toBe('free');
        expect((await service().access(admin.id, now)).tier).toBe('staff');
      } finally {
        await prisma.user.delete({ where: { id: customer.id } });
        await prisma.user.delete({ where: { id: admin.id } });
      }
    });

    it('hides disabled offers and accepts one request from any confirmed customer', async () => {
      const now = new Date('2026-11-07T12:00:00.000Z');
      const customer = await prisma.user.create({
        data: {
          email: `offer-${randomUUID()}@example.test`,
          passwordHash: 'fixture',
          emailVerifiedAt: new Date('2026-10-30T12:00:00.000Z'),
        },
      });
      const admin = await prisma.user.create({
        data: {
          email: `review-${randomUUID()}@example.test`,
          passwordHash: 'fixture',
          role: 'ADMIN',
        },
      });
      const offers = new BillingService(
        prisma,
        gateway as unknown as ZibalGateway,
        new ConfigService({ BILLING_TELEGRAM_OFFER_ENABLED: 'true' }),
      );
      const input = {
        campaign: 'TELEGRAM_JOIN' as const,
        handle: '@fixture_user',
      };
      // The automatic second-contact week (directive 121) is offered whatever the social switches say.
      const social = async (billing: BillingService) =>
        (await billing.rewardOffers(customer.id, now)).filter(
          (offer) => offer.campaign !== 'SECOND_CONTACT',
        );
      try {
        expect(await social(service())).toEqual([]);
        expect(await service().rewardOffers(customer.id, now)).toEqual([
          {
            campaign: 'SECOND_CONTACT',
            url: '',
            status: 'available',
            confirm: 'phone',
          },
        ]);
        await expect(
          offers.requestReward(admin.id, input, now),
        ).rejects.toMatchObject({ status: 403 });
        // Still inside the trial and without any activity: the offer is already open.
        expect((await offers.access(customer.id, now)).tier).toBe('trial');
        expect(await social(offers)).toEqual([
          {
            campaign: 'TELEGRAM_JOIN',
            url: 'https://t.me/poshtetgarm',
            status: 'available',
          },
        ]);
        await Promise.all([
          offers.requestReward(customer.id, input, now),
          offers.requestReward(customer.id, input, now),
        ]);
        expect(
          await prisma.billingRewardRequest.count({
            where: { userId: customer.id },
          }),
        ).toBe(1);
        expect(
          (await offers.pendingRewards()).find(
            (request) => request.email === customer.email,
          )?.handle,
        ).toBe('fixture_user');
        await offers.grantReward(
          admin.id,
          {
            email: customer.email,
            campaign: input.campaign,
            reason: 'Membership verified',
          },
          now,
        );
        expect(
          await prisma.billingRewardRequest.count({
            where: { userId: customer.id },
          }),
        ).toBe(0);
        expect((await social(offers))[0]?.status).toBe('earned');
      } finally {
        await prisma.user.delete({ where: { id: customer.id } });
        await prisma.user.delete({ where: { id: admin.id } });
      }
    });

    it('activates once for concurrent callbacks and extends from the current end', async () => {
      const first = trackOf((await buy()).paymentUrl);
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
      const second = trackOf((await buy()).paymentUrl);
      expect(await service().settle(second)).toBe('paid');
      expect((await service().subscription(userId)).paidUntil).toBe(
        addMonths(until, 1).toISOString(),
      );
      const orders = await service().orders(userId);
      expect(orders.map((order) => order.status)).toEqual(['PAID', 'PAID']);
      expect(orders[0]).toMatchObject({ plan: code, amountRial: 990_000 });
    });

    it('refuses a second purchase until the last three days of paid access', async () => {
      const { paidUntil } = await service().subscription(userId);
      const end = new Date(paidUntil as string).getTime();
      const before = await prisma.billingOrder.count({ where: { userId } });
      await expect(
        service().checkout(userId, code, new Date(end - 4 * 86_400_000)),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await prisma.billingOrder.count({ where: { userId } })).toBe(
        before,
      );
      const { paymentUrl } = await service().checkout(
        userId,
        code,
        new Date(end - 3 * 86_400_000),
      );
      // Later tests count this account's orders: drop the unpaid one.
      await prisma.billingOrder.delete({
        where: { trackId: trackOf(paymentUrl) },
      });
    });

    it('keeps an order pending on outage and fails it on rejection or mismatch', async () => {
      const before = (await service().subscription(userId)).paidUntil;
      const track = trackOf((await buy()).paymentUrl);
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
      const fresh = trackOf((await buy()).paymentUrl);
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

    it('counts gateway orders by creation and verified payments by settlement', async () => {
      const now = new Date();
      const recent = new Date(now.getTime() - 60_000);
      const old = new Date(now.getTime() - 31 * 86_400_000);
      const plan = await prisma.billingPlan.findUniqueOrThrow({
        where: { code },
      });
      const base = { userId, planId: plan.id, months: 1, amountRial: 990_000 };
      const before = (await service().adminOrders({}, now)).overview;
      const orders = await prisma.billingOrder.createManyAndReturn({
        data: [
          {
            ...base,
            createdAt: recent,
            status: 'FAILED',
            trackId: String(++track),
          },
          { ...base, createdAt: recent, status: 'FAILED' },
          {
            ...base,
            createdAt: old,
            status: 'PAID',
            paidAt: recent,
            trackId: String(++track),
          },
        ],
        select: { id: true },
      });
      try {
        const { overview } = await service().adminOrders(
          { status: 'PAID' },
          now,
        );
        expect(overview.gatewayOrders).toBe(before.gatewayOrders + 1);
        expect(overview.paidOrders).toBe(before.paidOrders + 1);
      } finally {
        await prisma.billingOrder.deleteMany({
          where: { id: { in: orders.map((order) => order.id) } },
        });
      }
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

    it('reports paying users, MRR, new and renewed payers and ended access', async () => {
      const now = new Date('2030-06-01T00:00:00.000Z');
      const at = (iso: string) => new Date(iso);
      const plan = await prisma.billingPlan.findUniqueOrThrow({
        where: { code },
      });
      const users = await Promise.all(
        ['a', 'b', 'c', 'd', 'admin'].map((name) =>
          prisma.user.create({
            data: {
              email: `metrics-${name}-${randomUUID()}@example.invalid`,
              passwordHash: 'synthetic-integration-fixture',
              role: name === 'admin' ? 'ADMIN' : 'CUSTOMER',
            },
          }),
        ),
      );
      const [a, b, c, d, admin] = users;
      const order = (
        userId: string,
        months: number,
        amountRial: number,
        paidAt: string,
      ) =>
        prisma.billingOrder.create({
          data: {
            userId,
            planId: plan.id,
            months,
            amountRial,
            status: 'PAID',
            paidAt: at(paidAt),
          },
        });
      try {
        // A: renewed inside the window; MRR follows the latest order.
        await order(a.id, 12, 9_900_000, '2030-01-01T00:00:00Z');
        await order(a.id, 1, 990_000, '2030-05-20T00:00:00Z');
        // B: new payer with a partial refund.
        const bOrder = await order(
          b.id,
          12,
          12_000_000,
          '2030-05-25T00:00:00Z',
        );
        await prisma.billingRefund.create({
          data: {
            orderId: bOrder.id,
            adminId: admin.id,
            amountRial: 1_200_000,
            reason: 'partial',
          },
        });
        // A failed order never counts.
        await prisma.billingOrder.create({
          data: {
            userId: b.id,
            planId: plan.id,
            months: 1,
            amountRial: 990_000,
            status: 'FAILED',
          },
        });
        await prisma.billingSubscription.createMany({
          data: [
            { userId: a.id, paidUntil: at('2031-01-20T00:00:00Z') },
            { userId: b.id, paidUntil: at('2031-05-25T00:00:00Z') },
            // C: paid access by hand only; D: ended inside the window.
            { userId: c.id, paidUntil: at('2030-07-01T00:00:00Z') },
            { userId: d.id, paidUntil: at('2030-05-15T00:00:00Z') },
          ],
        });
        expect(await service().metrics(now)).toEqual({
          paidUsers: 3,
          manualPaidUsers: 1,
          mrrRial: 990_000 + 900_000,
          newPaidUsers: 1,
          renewals: 1,
          endedPaidUsers: 1,
        });
      } finally {
        const ids = users.map((user) => user.id);
        await prisma.billingRefund.deleteMany({
          where: { adminId: admin.id },
        });
        await prisma.billingOrder.deleteMany({
          where: { userId: { in: ids } },
        });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
      }
    });

    describe('payment test matrix', () => {
      const reactivate = () =>
        prisma.billingPlan.update({
          where: { code },
          data: { active: true, priceRial: 990_000, months: 1 },
        });
      const orderOf = (trackId: string) =>
        prisma.billingOrder.findUniqueOrThrow({ where: { trackId } });
      beforeEach(reactivate);

      it('settles a payment whose callback hit an outage on the next reconciliation, once', async () => {
        const before = (await service().subscription(userId)).paidUntil;
        const track = trackOf((await buy()).paymentUrl);
        gateway.verify.mockRejectedValueOnce(
          new ServiceUnavailableException('timeout'),
        );
        expect(await service().settle(track)).toBe('pending');
        const order = await orderOf(track);
        const later = new Date(order.createdAt.getTime() + 31 * 60_000);
        expect(await service().reconcile(later)).toBeGreaterThan(0);
        expect((await orderOf(track)).status).toBe('PAID');
        const after = (await service().subscription(userId)).paidUntil;
        expect(after).not.toBe(before);
        gateway.verify.mockClear();
        await service().reconcile(later);
        expect(gateway.verify).not.toHaveBeenCalled();
        expect(await service().settle(track)).toBe('paid');
        expect((await service().subscription(userId)).paidUntil).toBe(after);
      });

      it('activates when Zibal reports the payment was already verified but access was never granted', async () => {
        const track = trackOf((await buy()).paymentUrl);
        const before = (await service().subscription(userId)).paidUntil;
        gateway.verify.mockResolvedValueOnce({
          kind: 'already_verified' as never,
          refNumber: null as never,
        });
        expect(await service().settle(track)).toBe('paid');
        const after = (await service().subscription(userId)).paidUntil;
        expect(after).toBe(
          addMonths(new Date(before as string), 1).toISOString(),
        );
      });

      it('fails a cancelled payment and never grants access for it', async () => {
        const before = (await service().subscription(userId)).paidUntil;
        const track = trackOf((await buy()).paymentUrl);
        gateway.verify.mockRejectedValueOnce(
          new BadGatewayException('cancelled'),
        );
        expect(await service().settle(track)).toBe('failed');
        expect((await orderOf(track)).status).toBe('FAILED');
        expect((await service().subscription(userId)).paidUntil).toBe(before);
        // A late success reply for the same order cannot revive it.
        expect(await service().settle(track)).toBe('failed');
        expect(gateway.verify).toHaveBeenCalledTimes(1);
      });

      it('verifies the amount and months the order was created with, even after a price change', async () => {
        const track = trackOf((await buy()).paymentUrl);
        await prisma.billingPlan.update({
          where: { code },
          data: { priceRial: 1_490_000, months: 3 },
        });
        const before = (await service().subscription(userId)).paidUntil;
        const order = await orderOf(track);
        expect(await service().settle(track)).toBe('paid');
        expect(gateway.verify).toHaveBeenCalledWith(track, 990_000, order.id);
        expect((await service().subscription(userId)).paidUntil).toBe(
          addMonths(new Date(before as string), 1).toISOString(),
        );
      });

      it('ignores callbacks for unknown orders without calling Zibal', async () => {
        expect(await service().settle('99999999999999999')).toBe('failed');
        expect(await service().settle('')).toBe('failed');
        expect(gateway.verify).not.toHaveBeenCalled();
      });

      it('drops to free after expiry and renews from the payment day, not the old end', async () => {
        const expired = new Date(Date.now() - 3 * 86_400_000);
        await prisma.billingSubscription.update({
          where: { userId },
          data: { paidUntil: expired },
        });
        expect(await service().isPaid(userId)).toBe(false);
        expect((await service().access(userId)).tier).toBe('free');
        const track = trackOf((await buy()).paymentUrl);
        const start = Date.now();
        expect(await service().settle(track)).toBe('paid');
        const until = new Date(
          (await service().subscription(userId)).paidUntil as string,
        );
        expect(until.getTime()).toBeGreaterThanOrEqual(
          addMonths(new Date(start), 1).getTime() - 1_000,
        );
        expect((await service().access(userId)).tier).toBe('paid');
        // An unpaid renewal attempt leaves access to end on time.
        const unpaid = trackOf((await buy()).paymentUrl);
        gateway.verify.mockRejectedValueOnce(new BadGatewayException('no'));
        expect(await service().settle(unpaid)).toBe('failed');
        expect(
          await service().isPaid(userId, new Date(until.getTime() + 1)),
        ).toBe(false);
      });

      it('texts an activation once and an expiry notice once per paid period', async () => {
        const sms = { enabled: true, notify: vi.fn() };
        const texting = new BillingService(
          prisma,
          gateway as unknown as ZibalGateway,
          undefined,
          sms as never,
        );
        const customer = await prisma.user.create({
          data: {
            email: `billing-sms-${randomUUID()}@example.invalid`,
            passwordHash: 'synthetic-integration-fixture',
            phone: `+989${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
            phoneVerifiedAt: new Date(),
          },
        });
        try {
          const track = trackOf((await buy(texting, customer.id)).paymentUrl);
          await Promise.all([texting.settle(track), texting.settle(track)]);
          const until = (await texting.subscription(customer.id))
            .paidUntil as string;
          expect(sms.notify).toHaveBeenCalledTimes(1);
          expect(sms.notify).toHaveBeenCalledWith(
            'SUBSCRIPTION_ACTIVATED',
            customer.phone,
            {
              plan: 'آزمایشی',
              expiry_date: expect.stringMatching(/^14\d\d\/\d\d\/\d\d$/),
            },
          );
          sms.notify.mockClear();
          const early = new Date(Date.parse(until) - 5 * 86_400_000);
          const near = new Date(Date.parse(until) - 2 * 86_400_000);
          await texting.notifyExpiring(early);
          expect(sms.notify).not.toHaveBeenCalled();
          await Promise.all([
            texting.notifyExpiring(near),
            texting.notifyExpiring(near),
          ]);
          const toCustomer = () =>
            sms.notify.mock.calls.filter((call) => call[1] === customer.phone);
          expect(toCustomer()).toHaveLength(1);
          expect(toCustomer()[0][0]).toBe('SUBSCRIPTION_EXPIRING');
          // A renewal opens a new period with its own notice.
          await prisma.billingSubscription.update({
            where: { userId: customer.id },
            data: { paidUntil: new Date(Date.parse(until) + 30 * 86_400_000) },
          });
          await texting.notifyExpiring(near);
          expect(toCustomer()).toHaveLength(1);
          await texting.notifyExpiring(
            new Date(Date.parse(until) + 28 * 86_400_000),
          );
          expect(toCustomer()).toHaveLength(2);
          // Switched off: no query, nothing sent.
          sms.enabled = false;
          expect(await texting.notifyExpiring(near)).toBe(0);
        } finally {
          await prisma.billingOrder.deleteMany({
            where: { userId: customer.id },
          });
          await prisma.user.delete({ where: { id: customer.id } });
        }
      });

      it('records refunds once, takes paid time back on request and closes fully refunded orders', async () => {
        const admin = await prisma.user.create({
          data: {
            email: `billing-admin-${randomUUID()}@example.invalid`,
            passwordHash: 'synthetic-integration-fixture',
            role: 'ADMIN',
          },
        });
        try {
          const partial = trackOf((await buy()).paymentUrl);
          expect(await service().settle(partial)).toBe('paid');
          const partialOrder = await orderOf(partial);
          const kept = (await service().subscription(userId)).paidUntil;
          const afterPartial = await service().refund(admin.id, {
            orderId: partialOrder.id,
            amountRial: 490_000,
            access: 'keep',
            reason: 'goodwill',
            reference: 'ZB-1',
          });
          expect(afterPartial.subscription.paidUntil).toBe(kept);
          expect(
            afterPartial.orders.find((o) => o.id === partialOrder.id),
          ).toMatchObject({ status: 'PAID', refundedRial: 490_000 });
          expect(afterPartial.refunds[0]).toMatchObject({
            orderId: partialOrder.id,
            amountRial: 490_000,
            reference: 'ZB-1',
            adminEmail: admin.email,
          });
          await expect(
            service().refund(admin.id, {
              orderId: partialOrder.id,
              amountRial: 10,
              access: 'keep',
              reason: 'again',
            }),
          ).rejects.toBeInstanceOf(ConflictException);

          const full = trackOf((await buy()).paymentUrl);
          expect(await service().settle(full)).toBe('paid');
          const fullOrder = await orderOf(full);
          const before = (await service().subscription(userId))
            .paidUntil as string;
          await expect(
            service().refund(admin.id, {
              orderId: fullOrder.id,
              amountRial: 990_010,
              access: 'remove',
              reason: 'too much',
            }),
          ).rejects.toBeInstanceOf(UnprocessableEntityException);
          // Concurrent submissions: exactly one refund is recorded.
          const results = await Promise.allSettled(
            [1, 2].map(() =>
              service().refund(admin.id, {
                orderId: fullOrder.id,
                amountRial: 990_000,
                access: 'remove',
                reason: 'cancelled within a day',
              }),
            ),
          );
          expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(
            1,
          );
          const account = await service().account(email);
          expect(account.subscription.paidUntil).toBe(
            addMonths(new Date(before), -1).toISOString(),
          );
          expect(account.adjustments[0]).toMatchObject({
            action: 'REFUND',
            previousUntil: before,
            reason: 'cancelled within a day',
          });
          expect((await orderOf(full)).status).toBe('REFUNDED');
          gateway.verify.mockClear();
          expect(await service().settle(full)).toBe('failed');
          expect(gateway.verify).not.toHaveBeenCalled();
          await expect(
            service().refund(admin.id, {
              orderId: fullOrder.id,
              amountRial: 10,
              access: 'keep',
              reason: 'closed',
            }),
          ).rejects.toBeInstanceOf(UnprocessableEntityException);
          await expect(
            service().refund(admin.id, {
              orderId: randomUUID(),
              amountRial: 10,
              access: 'keep',
              reason: 'unknown',
            }),
          ).rejects.toBeInstanceOf(NotFoundException);

          const page = await service().adminOrders({ status: 'REFUNDED' });
          expect(page.orders.some((o) => o.id === fullOrder.id)).toBe(true);
          expect(page.overview.refunds).toBeGreaterThanOrEqual(2);
          expect(page.overview.refundedRial).toBeGreaterThanOrEqual(1_480_000);

          // Taking back more than is left ends access now, never in the past.
          const plan = await prisma.billingPlan.findUniqueOrThrow({
            where: { code },
          });
          const short = await prisma.billingOrder.create({
            data: {
              userId,
              planId: plan.id,
              months: 12,
              amountRial: 990_000,
              status: 'PAID',
              paidAt: new Date(),
            },
          });
          const now = new Date();
          await prisma.billingSubscription.update({
            where: { userId },
            data: { paidUntil: new Date(now.getTime() + 5 * 86_400_000) },
          });
          const ended = await service().refund(
            admin.id,
            {
              orderId: short.id,
              amountRial: 990_000,
              access: 'remove',
              reason: 'refund',
            },
            now,
          );
          expect(ended.subscription).toEqual({
            paidUntil: now.toISOString(),
            active: false,
          });
        } finally {
          await prisma.billingRefund.deleteMany({
            where: { adminId: admin.id },
          });
          await prisma.billingAdjustment.deleteMany({
            where: { adminId: admin.id },
          });
          await prisma.user.delete({ where: { id: admin.id } });
        }
      });
    });
  },
);

describe.skipIf(process.env['GROWTH_DB_INTEGRATION'] !== '1')(
  'Store purchases (Cafe Bazaar, Myket) on PostgreSQL',
  () => {
    const run = randomUUID().slice(0, 8);
    const emails = [
      `store-a-${run}@example.invalid`,
      `store-b-${run}@example.invalid`,
    ];
    const code = `s-${run}`;
    const sku = billingStoreSku(code);
    let prisma: PrismaService;
    let userId: string;
    let otherId: string;
    const zibal = { request: vi.fn(), verify: vi.fn() };
    const store = { verify: vi.fn() };
    const service = () =>
      new BillingService(
        prisma,
        zibal as unknown as ZibalGateway,
        new ConfigService(),
        undefined,
        store as unknown as StoreGateway,
      );
    const purchased = (payload: string) => ({
      kind: 'purchased' as const,
      payload,
      purchaseTime: Date.now(),
    });
    const token = () => `token-${randomUUID()}`;
    const paidUntil = async (id = userId) =>
      (await service().subscription(id)).paidUntil;

    beforeAll(async () => {
      const url = process.env['DATABASE_URL'];
      if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
        throw new Error('A local database is required');
      prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
      [userId, otherId] = await Promise.all(
        emails.map(async (email) => {
          const user = await prisma.user.create({
            data: { email, passwordHash: 'synthetic-integration-fixture' },
          });
          return user.id;
        }),
      );
      await service().savePlan({
        code,
        titleFa: 'آزمایشی',
        titleEn: 'Test',
        months: 1,
        priceRial: 2_490_000,
        active: true,
      });
    });
    afterAll(async () => {
      if (prisma) {
        const where = { userId: { in: [userId, otherId] } };
        await prisma.billingOrder.deleteMany({ where });
        await prisma.billingPlan.deleteMany({ where: { code } });
        await prisma.user.deleteMany({ where: { email: { in: emails } } });
        await prisma.$disconnect();
      }
    });
    beforeEach(() => store.verify.mockReset());

    it('hands out the SKU and payload only when a purchase is allowed', async () => {
      expect(
        await service().storeIntent(userId, { store: 'bazaar', plan: code }),
      ).toEqual({ sku, payload: userId });
      await expect(
        service().storeIntent(userId, { store: 'myket', plan: 'no-such-plan' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('verifies with the store, activates once and answers a replay without a second month', async () => {
      const purchaseToken = token();
      store.verify.mockResolvedValue(purchased(userId));
      const input = { store: 'bazaar' as const, sku, purchaseToken };
      const results = await Promise.all([
        service().storeVerify(userId, input),
        service().storeVerify(userId, input),
        service().storeVerify(userId, input),
      ]);
      expect(results).toEqual(['paid', 'paid', 'paid']);
      expect(store.verify).toHaveBeenCalledWith('bazaar', sku, purchaseToken);
      const until = await paidUntil();
      expect(until).not.toBeNull();
      store.verify.mockClear();
      expect(await service().storeVerify(userId, input)).toBe('paid');
      expect(store.verify).not.toHaveBeenCalled();
      expect(await paidUntil()).toBe(until);
      const orders = await prisma.billingOrder.findMany({
        where: { userId, purchaseToken },
      });
      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({
        status: 'PAID',
        provider: 'BAZAAR',
        months: 1,
        amountRial: 2_490_000,
      });
      // The renewal window guards the purchase sheet, not a purchase the store already charged.
      await expect(
        service().storeIntent(userId, { store: 'bazaar', plan: code }),
      ).rejects.toBeInstanceOf(ConflictException);
      const second = token();
      store.verify.mockResolvedValue(purchased(userId));
      expect(
        await service().storeVerify(userId, {
          store: 'myket',
          sku,
          purchaseToken: second,
        }),
      ).toBe('paid');
      expect(await paidUntil()).toBe(
        addMonths(new Date(until as string), 1).toISOString(),
      );
    });

    it("refuses another account's replay, the wrong payload and the wrong SKU", async () => {
      const purchaseToken = token();
      store.verify.mockResolvedValue(purchased(userId));
      await service().storeVerify(userId, {
        store: 'myket',
        sku,
        purchaseToken,
      });
      const before = await paidUntil(otherId);
      await expect(
        service().storeVerify(otherId, { store: 'myket', sku, purchaseToken }),
      ).rejects.toBeInstanceOf(ConflictException);
      // A token bought for one account and sent from another (fresh token, not yet used).
      await expect(
        service().storeVerify(otherId, {
          store: 'myket',
          sku,
          purchaseToken: token(),
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      store.verify.mockClear();
      // A SKU that maps to no plan never reaches the store.
      await expect(
        service().storeVerify(otherId, {
          store: 'bazaar',
          sku: 'no_such_plan',
          purchaseToken: token(),
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(store.verify).not.toHaveBeenCalled();
      // The store does not know this token for this product.
      store.verify.mockResolvedValue({ kind: 'invalid' });
      await expect(
        service().storeVerify(otherId, {
          store: 'bazaar',
          sku,
          purchaseToken: token(),
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(await paidUntil(otherId)).toBe(before);
      expect(
        await prisma.billingOrder.count({ where: { userId: otherId } }),
      ).toBe(0);
    });

    it('writes nothing on a store outage and activates when the purchase is sent again', async () => {
      const purchaseToken = token();
      const input = { store: 'bazaar' as const, sku, purchaseToken };
      const before = await paidUntil(otherId);
      store.verify.mockRejectedValueOnce(
        new ServiceUnavailableException('Store billing is unavailable'),
      );
      await expect(
        service().storeVerify(otherId, input),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(
        await prisma.billingOrder.count({ where: { purchaseToken } }),
      ).toBe(0);
      expect(await paidUntil(otherId)).toBe(before);
      store.verify.mockResolvedValueOnce(purchased(otherId));
      expect(await service().storeVerify(otherId, input)).toBe('paid');
      expect((await service().subscription(otherId)).active).toBe(true);
    });

    it('leaves store orders out of Zibal reconciliation', async () => {
      const [order] = await service().orders(otherId);
      expect(await service().recheck(otherId, order.id)).toBe('paid');
      expect(zibal.verify).not.toHaveBeenCalled();
    });
  },
);
