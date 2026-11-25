import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '@all-in-one/api/auth';
import { PrismaService } from '@all-in-one/api/db';
import { CardsService } from '@all-in-one/applets/english-learning/api';
import { GrowthService } from './growth.service';

/** A Tehran wall-clock time (UTC+03:30, no daylight saving). */
const tehran = (day: string, time: string) =>
  new Date(Date.parse(`${day}T${time}:00Z`) - 3.5 * 3_600_000);
const dayOnly = (day: string) => new Date(`${day}T00:00:00Z`);

describe.skipIf(process.env['GROWTH_DB_INTEGRATION'] !== '1')(
  'Account activation PostgreSQL report',
  () => {
    let prisma: PrismaService;
    let service: GrowthService;
    const users: string[] = [];
    const visitors: string[] = [];
    const run = randomUUID().slice(0, 8);
    const activity = `pg002-${run}`;
    const source = `pg002-${run}`;
    // A fixed future "today" (Tehran 2031-03-20 13:30) keeps synthetic rows apart from any real data.
    const now = new Date('2031-03-20T10:00:00Z');

    beforeAll(async () => {
      const url = process.env['DATABASE_URL'];
      if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
        throw new Error('An explicit local database is required');
      prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
      service = new GrowthService(prisma);
      await prisma.activityType.create({
        data: {
          slug: activity,
          name: 'synthetic',
          category: 'cardio',
          met: 3,
          icon: 'x',
        },
      });
    });
    afterAll(async () => {
      if (!prisma) return;
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.growthEvent.deleteMany({
        where: { visitorId: { in: visitors } },
      });
      await prisma.activityType.deleteMany({ where: { slug: activity } });
      await prisma.$disconnect();
    });

    const account = async (
      signedAt: Date,
      extra: {
        role?: 'CUSTOMER' | 'ADMIN';
        signupSource?: string | null;
        signupClient?: string | null;
      } = {},
    ) => {
      const user = await prisma.user.create({
        data: {
          email: `pg002-${randomUUID()}@example.invalid`,
          createdAt: signedAt,
          role: extra.role ?? 'CUSTOMER',
          signupSource: extra.signupSource ?? null,
          signupClient: extra.signupClient ?? null,
        },
      });
      users.push(user.id);
      const list = await prisma.plannerList.create({
        data: { ownerId: user.id, name: 'synthetic' },
      });
      return {
        id: user.id,
        task: (at: Date, seriesId?: string) =>
          prisma.plannerTask.create({
            data: {
              userId: user.id,
              listId: list.id,
              title: 'synthetic',
              createdAt: at,
              ...(seriesId
                ? { seriesId, occurrenceDate: dayOnly('2031-03-09') }
                : {}),
            },
          }),
        meal: (at: Date) =>
          prisma.mealLog.create({
            data: {
              userId: user.id,
              date: at,
              mealType: 'LUNCH',
              description: 'synthetic',
              portions: {},
              score: 0,
              feedback: [],
              createdAt: at,
            },
          }),
        workout: (at: Date) =>
          prisma.workoutLog.create({
            data: {
              userId: user.id,
              activitySlug: activity,
              date: at,
              durationMin: 10,
              createdAt: at,
            },
          }),
        review: (day: string, firstReviewAt: Date | null) =>
          prisma.englishReviewDay.create({
            data: {
              userId: user.id,
              date: dayOnly(day),
              reviews: 1,
              firstReviewAt,
            },
          }),
      };
    };

    it('counts Tehran days 0/1/7 per account with complete-day denominators and no QA, admin or pre-signup actions', async () => {
      // Day 0, 1 and 7 actions; repeated actions and devices on one day count once.
      const full = await account(tehran('2031-03-10', '10:00'), {
        signupSource: source,
        signupClient: 'bazaar',
      });
      await full.task(tehran('2031-03-10', '10:30'));
      await full.task(tehran('2031-03-10', '10:31'));
      await full.review('2031-03-10', tehran('2031-03-10', '11:00'));
      await full.meal(tehran('2031-03-11', '09:00'));
      await full.workout(tehran('2031-03-17', '08:00'));
      // Signed up at 23:59; the 00:01 action belongs to day 1, not day 0.
      const boundary = await account(tehran('2031-03-10', '23:59'), {
        signupSource: source,
        signupClient: 'myket',
      });
      await boundary.task(tehran('2031-03-11', '00:01'));
      // Signed up at 00:01 on the next Tehran day.
      const late = await account(tehran('2031-03-11', '00:01'));
      await late.meal(tehran('2031-03-11', '02:01'));
      // Action only on day 2.
      const day2 = await account(tehran('2031-03-12', '12:00'), {
        signupSource: 'direct',
      });
      await day2.task(tehran('2031-03-14', '12:00'));
      // Day 7 is today, so it is not eligible yet even with an action.
      const young = await account(tehran('2031-03-13', '09:00'), {
        signupSource: 'direct',
      });
      await young.task(tehran('2031-03-13', '09:10'));
      await young.task(tehran('2031-03-20', '09:00'));
      // Signed up today: in the cohort, eligible for nothing yet.
      const today = await account(tehran('2031-03-20', '08:00'));
      await today.task(tehran('2031-03-20', '08:05'));
      // Older account: reviews from before firstReviewAt existed count by day, time unknown.
      const legacy = await account(tehran('2031-03-09', '10:00'));
      await legacy.review('2031-03-09', null);
      await legacy.task(tehran('2031-03-09', '11:00'));
      await legacy.review('2031-03-10', null);
      // A task stamped before signup and a recurring-occurrence copy are not actions.
      const prior = await account(tehran('2031-03-09', '12:00'));
      const series = await prior.task(tehran('2031-03-08', '12:00'));
      await prior.task(tehran('2031-03-09', '13:00'), series.id);
      // QA and admin accounts stay out.
      const qa = await account(tehran('2031-03-10', '10:00'), {
        signupSource: 'QA',
      });
      await qa.task(tehran('2031-03-10', '10:05'));
      const admin = await account(tehran('2031-03-10', '10:00'), {
        role: 'ADMIN',
      });
      await admin.task(tehran('2031-03-10', '10:05'));

      const report = await service.accountActivation(
        { from: '2031-03-01', to: '2031-03-20' },
        now,
      );
      expect(report.overall).toEqual({
        firstAction: { eligible: 7, successful: 4, percent: 57.1 },
        d1: { eligible: 7, successful: 3, percent: 42.9 },
        d7: { eligible: 6, successful: 1, percent: 16.7 },
        // full 30, late 120, young 10; legacy unknown, today not eligible.
        medianFirstActionMinutes: 30,
      });
      expect(report.bySource.map((row) => row.source)).toEqual([
        null,
        'direct',
        source,
      ]);
      expect(report.bySource[2].metrics.firstAction).toEqual({
        eligible: 2,
        successful: 1,
        percent: 50,
      });
      expect(report.bySource[2].metrics.d1.successful).toBe(2);
      expect(report.bySignupPlatform).toEqual([
        expect.objectContaining({ signupPlatform: null }),
        expect.objectContaining({
          signupPlatform: 'bazaar',
          metrics: expect.objectContaining({
            d7: { eligible: 1, successful: 1, percent: 100 },
            medianFirstActionMinutes: 30,
          }),
        }),
        expect.objectContaining({ signupPlatform: 'myket' }),
      ]);
      expect(JSON.stringify(report)).not.toContain(full.id);

      // Both ends are Tehran days: 00:01 on 2031-03-11 is in, 23:59 on 2031-03-10 is out.
      const oneDay = await service.accountActivation(
        { from: '2031-03-11', to: '2031-03-11' },
        now,
      );
      expect(oneDay.overall.firstAction).toEqual({
        eligible: 1,
        successful: 1,
        percent: 100,
      });
      expect(oneDay.overall.medianFirstActionMinutes).toBe(120);

      // Only today's signup: every denominator is zero.
      const onlyToday = await service.accountActivation(
        { from: '2031-03-20', to: '2031-03-20' },
        now,
      );
      expect(onlyToday.overall).toEqual({
        firstAction: { eligible: 0, successful: 0, percent: null },
        d1: { eligible: 0, successful: 0, percent: null },
        d7: { eligible: 0, successful: 0, percent: null },
        medianFirstActionMinutes: null,
      });
    });

    it('reports a window without signups as empty', async () => {
      const report = await service.accountActivation(
        { from: '2031-02-01', to: '2031-02-05' },
        now,
      );
      expect(report.overall.firstAction).toEqual({
        eligible: 0,
        successful: 0,
        percent: null,
      });
      expect(report.bySource).toEqual([]);
      expect(report.bySignupPlatform).toEqual([]);
    });

    it('stores the signup source once at creation, QA tags included, and nothing when opted out', async () => {
      const auth = new AuthService(
        prisma,
        {} as never,
        {} as never,
        new ConfigService({
          REQUIRE_EMAIL_VERIFICATION: 'false',
          GROWTH_ANALYTICS_ENABLED: 'true',
        }),
      );
      const register = async (acquisition?: object) => {
        const user = await auth.register({
          email: `pg002-${randomUUID()}@example.invalid`,
          password: 'synthetic-password',
          ...(acquisition ? { acquisition } : {}),
        } as never);
        users.push(user.id);
        return (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
          .signupSource;
      };
      const visitor = () => {
        const id = randomUUID();
        visitors.push(id);
        return id;
      };
      expect(
        await register({
          visitorId: visitor(),
          language: 'fa',
          campaign: { utm_source: source.toUpperCase() },
        }),
      ).toBe(source);
      expect(await register({ visitorId: visitor(), language: 'fa' })).toBe(
        'direct',
      );
      const qaVisitor = visitor();
      await prisma.growthEvent.create({
        data: {
          visitorId: qaVisitor,
          name: 'landing_view',
          language: 'fa',
          day: '2031-03-01',
          campaign: { utm_source: 'Test' },
        },
      });
      expect(
        await register({
          visitorId: qaVisitor,
          language: 'fa',
          campaign: { utm_source: 'instagram' },
        }),
      ).toBe('test');
      expect(await register()).toBeNull();
    });

    it('keeps the first review time of each review day', async () => {
      const learner = await account(new Date());
      const deck = await prisma.englishDeck.create({
        data: { userId: learner.id, name: 'synthetic' },
      });
      const card = await prisma.englishCard.create({
        data: { deckId: deck.id, userId: learner.id, front: 'a', back: 'b' },
      });
      const cards = new CardsService(prisma, {} as never);
      const before = new Date();
      await cards.review(learner.id, card.id, 'good');
      const [first] = await prisma.englishReviewDay.findMany({
        where: { userId: learner.id },
      });
      expect(first.firstReviewAt?.getTime()).toBeGreaterThanOrEqual(
        before.getTime() - 1,
      );
      await cards.review(learner.id, card.id, 'good');
      const [second] = await prisma.englishReviewDay.findMany({
        where: { userId: learner.id },
      });
      expect(second.reviews).toBe(2);
      expect(second.firstReviewAt).toEqual(first.firstReviewAt);
    });
  },
);
