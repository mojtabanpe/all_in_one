import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';
import { GROWTH_REFERRAL_SOURCE } from '@all-in-one/shared/schemas';
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
    it('counts first-touch referrals across personal links and later untagged signups', async () => {
      const [first, second, returning] = Array.from({ length: 3 }, visitor);
      const filter = {
        source: GROWTH_REFERRAL_SOURCE,
        medium: 'invite',
        campaign: 'personal-invite',
      };
      const before = (await service.campaigns(filter)).totals;
      const invite = (code: string) => ({
        utm_source: filter.source,
        utm_medium: filter.medium,
        utm_campaign: filter.campaign,
        utm_content: code,
      });
      await prisma.growthEvent.createMany({
        data: [
          event(first, 'landing_view', 4, invite('a'.repeat(32))),
          event(first, 'signup_started', 3),
          event(first, 'signup_completed', 2),
          event(second, 'landing_view', 4, invite('b'.repeat(32))),
          event(returning, 'landing_view', 5, { utm_source: 'newsletter' }),
          event(returning, 'landing_view', 4, invite('a'.repeat(32))),
          event(returning, 'signup_completed', 2),
        ],
      });
      const report = await service.campaigns(filter);
      expect(report.rows).toHaveLength(1);
      expect(report.totals).toEqual({
        ...before,
        landingVisitors: before.landingVisitors + 2,
        signupVisitors: before.signupVisitors + 1,
        completedSignupVisitors: before.completedSignupVisitors + 1,
      });
    });

    it('groups Saturday cohorts and excludes incomplete return days and QA visitors', async () => {
      const now = new Date('2030-11-13T10:00:00Z');
      const [older, recent, qa] = Array.from({ length: 3 }, visitor);
      const row = (
        visitorId: string,
        name: string,
        day: string,
        campaign?: object,
      ) => ({
        visitorId,
        name,
        day,
        createdAt: new Date(`${day}T10:00:00Z`),
        language: 'fa',
        ...(campaign ? { campaign } : {}),
      });
      await prisma.growthEvent.createMany({
        data: [
          row(older, 'landing_view', '2030-11-01', {
            utm_source: source,
            utm_medium: 'organic_social',
          }),
          row(older, 'signup_completed', '2030-11-02', {
            utm_source: source,
            utm_medium: 'paid',
          }),
          row(older, 'active_day', '2030-11-03'),
          row(older, 'active_day', '2030-11-09'),
          row(recent, 'signup_completed', '2030-11-12'),
          row(recent, 'active_day', '2030-11-13'),
          row(qa, 'signup_completed', '2030-11-02', { utm_source: 'QA' }),
        ],
      });
      const all = await service.retentionCohorts({}, now);
      expect(all).toEqual([
        {
          week: '2030-11-09',
          signups: 1,
          days: [
            { day: 1, eligible: 0, returned: 0 },
            { day: 7, eligible: 0, returned: 0 },
            { day: 30, eligible: 0, returned: 0 },
          ],
        },
        {
          week: '2030-11-02',
          signups: 1,
          days: [
            { day: 1, eligible: 1, returned: 1 },
            { day: 7, eligible: 1, returned: 1 },
            { day: 30, eligible: 0, returned: 0 },
          ],
        },
      ]);
      expect(
        await service.retentionCohorts(
          { source, medium: 'organic_social' },
          now,
        ),
      ).toEqual([all[1]]);
      expect(
        await service.retentionCohorts({ source, medium: 'paid' }, now),
      ).toEqual([]);
      expect(
        await service.retentionCohorts(
          { source: 'direct', medium: 'unknown' },
          now,
        ),
      ).toEqual([all[0]]);
    });

    it('counts only complete first weeks and distinct in-week active days', async () => {
      const campaign = `first-week-${randomUUID()}`;
      const tags = { utm_source: campaign, utm_campaign: campaign };
      const [retained, late, recent] = Array.from({ length: 3 }, visitor);
      const data = [
        event(retained, 'signup_completed', 8, tags),
        event(retained, 'active_day', 8),
        event(retained, 'active_day', 5),
        event(retained, 'active_day', 2),
        event(late, 'signup_completed', 7, tags),
        event(late, 'active_day', 7),
        event(late, 'active_day', 3),
        event(late, 'first_review_completed', 3),
        event(late, 'active_day', 0),
        event(recent, 'signup_completed', 6, tags),
        event(recent, 'active_day', 6),
        event(recent, 'active_day', 4),
        event(recent, 'active_day', 2),
      ];
      await prisma.growthEvent.createMany({ data });
      const current = await service.campaigns({ campaign });
      expect(current.totals).toMatchObject({
        eligibleSignupVisitors: 2,
        threeDaySignupVisitors: 1,
      });
      expect(current.rows[0]).toMatchObject({
        eligibleSignupVisitors: 2,
        threeDaySignupVisitors: 1,
      });
      const historical = await service.campaigns({
        campaign,
        from: data[0].day,
        to: data[3].day,
      });
      expect(historical.totals).toMatchObject({
        eligibleSignupVisitors: 1,
        threeDaySignupVisitors: 1,
      });
    });

    it('uses the requested Tehran reporting window, defaulting to 30 days', async () => {
      const campaign = `window-${randomUUID()}`;
      await prisma.growthEvent.createMany({
        data: [6, 7, 29, 30, 89, 90].map((ago) =>
          event(visitor(), 'landing_view', ago, { utm_campaign: campaign }),
        ),
      });

      for (const [days, windowDays, landingVisitors] of [
        ['7', 7, 1],
        [undefined, 30, 3],
        ['90', 90, 5],
      ] as const) {
        const report = await service.campaigns({ campaign, days });
        expect(report.windowDays).toBe(windowDays);
        expect(report.totals.landingVisitors).toBe(landingVisitors);
      }
    });

    it('reports an inclusive historical range and rejects dates beyond retention', async () => {
      const campaign = `historical-${randomUUID()}`;
      const events = [5, 6, 7, 8].map((ago) =>
        event(visitor(), 'landing_view', ago, { utm_campaign: campaign }),
      );
      await prisma.growthEvent.createMany({ data: events });
      const report = await service.campaigns({
        campaign,
        from: events[2].day,
        to: events[1].day,
      });
      expect(report).toMatchObject({
        windowDays: 2,
        from: events[2].day,
        to: events[1].day,
      });
      expect(report.totals.landingVisitors).toBe(2);
      await expect(
        service.campaigns({ from: '2000-01-01', to: events[1].day }),
      ).rejects.toThrow();
    });

    it('excludes test visitors even when their QA tag predates the report window', async () => {
      const campaign = `qa-exclusion-${randomUUID()}`;
      const controlSource = `${source}-qa-control`;
      const real = visitor();
      const qa = visitor();
      const tags = { utm_source: controlSource, utm_campaign: campaign };
      const firstInWindow = event(real, 'landing_view', 2, tags);
      const lastInWindow = event(qa, 'first_review_completed', 0);
      await prisma.growthEvent.createMany({
        data: [
          firstInWindow,
          event(qa, 'landing_view', 3, {
            utm_source: 'QA',
            utm_campaign: campaign,
          }),
          event(qa, 'landing_view', 2, tags),
          event(qa, 'signup_completed', 1),
          lastInWindow,
        ],
      });

      const report = await service.campaigns({ campaign });
      expect(report.totals).toEqual({
        landingVisitors: 1,
        signupVisitors: 0,
        completedSignupVisitors: 0,
        activeVisitors: 0,
        firstReviewVisitors: 0,
        eligibleSignupVisitors: 0,
        threeDaySignupVisitors: 0,
      });
      expect(report.rows.map((row) => row.source)).toEqual([controlSource]);
      const custom = await service.campaigns({
        campaign,
        from: firstInWindow.day,
        to: lastInWindow.day,
      });
      expect(custom.totals).toEqual(report.totals);
      expect(custom.rows).toEqual(report.rows);
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
          event(a, 'first_review_completed', 1, undefined, 2),
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
        firstReviewVisitors: 1,
        eligibleSignupVisitors: 0,
        threeDaySignupVisitors: 0,
      });
      expect(exact.rows).toEqual([
        { source, medium: 'social', campaign: 'alpha', ...exact.totals },
      ]);
      const all = await service.campaigns({ source });
      expect(all.totals).toEqual({
        landingVisitors: 3,
        signupVisitors: 2,
        completedSignupVisitors: 2,
        activeVisitors: 2,
        firstReviewVisitors: 1,
        eligibleSignupVisitors: 0,
        threeDaySignupVisitors: 0,
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
