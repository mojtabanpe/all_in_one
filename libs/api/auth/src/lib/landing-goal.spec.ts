import { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '@all-in-one/api/db';
import { AuthService } from './auth.service';
import type { MailService } from './mail.service';

describe('signup landing goal', () => {
  function setup() {
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'new' }),
      },
    };
    return {
      db,
      service: new AuthService(
        db as unknown as PrismaService,
        {} as JwtService,
        {} as MailService,
        new ConfigService({ REQUIRE_EMAIL_VERIFICATION: 'false' }),
      ),
    };
  }
  it('stores the initial choice and history atomically for email signup', async () => {
    const { db, service } = setup();
    await service.register({
      email: 'goal@example.com',
      password: 'password123',
      goal: 'english',
    });
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          onboardingGoal: 'english',
          onboardingGoalChanges: { create: { goal: 'english' } },
        }),
      }),
    );
  });
  it('stores a new phone account’s goal but never overwrites an existing account’s choice', async () => {
    const { db, service } = setup();
    await service.signInByPhone('+989121234567', undefined, 'health');
    expect(db.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        onboardingGoal: 'health',
        onboardingGoalChanges: { create: { goal: 'health' } },
      }),
    });
    db.user.create.mockClear();
    db.user.findUnique.mockResolvedValue({
      id: 'existing',
      onboardingGoal: 'planner',
    } as never);
    const result = await service.signInByPhone(
      '+989121234567',
      undefined,
      'english',
    );
    expect(result).toMatchObject({
      created: false,
      user: { onboardingGoal: 'planner' },
    });
    expect(db.user.create).not.toHaveBeenCalled();
  });
});
