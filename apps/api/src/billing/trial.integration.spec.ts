import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@all-in-one/api/db';
import {
  AuthService,
  ContactEvents,
  PhoneService,
  type MailService,
  type SmsService,
} from '@all-in-one/api/auth';
import { billingRewardRequestSchema } from '@all-in-one/shared/schemas';
import { BillingService, TRIAL_LAUNCH } from './billing.service';
import type { ZibalGateway } from './zibal.gateway';

const DAY_MS = 86_400_000;

describe.skipIf(process.env['GROWTH_DB_INTEGRATION'] !== '1')(
  'Trial start (PostgreSQL, directive 119)',
  () => {
    let prisma: PrismaService;
    const ids: string[] = [];
    const billing = () => new BillingService(prisma, {} as ZibalGateway);
    const number = () =>
      `+989${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

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

    it('persists landing goals across new email and phone accounts without replacing existing choices', async () => {
      const auth = new AuthService(
        prisma,
        {} as JwtService,
        {} as MailService,
        new ConfigService({ REQUIRE_EMAIL_VERIFICATION: 'false' }),
      );
      const email = await auth.register({
        email: `landing-${randomUUID()}@example.invalid`,
        password: 'synthetic-password123',
        goal: 'english',
      });
      ids.push(email.id);
      const mobile = number();
      const phone = await auth.signInByPhone(mobile, undefined, 'health');
      ids.push(phone.user.id);
      expect(
        (await auth.signInByPhone(mobile, undefined, 'planner')).user
          .onboardingGoal,
      ).toBe('health');
      for (const [id, goal] of [
        [email.id, 'english'],
        [phone.user.id, 'health'],
      ]) {
        const stored = await prisma.user.findUniqueOrThrow({
          where: { id },
          include: { onboardingGoalChanges: true },
        });
        expect(stored.onboardingGoal).toBe(goal);
        expect(
          stored.onboardingGoalChanges.map((change) => change.goal),
        ).toEqual([goal]);
      }
    });

    it('starts a phone-only account’s week at its SMS sign-up', async () => {
      const confirmed = new Date(TRIAL_LAUNCH.getTime() + 2 * DAY_MS);
      const user = await prisma.user.create({
        data: { phone: number(), phoneVerifiedAt: confirmed },
      });
      ids.push(user.id);
      const access = await billing().access(
        user.id,
        new Date(confirmed.getTime() + DAY_MS),
      );
      expect(access).toMatchObject({
        tier: 'trial',
        trialUntil: new Date(confirmed.getTime() + 7 * DAY_MS).toISOString(),
      });
    });

    it('keeps an email account’s trial from its email confirmation after it adds a phone', async () => {
      const email = new Date(TRIAL_LAUNCH.getTime() + DAY_MS);
      const user = await prisma.user.create({
        data: {
          email: `trial-${randomUUID()}@example.invalid`,
          passwordHash: 'synthetic-integration-fixture',
          emailVerifiedAt: email,
          phone: number(),
          phoneVerifiedAt: new Date(email.getTime() + 3 * DAY_MS),
        },
      });
      ids.push(user.id);
      const { trialUntil } = await billing().access(user.id, email);
      expect(trialUntil).toBe(
        new Date(email.getTime() + 7 * DAY_MS).toISOString(),
      );
    });

    describe('second-contact week (directive 121)', () => {
      const codes: string[] = [];
      const links: string[] = [];
      const sms = {
        enabled: true,
        send: vi.fn(async (_t: string, _to: string, p: { code?: string }) => {
          codes.push(p.code as string);
        }),
        notify: vi.fn(),
      };
      const mail = {
        enabled: true,
        send: vi.fn(async () => undefined),
        link: (_kind: string, token: string) => {
          links.push(token);
          return token;
        },
      };
      const wire = () => {
        const events = new ContactEvents();
        events.onConfirmed((userId) => billing().grantSecondContact(userId));
        return {
          phones: new PhoneService(
            prisma,
            sms as unknown as SmsService,
            events,
          ),
          auth: new AuthService(
            prisma,
            {} as JwtService,
            mail as unknown as MailService,
            new ConfigService({ GROWTH_ANALYTICS_ENABLED: 'false' }),
            undefined,
            events,
          ),
        };
      };
      const weeks = (userId: string) =>
        prisma.billingReward.findMany({
          where: { userId, campaign: 'SECOND_CONTACT' },
        });
      const emailAccount = async () => {
        const user = await prisma.user.create({
          data: {
            email: `contact-${randomUUID()}@example.invalid`,
            passwordHash: 'synthetic-integration-fixture',
            emailVerifiedAt: new Date(),
          },
        });
        ids.push(user.id);
        return user;
      };

      it('gives an email account one week when it confirms a phone, once', async () => {
        const { phones } = wire();
        const user = await emailAccount();
        expect(
          (await billing().rewardOffers(user.id)).find(
            (offer) => offer.campaign === 'SECOND_CONTACT',
          ),
        ).toMatchObject({ status: 'available', confirm: 'phone' });
        const phone = number();
        await phones.start(user.id, phone);
        const state = await phones.confirm(user.id, codes.at(-1) as string);
        expect(state).toMatchObject({ phone, rewardedWeek: true });
        const [week] = await weeks(user.id);
        expect(week.adminId).toBeNull();
        // The week is queued after the trial, and the access state shows where AI really ends.
        const { trialUntil, aiUntil } = await billing().access(user.id);
        expect(week.startsAt.toISOString()).toBe(trialUntil);
        expect(aiUntil).toBe(week.expiresAt.toISOString());
        expect(week.expiresAt.getTime() - week.startsAt.getTime()).toBe(
          7 * DAY_MS,
        );
        expect(
          (await billing().rewardOffers(user.id)).find(
            (offer) => offer.campaign === 'SECOND_CONTACT',
          ),
        ).toMatchObject({ status: 'earned' });
        // Removing and confirming again earns nothing more.
        await phones.remove(user.id);
        await phones.start(user.id, phone);
        const again = await phones.confirm(user.id, codes.at(-1) as string);
        expect(again.rewardedWeek).toBe(false);
        expect(await weeks(user.id)).toHaveLength(1);
      });

      it('gives a phone-only account one week when it adds and confirms an email', async () => {
        const { auth } = wire();
        const { user } = await auth.signInByPhone(number());
        ids.push(user.id);
        expect(await weeks(user.id)).toHaveLength(0);
        expect(
          (await billing().rewardOffers(user.id)).find(
            (offer) => offer.campaign === 'SECOND_CONTACT',
          ),
        ).toMatchObject({ status: 'available', confirm: 'email' });
        const email = `added-${randomUUID()}@example.invalid`;
        await auth.requestEmail(user.id, email.toUpperCase());
        expect(
          (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
            .email,
        ).toBeNull();
        expect(await auth.verifyEmail(links.at(-1) as string)).toEqual({
          rewardedWeek: true,
        });
        const after = await prisma.user.findUniqueOrThrow({
          where: { id: user.id },
        });
        expect(after.email).toBe(email);
        expect(after.emailVerifiedAt).toBeInstanceOf(Date);
        expect(await weeks(user.id)).toHaveLength(1);
        await expect(
          auth.requestEmail(user.id, `other-${randomUUID()}@example.invalid`),
        ).rejects.toMatchObject({ status: 400 });
      });

      it('never adds an email that another account has', async () => {
        const { auth } = wire();
        const other = await emailAccount();
        const { user } = await auth.signInByPhone(number());
        ids.push(user.id);
        await expect(
          auth.requestEmail(user.id, other.email as string),
        ).rejects.toMatchObject({ status: 409 });
      });

      it('is never requested like a social week', () => {
        expect(
          billingRewardRequestSchema.safeParse({
            campaign: 'SECOND_CONTACT',
            handle: 'someone',
          }).success,
        ).toBe(false);
      });
    });
  },
);
