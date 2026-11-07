import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';
import { DEFAULT_AI_QUOTAS } from '@all-in-one/shared/schemas';
import type { AiSettingsService } from './ai-settings.service';
import { AiUsageService, usageDay } from './ai-usage.service';

describe('usageDay', () => {
  it('uses the Tehran calendar day', () => {
    // 21:00 UTC is already the next day in Tehran (UTC+3:30).
    expect(usageDay(new Date('2026-11-07T21:00:00Z'))).toBe('2026-11-08');
    expect(usageDay(new Date('2026-11-07T20:00:00Z'))).toBe('2026-11-07');
  });
});

describe.skipIf(process.env['GROWTH_DB_INTEGRATION'] !== '1')(
  'AiUsageService (PostgreSQL)',
  () => {
    let prisma: PrismaService;
    let userId: string;
    const quotas = structuredClone(DEFAULT_AI_QUOTAS);
    quotas.trial.chat = 1000;
    quotas.trial.tts = 50;
    quotas.trial.stt = 2;
    const service = () =>
      new AiUsageService(prisma, {
        quotas: async () => quotas,
        prices: async () => ({
          chatInput: 0.15,
          chatOutput: 0.6,
          tts: 15,
          stt: 0.006,
          usdToToman: 100_000,
        }),
      } as unknown as AiSettingsService);
    const now = new Date('2026-11-07T10:00:00Z');

    beforeAll(async () => {
      const url = process.env['DATABASE_URL'];
      if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
        throw new Error('A local database is required');
      prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
      const user = await prisma.user.create({
        data: {
          email: `usage-${randomUUID()}@example.test`,
          passwordHash: 'x',
        },
      });
      userId = user.id;
    });
    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    });

    it('counts concurrent use once each and refuses once the limit is reached', async () => {
      await Promise.all(
        Array.from({ length: 5 }, () =>
          service().record(userId, 'chat', 200, { tier: 'trial' }, now),
        ),
      );
      await expect(
        service().check(userId, 'trial', 'chat', 0, now),
      ).rejects.toMatchObject({
        status: 429,
        response: { code: 'AI_QUOTA_REACHED', kind: 'chat' },
      });
      // Admins and paid accounts have their own limits.
      await expect(
        service().check(userId, 'staff', 'chat', 0, now),
      ).resolves.toBeUndefined();
      await expect(
        service().check(userId, 'paid', 'chat', 0, now),
      ).resolves.toBeUndefined();
      // A new Tehran day starts empty.
      await expect(
        service().check(
          userId,
          'trial',
          'chat',
          0,
          new Date('2026-11-07T21:00:00Z'),
        ),
      ).resolves.toBeUndefined();

      // Speech is refused when the text itself would pass the limit.
      await service().record(userId, 'tts', 40, {}, now);
      await expect(
        service().check(userId, 'trial', 'tts', 20, now),
      ).rejects.toMatchObject({ status: 429 });
      await expect(
        service().check(userId, 'trial', 'tts', 10, now),
      ).resolves.toBeUndefined();

      expect(await service().view(userId, 'trial', now)).toEqual({
        day: '2026-11-07',
        kinds: {
          chat: { used: 1000, limit: 1000 },
          tts: { used: 40, limit: 50 },
          stt: { used: 0, limit: 2 },
        },
      });
      const overview = await service().overview(now);
      expect(overview.kinds.chat.calls).toBeGreaterThanOrEqual(5);
      expect(overview.kinds.chat.users).toBeGreaterThanOrEqual(1);
    });

    it('prices 30 days of use per service and per tier, output tokens apart', async () => {
      const later = new Date('2026-12-20T10:00:00Z');
      const other = await prisma.user.create({
        data: { email: `cost-${randomUUID()}@example.test`, passwordHash: 'x' },
      });
      try {
        // 1M tokens of which 200k output: 0.8M × 0.15 + 0.2M × 0.6 = $0.24.
        await service().record(
          userId,
          'chat',
          1_000_000,
          { outputUnits: 200_000, tier: 'paid' },
          later,
        );
        // 100k characters at $15 a million: $1.5; 50 recordings at $0.006: $0.3.
        await service().record(
          other.id,
          'tts',
          100_000,
          { tier: 'trial' },
          later,
        );
        for (let i = 0; i < 50; i++)
          await service().record(other.id, 'stt', 1, { tier: 'trial' }, later);
        // Outside the 30-day window.
        await service().record(
          userId,
          'chat',
          5_000_000,
          { tier: 'paid' },
          new Date('2026-11-01T10:00:00Z'),
        );

        const report = await service().costs(30, later);
        expect(report).toMatchObject({
          days: 30,
          to: '2026-12-20',
          from: '2026-11-21',
          priced: true,
          usdToToman: 100_000,
        });
        expect(report.kinds.chat.usd).toBeCloseTo(0.24);
        expect(report.kinds.tts.usd).toBeCloseTo(1.5);
        expect(report.kinds.stt).toMatchObject({ calls: 50, units: 50 });
        expect(report.kinds.stt.usd).toBeCloseTo(0.3);
        expect(report.totalUsd).toBeCloseTo(2.04);
        const paid = report.tiers.find((t) => t.tier === 'paid');
        const trial = report.tiers.find((t) => t.tier === 'trial');
        expect(paid).toMatchObject({ users: 1 });
        expect(paid?.usdPerUserMonth).toBeCloseTo(0.24);
        expect(trial).toMatchObject({ users: 1 });
        expect(trial?.usd).toBeCloseTo(1.8);
      } finally {
        await prisma.user.delete({ where: { id: other.id } });
      }
    });
  },
);
