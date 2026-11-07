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
          service().record(userId, 'chat', 200, now),
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
      await service().record(userId, 'tts', 40, now);
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
  },
);
