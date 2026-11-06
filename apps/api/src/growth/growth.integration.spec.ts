import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';
import { GrowthService } from './growth.service';
import { AuthService } from '@all-in-one/api/auth';

// Explicit opt-in: normal unit tests never need a running database.
describe.skipIf(process.env['GROWTH_DB_INTEGRATION'] !== '1')(
  'Growth PostgreSQL integration',
  () => {
    const visitorId = randomUUID();
    const email = `growth-${randomUUID()}@example.invalid`;
    let prisma: PrismaService;

    beforeAll(() => {
      const url = process.env['DATABASE_URL'];
      if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
        throw new Error(
          'Growth integration tests require an explicitly configured local database',
        );
      }
      prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
    });

    afterAll(async () => {
      if (prisma) {
        await prisma.growthEvent.deleteMany({ where: { visitorId } });
        await prisma.user.deleteMany({ where: { email } });
        await prisma.$disconnect();
      }
    });

    it('deduplicates concurrent retries and returns distinct PostgreSQL visitor counts', async () => {
      const service = new GrowthService(prisma);
      const before = await service.summary();
      const input = {
        visitorId,
        name: 'landing_view',
        language: 'fa',
        campaign: { utm_source: 'integration-test' },
      } as const;
      await Promise.all([
        service.record(input),
        service.record(input),
        service.record(input),
      ]);
      expect(await prisma.growthEvent.count({ where: { visitorId } })).toBe(1);
      await service.record({ ...input, name: 'signup_started' });
      const summary = await service.summary();
      expect(summary.landingVisitors).toBe(before.landingVisitors + 1);
      expect(summary.signupVisitors).toBe(before.signupVisitors + 1);
      expect(await prisma.growthEvent.count({ where: { visitorId } })).toBe(2);
    });

    it('records completed signup only after account creation, never on duplicate-account failure', async () => {
      const growth = new GrowthService(prisma);
      const before = await growth.summary();
      const auth = new AuthService(
        prisma,
        {} as never,
        {} as never,
        new ConfigService({
          REQUIRE_EMAIL_VERIFICATION: 'false',
          GROWTH_ANALYTICS_ENABLED: 'true',
        }),
      );
      const input = {
        email,
        password: 'integration-test-password',
        acquisition: {
          visitorId,
          language: 'en' as const,
          campaign: { utm_source: 'integration-test' },
        },
      };
      const user = await auth.register(input);
      expect(user.email).toBe(email);
      expect(
        await prisma.growthEvent.count({
          where: { visitorId, name: 'signup_completed' },
        }),
      ).toBe(1);
      await expect(auth.register(input)).rejects.toThrow();
      expect(
        await prisma.growthEvent.count({
          where: { visitorId, name: 'signup_completed' },
        }),
      ).toBe(1);
      expect((await growth.summary()).completedSignupVisitors).toBe(
        before.completedSignupVisitors + 1,
      );
    });

    it('keeps milestones unique across concurrent requests and days and attributes activity to first observed source', async () => {
      const service = new GrowthService(prisma);
      await Promise.all([
        service.recordMilestone(visitorId, 'first_task_created', 'en'),
        service.recordMilestone(visitorId, 'first_task_created', 'en'),
      ]);
      await prisma.growthEvent.updateMany({
        where: { visitorId, name: 'first_task_created' },
        data: {
          day: new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA', {
            timeZone: 'Asia/Tehran',
          }),
        },
      });
      await service.recordMilestone(visitorId, 'first_task_created', 'en');
      await service.recordMilestone(visitorId, 'first_review_completed', 'en');
      expect(
        await prisma.growthEvent.count({
          where: { visitorId, name: 'first_task_created' },
        }),
      ).toBe(1);
      expect(
        await prisma.growthEvent.count({
          where: { visitorId, name: 'first_review_completed' },
        }),
      ).toBe(1);
      const summary = await service.summary();
      expect(
        summary.channels.find(
          (channel) => channel.source === 'integration-test',
        ),
      ).toMatchObject({
        landingVisitors: 1,
        signupVisitors: 1,
        completedSignupVisitors: 1,
        activatedVisitors: 1,
      });
    });
  },
);
