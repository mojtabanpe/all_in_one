import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';
import { GrowthService } from './growth.service';

describe.skipIf(process.env['GROWTH_DB_INTEGRATION'] !== '1')(
  'Churn by channel PostgreSQL report',
  () => {
    let prisma: PrismaService;
    let service: GrowthService;
    const ids: string[] = [];
    // A fixed future "today" keeps these rows apart from any real data.
    const now = new Date('2031-03-20T10:00:00Z');
    const source = `churn-${randomUUID().slice(0, 8)}`;
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
    /** An event `ago` Tehran days before `now`. */
    const event = (
      visitorId: string,
      name: string,
      ago: number,
      campaign?: object,
    ) => {
      const createdAt = new Date(now.getTime() - ago * 86_400_000);
      return {
        visitorId,
        name,
        createdAt,
        day: createdAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' }),
        language: 'fa',
        ...(campaign ? { campaign } : {}),
      };
    };

    it('judges mature signups per first channel and keeps QA and young signups out of churn', async () => {
      const telegram = { utm_source: source, utm_medium: 'social' };
      const [kept, churned, never, young, qa, direct] = Array.from(
        { length: 6 },
        visitor,
      );
      await prisma.growthEvent.createMany({
        data: [
          // Active 3 days ago: retained.
          event(kept, 'landing_view', 40, telegram),
          event(kept, 'signup_completed', 30),
          event(kept, 'active_day', 30),
          event(kept, 'active_day', 3),
          // Active only right after signup, then gone for 20 days: churned.
          event(churned, 'landing_view', 40, telegram),
          event(churned, 'signup_completed', 30),
          event(churned, 'active_day', 29),
          event(churned, 'active_day', 20),
          // Never active after signing up: churned and never active.
          event(never, 'landing_view', 25, telegram),
          event(never, 'signup_completed', 25),
          // Signed up 5 days ago: counted, not judged yet.
          event(young, 'landing_view', 5, telegram),
          event(young, 'signup_completed', 5),
          // QA traffic stays out entirely.
          event(qa, 'landing_view', 30, { utm_source: 'QA' }),
          event(qa, 'signup_completed', 30),
          // No campaign: direct / unknown.
          event(direct, 'signup_completed', 20),
          event(direct, 'active_day', 0),
        ],
      });

      const report = await service.churn(now);
      expect(report.inactiveDays).toBe(14);
      expect(report.to).toBe('2031-03-20');
      expect(report.rows.find((row) => row.source === source)).toEqual({
        source,
        medium: 'social',
        signups: 4,
        mature: 3,
        churned: 2,
        neverActive: 1,
      });
      expect(report.rows.find((row) => row.source === 'direct')).toMatchObject({
        medium: 'unknown',
        signups: 1,
        churned: 0,
      });
      expect(report.rows.some((row) => row.source === 'QA')).toBe(false);
      expect(report.totals.signups).toBeGreaterThanOrEqual(5);
    });
  },
);
