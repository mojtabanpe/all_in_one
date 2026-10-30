import { Reflector } from '@nestjs/core';
import { ROLES } from '@all-in-one/api/auth';
import { AdminController } from './admin.controller';

describe('AdminController', () => {
  it('is restricted to admins', () => {
    expect(new Reflector().get(ROLES, AdminController)).toEqual(['ADMIN']);
  });

  it('derives customers from users minus admins', async () => {
    const count = vi
      .fn()
      .mockResolvedValueOnce(10) // users
      .mockResolvedValueOnce(2) // admins
      .mockResolvedValue(0);
    const prisma = {
      user: { count },
      plannerTask: { count: vi.fn().mockResolvedValue(5) },
      englishCard: { count: vi.fn().mockResolvedValue(0) },
      workoutLog: { count: vi.fn().mockResolvedValue(0) },
      mealLog: { count: vi.fn().mockResolvedValue(0) },
      mealPlan: { count: vi.fn().mockResolvedValue(0) },
    };
    const stats = await new AdminController(prisma as never).stats();
    expect(stats).toMatchObject({
      users: 10,
      admins: 2,
      customers: 8,
      plannerTasks: 5,
    });
  });
});
