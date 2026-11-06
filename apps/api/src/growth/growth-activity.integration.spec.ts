import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';
import { GrowthService } from './growth.service';

describe.skipIf(process.env['GROWTH_DB_INTEGRATION'] !== '1')(
  'Growth active-day PostgreSQL cohorts',
  () => {
    const visitors = Array.from({ length: 6 }, () => randomUUID());
    let prisma: PrismaService;
    beforeAll(() => {
      const url = process.env['DATABASE_URL'];
      if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
        throw new Error('An explicitly configured local database is required');
      }
      prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
    });
    afterAll(async () => {
      if (prisma) {
        await prisma.growthEvent.deleteMany({
          where: { visitorId: { in: visitors } },
        });
        await prisma.$disconnect();
      }
    });
    it('deduplicates concurrent activities and counts complete seven-day cohorts only', async () => {
      const service = new GrowthService(prisma);
      const before = (await service.summary()).activity;
      const day = (offset: number) =>
        new Date(Date.now() + offset * 86_400_000).toLocaleDateString('en-CA', {
          timeZone: 'Asia/Tehran',
        });
      const add = (visitorId: string, name: string, offset: number) => ({
        visitorId,
        name,
        day: day(offset),
        language: 'en',
      });
      await prisma.growthEvent.createMany({
        data: [
          add(visitors[0], 'signup_completed', -7),
          ...[-7, -5, -1].map((d) => add(visitors[0], 'active_day', d)),
          add(visitors[1], 'signup_completed', -7),
          ...[-7, -1, 0].map((d) => add(visitors[1], 'active_day', d)), // day 7 is outside first week
          add(visitors[2], 'signup_completed', -6),
          ...[-6, -5, -4].map((d) => add(visitors[2], 'active_day', d)), // immature
          add(visitors[3], 'signup_completed', -30),
          ...[-30, -29, -28].map((d) => add(visitors[3], 'active_day', d)), // outside signup window
          add(visitors[4], 'signup_completed', -8), // mature without any activity
          add(visitors[5], 'active_day', 1), // future activity must not count
        ],
      });
      await Promise.all(
        Array.from({ length: 4 }, () =>
          service.recordActivity(visitors[0], 'en', 'first_task_created'),
        ),
      );
      expect(
        await prisma.growthEvent.count({
          where: {
            visitorId: visitors[0],
            name: 'active_day',
            day: day(0),
          },
        }),
      ).toBe(1);
      expect(
        await prisma.growthEvent.count({
          where: {
            visitorId: visitors[0],
            name: 'first_task_created',
          },
        }),
      ).toBe(1);
      const result = (await service.summary()).activity;
      expect(result.eligibleSignupVisitors).toBe(
        before.eligibleSignupVisitors + 3,
      );
      expect(result.threeDaySignupVisitors).toBe(
        before.threeDaySignupVisitors + 1,
      );
      expect(result.dailyVisitors).toBe(before.dailyVisitors + 2);
      expect(result.weeklyVisitors).toBe(before.weeklyVisitors + 3);
      expect(result.monthlyVisitors).toBe(before.monthlyVisitors + 4);
    });
  },
);
