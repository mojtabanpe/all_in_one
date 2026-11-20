import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';
import { REFERRAL_MAX_WEEKS } from '@all-in-one/shared/schemas';
import { BillingService } from './billing.service';
import { ReferralService } from './referral';
import type { ZibalGateway } from './zibal.gateway';

const DAY_MS = 86_400_000;

describe.skipIf(process.env['GROWTH_DB_INTEGRATION'] !== '1')(
  'Invite a friend (PostgreSQL, directive 183)',
  () => {
    let prisma: PrismaService;
    const ids: string[] = [];
    const service = () =>
      new ReferralService(
        prisma,
        new BillingService(prisma, {} as ZibalGateway),
      );
    const account = async (
      over: { confirmed?: boolean; createdAt?: Date } = {},
    ) => {
      const user = await prisma.user.create({
        data: {
          email: `referral-${randomUUID()}@example.invalid`,
          passwordHash: 'synthetic-integration-fixture',
          emailVerifiedAt: over.confirmed === false ? null : new Date(),
          ...(over.createdAt ? { createdAt: over.createdAt } : {}),
        },
      });
      ids.push(user.id);
      return user;
    };
    /** A first real action: a card review day. */
    const act = (userId: string) =>
      prisma.englishReviewDay.create({
        data: { userId, date: new Date('2026-11-20'), reviews: 1 },
      });
    const weeks = (userId: string) =>
      prisma.billingReward.findMany({
        where: {
          userId,
          campaign: { in: ['REFERRAL_INVITER', 'REFERRAL_INVITED'] },
        },
      });

    beforeAll(() => {
      const url = process.env['DATABASE_URL'];
      if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
        throw new Error('A local database is required');
      prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
    });
    afterAll(async () => {
      if (!prisma) return;
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    });

    it('gives each account one code, kept across reads', async () => {
      const user = await account();
      const first = await service().status(user.id);
      expect(first.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      expect((await service().status(user.id)).code).toBe(first.code);
      expect(first).toMatchObject({
        invited: 0,
        rewarded: 0,
        weeksLeft: REFERRAL_MAX_WEEKS,
        invitedBy: false,
        canEnter: true,
      });
    });

    it('grants both weeks once the friend does a first real action, and only once', async () => {
      const inviter = await account();
      const friend = await account();
      const { code } = await service().status(inviter.id);
      const joined = await service().attach(friend.id, {
        code: code.toLowerCase(),
      });
      expect(joined).toMatchObject({ invitedBy: true, canEnter: false });
      // Nothing yet: the friend has done nothing.
      expect(await weeks(friend.id)).toHaveLength(0);
      await act(friend.id);
      await service().sweep();
      await service().sweep();
      const [invited] = await weeks(friend.id);
      const [earned] = await weeks(inviter.id);
      expect(invited.campaign).toBe('REFERRAL_INVITED');
      expect(earned).toMatchObject({
        campaign: 'REFERRAL_INVITER',
        key: friend.id,
        adminId: null,
      });
      expect(earned.expiresAt.getTime() - earned.startsAt.getTime()).toBe(
        7 * DAY_MS,
      );
      expect(await weeks(inviter.id)).toHaveLength(1);
      expect(await service().status(inviter.id)).toMatchObject({
        invited: 1,
        rewarded: 1,
        weeksLeft: REFERRAL_MAX_WEEKS - 1,
      });
    });

    it('settles at once for a friend who already did something, and queues weeks after each other', async () => {
      const inviter = await account();
      const { code } = await service().status(inviter.id);
      for (const _ of [1, 2]) {
        const friend = await account();
        await act(friend.id);
        await service().attach(friend.id, { code });
      }
      const rows = (await weeks(inviter.id)).sort(
        (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
      );
      expect(rows).toHaveLength(2);
      expect(rows[1].startsAt.getTime()).toBe(rows[0].expiresAt.getTime());
    });

    it('refuses its own code, a second code, a late code, mutual invitations and unknown codes', async () => {
      const a = await account();
      const b = await account();
      const late = await account({
        createdAt: new Date(Date.now() - 8 * DAY_MS),
      });
      const codeA = (await service().status(a.id)).code;
      const codeB = (await service().status(b.id)).code;
      await expect(service().attach(a.id, { code: codeA })).rejects.toThrow();
      await service().attach(b.id, { code: codeA });
      await expect(service().attach(b.id, { code: codeA })).rejects.toThrow();
      await expect(service().attach(a.id, { code: codeB })).rejects.toThrow();
      await expect(
        service().attach(late.id, { code: codeA }),
      ).rejects.toThrow();
      await expect(
        service().attach(a.id, { code: 'ZZZZZZZZ' }),
      ).rejects.toThrow();
    });

    it('waits for an unconfirmed friend', async () => {
      const inviter = await account();
      const friend = await account({ confirmed: false });
      const { code } = await service().status(inviter.id);
      await act(friend.id);
      await service().attach(friend.id, { code });
      expect(await weeks(friend.id)).toHaveLength(0);
      expect(await weeks(inviter.id)).toHaveLength(0);
    });
  },
);
