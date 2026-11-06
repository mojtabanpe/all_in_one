import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@all-in-one/api/db';
import { IS_PUBLIC } from '@all-in-one/api/auth';
import { onboardingInputSchema } from '@all-in-one/shared/schemas';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';

describe('Onboarding access and validation', () => {
  it('requires authentication and never accepts a client user ID or completion flag', () => {
    const reflector = new Reflector();
    for (const target of [
      OnboardingController,
      OnboardingController.prototype.state,
      OnboardingController.prototype.choose,
    ]) {
      expect(reflector.get(IS_PUBLIC, target)).not.toBe(true);
    }
    expect(onboardingInputSchema.safeParse({ goal: 'planner' }).success).toBe(
      true,
    );
    expect(onboardingInputSchema.safeParse({ goal: null }).success).toBe(true);
    for (const input of [
      { goal: 'other' },
      { goal: 'health', userId: randomUUID() },
      { goal: 'english', completed: true },
    ]) {
      expect(onboardingInputSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe.skipIf(process.env['GROWTH_DB_INTEGRATION'] !== '1')(
  'Onboarding account persistence',
  () => {
    const emails = [0, 1].map(
      () => `onboarding-${randomUUID()}@example.invalid`,
    );
    let prisma: PrismaService;
    let service: OnboardingService;
    const ids: string[] = [];
    beforeAll(async () => {
      const url = process.env['DATABASE_URL'];
      if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
        throw new Error('A local database is required');
      prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
      service = new OnboardingService(prisma);
      for (const email of emails) {
        const user = await prisma.user.create({
          data: { email, passwordHash: 'synthetic-integration-fixture' },
        });
        ids.push(user.id);
      }
    });
    afterAll(async () => {
      if (prisma) {
        await prisma.user.deleteMany({ where: { email: { in: emails } } });
        await prisma.$disconnect();
      }
    });
    it('persists a choice, completes only its matching action and isolates accounts', async () => {
      expect(await service.state(ids[0])).toEqual({
        goal: null,
        skipped: false,
        completed: false,
      });
      await service.choose(ids[0], { goal: 'planner' });
      expect((await new OnboardingService(prisma).state(ids[0])).goal).toBe(
        'planner',
      );
      await service.complete(ids[0], 'health');
      expect((await service.state(ids[0])).completed).toBe(false);
      await Promise.all([
        service.complete(ids[0], 'planner'),
        service.complete(ids[0], 'planner'),
      ]);
      expect((await service.state(ids[0])).completed).toBe(true);
      const completed = await prisma.user.findUniqueOrThrow({
        where: { id: ids[0] },
      });
      await service.complete(ids[0], 'planner');
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: ids[0] } }))
          .onboardingCompletedAt,
      ).toEqual(completed.onboardingCompletedAt);
      expect(await service.state(ids[1])).toEqual({
        goal: null,
        skipped: false,
        completed: false,
      });
    });
    it('can skip or choose a fresh goal without retaining previous completion', async () => {
      expect(await service.choose(ids[0], { goal: null })).toEqual({
        goal: null,
        skipped: true,
        completed: false,
      });
      await service.complete(ids[0], 'planner');
      expect((await service.state(ids[0])).completed).toBe(false);
      expect(await service.choose(ids[0], { goal: 'english' })).toEqual({
        goal: 'english',
        skipped: false,
        completed: false,
      });
      await service.complete(ids[0], 'english');
      expect((await service.state(ids[0])).completed).toBe(true);
    });
  },
);
