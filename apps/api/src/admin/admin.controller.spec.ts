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
    const plannerTaskCount = vi.fn().mockResolvedValue(5);
    const prisma = {
      user: {
        count,
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]),
      },
      plannerTask: { count: plannerTaskCount },
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
    // Staff activity is not customer activity, so every content counter skips those accounts.
    expect(plannerTaskCount).toHaveBeenCalledWith({
      where: { userId: { notIn: ['admin-1', 'admin-2'] } },
    });
  });
  it('requires an active purchase to enable the private VPN flag', async () => {
    const now = new Date();
    const tx = {
      $executeRaw: vi.fn(),
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    const controller = new AdminController({
      $transaction: (action: (transaction: typeof tx) => unknown) => action(tx),
    } as never);
    const order = { id: 'order-1', paidAt: now, months: 1, status: 'PAID' };
    const subscription = { paidUntil: new Date(now.getTime() + 86_400_000) };
    const account = { billingOrders: [order], billingAdjustments: [] };
    tx.user.findUnique
      .mockResolvedValueOnce({
        ...account,
        billingSubscription: { paidUntil: new Date(0) },
      })
      .mockResolvedValueOnce({
        ...account,
        billingSubscription: subscription,
        billingOrders: [],
      })
      .mockResolvedValueOnce({ ...account, billingSubscription: subscription });

    await expect(
      controller.setVpnFriend('u1', { enabled: true }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      controller.setVpnFriend('u1', { enabled: true }),
    ).rejects.toMatchObject({ status: 422 });
    expect(tx.user.update).not.toHaveBeenCalled();
    await expect(
      controller.setVpnFriend('u1', { enabled: true }),
    ).resolves.toEqual({ enabled: true });
    expect(tx.user.update).toHaveBeenLastCalledWith({
      where: { id: 'u1' },
      data: { vpnFriendCycle: 'order-1' },
    });

    tx.user.findUnique.mockResolvedValueOnce({
      ...account,
      billingSubscription: null,
    });
    await expect(
      controller.setVpnFriend('u1', { enabled: false }),
    ).resolves.toEqual({ enabled: false });
    expect(tx.user.update).toHaveBeenLastCalledWith({
      where: { id: 'u1' },
      data: { vpnFriendCycle: null },
    });
  });
});
