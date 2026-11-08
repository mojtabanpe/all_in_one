import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@all-in-one/api/db';
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
  },
);
