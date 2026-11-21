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

  it('searches users by name, email and normalized Iranian phone digits', async () => {
    const count = vi.fn().mockResolvedValue(1);
    const findMany = vi.fn().mockResolvedValue([]);
    const controller = new AdminController({
      user: { count, findMany },
    } as never);

    await controller.users({
      page: 2,
      q: '۰۹۱۲۳۴۵',
      role: 'CUSTOMER',
      filter: 'telegram',
    });

    expect(count).toHaveBeenCalledWith({
      where: {
        AND: [
          { role: 'CUSTOMER' },
          {
            OR: [
              { name: { contains: '۰۹۱۲۳۴۵', mode: 'insensitive' } },
              { email: { contains: '۰۹۱۲۳۴۵', mode: 'insensitive' } },
              { phone: { contains: '0912345', mode: 'insensitive' } },
              { phone: { contains: '+98912345', mode: 'insensitive' } },
            ],
          },
          { telegramLink: { isNot: null } },
        ],
      },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 50,
        take: 50,
      }),
    );
  });

  it('filters vpn_friend and vpn_eligible using exact paid VPN entitlement', async () => {
    const now = new Date();
    const future = new Date(now.getTime() + 86_400_000);
    const order = { id: 'order-1', paidAt: now, months: 1, status: 'PAID' };
    const baseUser = {
      email: 'a@example.com',
      name: 'Ali',
      phone: null,
      role: 'CUSTOMER',
      emailVerifiedAt: now,
      phoneVerifiedAt: null,
      createdAt: now,
      enabledApplets: ['planner'],
      onboardingGoal: null,
      onboardingSkipped: false,
      onboardingCompletedAt: null,
      billingSubscription: { paidUntil: future },
      billingOrders: [order],
      billingAdjustments: [],
    };
    const findMany = vi.fn().mockResolvedValue([
      { ...baseUser, id: 'u-friend', vpnFriendCycle: 'order-1' },
      { ...baseUser, id: 'u-eligible', vpnFriendCycle: null },
      { ...baseUser, id: 'u-stale', vpnFriendCycle: 'old-order' },
      {
        ...baseUser,
        id: 'u-manual-only',
        billingOrders: [],
        vpnFriendCycle: 'order-1',
      },
    ]);
    const controller = new AdminController({
      user: { count: vi.fn(), findMany },
    } as never);

    const friends = await controller.users({ filter: 'vpn_friend' });
    expect(friends.total).toBe(1);
    expect(friends.users.map((u) => u.id)).toEqual(['u-friend']);
    expect(friends.users[0]).toMatchObject({
      vpnCanInvite: true,
      vpnFriend: true,
    });

    const eligible = await controller.users({ filter: 'vpn_eligible' });
    expect(eligible.total).toBe(3);
    expect(eligible.users.map((u) => u.id)).toEqual([
      'u-friend',
      'u-eligible',
      'u-stale',
    ]);

    const adminVpn = await controller.users({
      role: 'ADMIN',
      filter: 'vpn_friend',
    });
    expect(adminVpn).toEqual({ total: 0, users: [] });
  });
});
