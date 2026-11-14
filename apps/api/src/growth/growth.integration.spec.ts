import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';
import { GrowthController } from './growth.controller';
import { GrowthService } from './growth.service';
import { AuthService, MailService } from '@all-in-one/api/auth';

// Explicit opt-in: normal unit tests never need a running database.
describe.skipIf(process.env['GROWTH_DB_INTEGRATION'] !== '1')(
  'Growth PostgreSQL integration',
  () => {
    const visitorId = randomUUID();
    const email = `growth-${randomUUID()}@example.invalid`;
    const verificationEmail = `verify-${randomUUID()}@example.invalid`;
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
        await prisma.user.deleteMany({
          where: { email: { in: [email, verificationEmail] } },
        });
        await prisma.$disconnect();
      }
    });

    it('audits admin report activity and compares full Tehran weeks without QA traffic', async () => {
      const actorId = randomUUID();
      const [visitor, qa] = [randomUUID(), randomUUID()];
      await prisma.$transaction(async (tx) => {
        const service = new GrowthService(tx as never);
        const controller = new GrowthController(
          service,
          new ConfigService({ GROWTH_ANALYTICS_ENABLED: 'true' }),
        );
        const admin = { id: actorId } as never;
        await controller.summary(admin);
        await controller.auditCampaignExport(admin);
        await tx.growthEvent.createMany({
          data: [
            { visitorId: visitor, name: 'signup_completed', day: '2031-01-01' },
            {
              visitorId: visitor,
              name: 'first_task_created',
              day: '2031-01-08',
            },
            {
              visitorId: visitor,
              name: 'first_review_completed',
              day: '2031-01-14',
            },
            { visitorId: visitor, name: 'signup_completed', day: '2031-01-15' },
            {
              visitorId: qa,
              name: 'landing_view',
              day: '2030-12-31',
              campaign: { utm_source: 'QA' },
            },
            { visitorId: qa, name: 'signup_completed', day: '2031-01-08' },
          ].map((event) => ({ ...event, language: 'fa' })),
        });
        const report = await service.monitoring(
          new Date('2031-01-14T20:30:00Z'),
        );
        expect(report.weeks).toEqual([
          { from: '2031-01-08', to: '2031-01-14', signups: 0, activations: 1 },
          { from: '2031-01-01', to: '2031-01-07', signups: 1, activations: 0 },
        ]);
        expect(
          report.audit.filter((entry) => entry.actorId === actorId),
        ).toEqual([
          expect.objectContaining({ action: 'EXPORT', report: 'CAMPAIGNS' }),
          expect.objectContaining({ action: 'VIEW', report: 'SUMMARY' }),
        ]);
        await tx.growthEvent.deleteMany({
          where: { visitorId: { in: [visitor, qa] } },
        });
        await tx.growthReportAudit.deleteMany({ where: { actorId } });
      });
    });

    it('counts client use independently, deduplicates retries and excludes QA and out-of-window visits', async () => {
      const visitor = randomUUID();
      const qa = randomUUID();
      await prisma.$transaction(async (tx) => {
        const service = new GrowthService(tx as never);
        const input = { visitorId: visitor, client: 'bazaar' as const };
        const before = await service.clients();
        await Promise.all([
          service.recordClient(input),
          service.recordClient(input),
        ]);
        expect(
          await tx.growthClientDay.count({
            where: { visitorId: visitor, client: 'bazaar' },
          }),
        ).toBe(1);
        const after = await service.clients();
        expect(after.rows.find((row) => row.client === 'bazaar')).toEqual({
          client: 'bazaar',
          visitors:
            (before.rows.find((row) => row.client === 'bazaar')?.visitors ??
              0) + 1,
        });
        // Use a future isolated window so other local test data cannot alter counts.
        await tx.growthClientDay.createMany({
          data: [
            { visitorId: visitor, client: 'direct_apk', day: '2031-01-01' },
            { visitorId: visitor, client: 'direct_apk', day: '2031-01-02' },
            { visitorId: visitor, client: 'pwa', day: '2031-01-02' },
            { visitorId: visitor, client: 'myket', day: '2030-12-31' },
            { visitorId: visitor, client: 'myket', day: '2031-01-31' },
            { visitorId: qa, client: 'bazaar', day: '2031-01-02' },
          ],
        });
        await tx.growthEvent.create({
          data: {
            visitorId: qa,
            name: 'landing_view',
            language: 'en',
            day: '2030-12-31',
            campaign: { utm_source: 'QA' },
          },
        });
        const report = await service.clients(new Date('2031-01-30T12:00:00Z'));
        expect(report).toMatchObject({ from: '2031-01-01', to: '2031-01-30' });
        expect(report.rows.filter((row) => row.visitors > 0)).toEqual([
          { client: 'direct_apk', visitors: 1 },
          { client: 'pwa', visitors: 1 },
        ]);
        // Observing an app client never invents a marketing event or campaign.
        expect(
          await tx.growthEvent.count({ where: { visitorId: visitor } }),
        ).toBe(0);
        await tx.growthClientDay.deleteMany({
          where: { visitorId: { in: [visitor, qa] } },
        });
        await tx.growthEvent.deleteMany({ where: { visitorId: qa } });
      });
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

    it('keeps campaign context in original/resend emails and preserves one-use token security', async () => {
      const config = new ConfigService({
        NODE_ENV: 'test',
        SMTP_URL: '',
        REQUIRE_EMAIL_VERIFICATION: 'true',
        GROWTH_ANALYTICS_ENABLED: 'true',
        APP_PUBLIC_URL: 'https://poshtetgarm.ir/app',
      });
      const mail = new MailService(config);
      const auth = new AuthService(prisma, {} as never, mail, config);
      const campaign = {
        utm_source: 'newsletter',
        utm_campaign: 'verification-flow',
      };
      await auth.register({
        email: verificationEmail,
        password: 'integration-test-password',
        acquisition: { visitorId, language: 'en', campaign },
      });
      await vi.waitFor(() => expect(mail.outbox).toHaveLength(1));
      const firstUrl = new URL(
        mail.outbox[0].text
          .split('\n')
          .find((line) => line.startsWith('https://')) as string,
      );
      expect(firstUrl.pathname).toBe('/app/verify-email');
      expect(firstUrl.searchParams.get('utm_source')).toBe('newsletter');
      expect(firstUrl.searchParams.has('visitorId')).toBe(false);
      await expect(
        auth.login({
          email: verificationEmail,
          password: 'integration-test-password',
        }),
      ).rejects.toThrow();
      auth.requestVerification(verificationEmail, campaign);
      await vi.waitFor(() => expect(mail.outbox).toHaveLength(2));
      const secondUrl = new URL(
        mail.outbox[1].text
          .split('\n')
          .find((line) => line.startsWith('https://')) as string,
      );
      expect(secondUrl.searchParams.get('utm_campaign')).toBe(
        'verification-flow',
      );
      await expect(
        auth.verifyEmail(firstUrl.searchParams.get('token') as string),
      ).rejects.toThrow();
      await auth.verifyEmail(secondUrl.searchParams.get('token') as string);
      await expect(
        auth.verifyEmail(secondUrl.searchParams.get('token') as string),
      ).rejects.toThrow();
      expect(
        (
          await auth.login({
            email: verificationEmail,
            password: 'integration-test-password',
          })
        ).emailVerifiedAt,
      ).not.toBeNull();
    });
  },
);
