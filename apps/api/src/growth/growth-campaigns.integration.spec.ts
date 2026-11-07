import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';
import { GrowthService } from './growth.service';

describe.skipIf(process.env['GROWTH_DB_INTEGRATION'] !== '1')(
  'Campaign cohort PostgreSQL report',
  () => {
    let prisma: PrismaService;
    let service: GrowthService;
    const ids: string[] = [];
    const source = `campaign-test-${randomUUID()}`;
    beforeAll(() => {
      const url = process.env['DATABASE_URL'];
      if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
        throw new Error('An explicit local database is required');
      prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
      service = new GrowthService(prisma);
    });
    afterAll(async () => {
      if (prisma) {
        await prisma.growthEvent.deleteMany({
          where: { visitorId: { in: ids } },
        });
        await prisma.$disconnect();
      }
    });
    const visitor = () => {
      const id = randomUUID();
      ids.push(id);
      return id;
    };
    const event = (
      visitorId: string,
      name: string,
      ago: number,
      campaign?: object,
      sequence = 0,
    ) => {
      const createdAt = new Date(
        Date.now() - ago * 86_400_000 + sequence * 1000,
      );
      return {
        visitorId,
        name,
        createdAt,
        day: createdAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' }),
        language: 'en',
        ...(campaign ? { campaign } : {}),
      };
    };
    it('excludes test visitors and their later untagged activity from campaign results', async () => {
      const campaign = `qa-exclusion-${randomUUID()}`;
      const controlSource = `${source}-qa-control`;
      const real = visitor();
      const qa = visitor();
      await prisma.growthEvent.createMany({
        data: [
          event(real, 'landing_view', 2, {
            utm_source: controlSource,
            utm_campaign: campaign,
          }),
          event(qa, 'landing_view', 2, {
            utm_source: 'QA',
            utm_campaign: campaign,
          }),
          event(qa, 'signup_completed', 1),
          event(qa, 'first_review_completed', 0),
        ],
      });

      const report = await service.campaigns({ campaign });
      expect(report.totals).toEqual({
        landingVisitors: 1,
        signupVisitors: 0,
        completedSignupVisitors: 0,
        activeVisitors: 0,
      });
      expect(report.rows.map((row) => row.source)).toEqual([controlSource]);
    });

    it('filters the original touch, retains later untagged activity and binds SQL values literally', async () => {
      const [a, b, c, d, future] = Array.from({ length: 5 }, visitor);
      const injection = "alpha' OR true --";
      await prisma.growthEvent.createMany({
        data: [
          event(a, 'landing_view', 5, {
            utm_source: source,
            utm_medium: 'social',
            utm_campaign: 'alpha',
          }),
          event(
            a,
            'landing_view',
            4,
            { utm_source: source + '-later', utm_campaign: 'changed' },
            1,
          ),
          event(a, 'signup_started', 4),
          event(a, 'signup_completed', 3),
          event(a, 'active_day', 1),
          event(a, 'first_task_created', 1, undefined, 1),
          event(b, 'landing_view', 3, {
            utm_source: source,
            utm_medium: 'email',
            utm_campaign: 'alpha',
          }),
          event(b, 'signup_completed', 2),
          event(b, 'active_day', 0),
          event(c, 'landing_view', 30, {
            utm_source: source,
            utm_campaign: 'old',
          }),
          event(c, 'landing_view', 2, {
            utm_source: source + '-new',
            utm_medium: 'social',
            utm_campaign: 'alpha',
          }),
          event(c, 'signup_completed', 1),
          event(d, 'landing_view', 1, {
            utm_source: source,
            utm_medium: 'social',
            utm_campaign: injection,
          }),
          event(d, 'signup_started', 0),
          event(future, 'landing_view', -1, {
            utm_source: source,
            utm_campaign: 'future',
          }),
        ],
      });
      const exact = await service.campaigns({
        source,
        medium: 'social',
        campaign: 'alpha',
      });
      expect(exact.totals).toEqual({
        landingVisitors: 1,
        signupVisitors: 1,
        completedSignupVisitors: 1,
        activeVisitors: 1,
      });
      expect(exact.rows).toHaveLength(1);
      const all = await service.campaigns({ source });
      expect(all.totals).toEqual({
        landingVisitors: 3,
        signupVisitors: 2,
        completedSignupVisitors: 2,
        activeVisitors: 2,
      });
      expect(all.rows).toHaveLength(3);
      expect(
        (await service.campaigns({ source: source + '-later' })).rows,
      ).toEqual([]);
      expect(
        (await service.campaigns({ source: source + '-new' })).totals
          .completedSignupVisitors,
      ).toBe(1);
      expect(
        (await service.campaigns({ source, campaign: injection })).totals
          .landingVisitors,
      ).toBe(1);
      expect(
        (await service.campaigns({ source: "' OR true --" })).totals
          .landingVisitors,
      ).toBe(0);
    });
    it('distinguishes absent attribution from literal unknown values', async () => {
      const tag = source + '-missing';
      await prisma.growthEvent.createMany({
        data: [
          event(visitor(), 'landing_view', 1, { utm_source: tag }),
          event(visitor(), 'landing_view', 1, {
            utm_source: tag,
            utm_medium: 'unknown',
            utm_campaign: 'unknown',
          }),
        ],
      });
      const report = await service.campaigns({ source: tag });
      expect(report.rows).toHaveLength(2);
      expect(
        report.rows.some((row) => row.medium === null && row.campaign === null),
      ).toBe(true);
      expect(
        (await service.campaigns({ source: tag, campaign: 'unknown' })).totals
          .landingVisitors,
      ).toBe(1);
    });
    it('totals every matching cohort while limiting the table to 20 combinations', async () => {
      const tag = source + '-limit';
      await prisma.growthEvent.createMany({
        data: Array.from({ length: 25 }, (_, i) =>
          event(visitor(), 'landing_view', 1, {
            utm_source: tag,
            utm_medium: `medium-${i}`,
            utm_campaign: 'alpha',
          }),
        ),
      });
      const report = await service.campaigns({ source: tag });
      expect(report.totals.landingVisitors).toBe(25);
      expect(report.rows).toHaveLength(20);
      expect(
        report.rows.reduce((sum, row) => sum + row.landingVisitors, 0),
      ).toBe(20);
    });
  },
);
