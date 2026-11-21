import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Put,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Roles, toUser } from '@all-in-one/api/auth';
import { PrismaService } from '@all-in-one/api/db';
import {
  adminVpnFriendSchema,
  type AdminStats,
  type AdminUserList,
  type AdminVpnFriendInput,
} from '@all-in-one/shared/schemas';

import { paidVpnEntitlement, vpnBillingSelect } from '../vpn/vpn-entitlement';

const PAGE_SIZE = 50;

/** Account administration and dashboard totals. */
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  async stats(): Promise<AdminStats> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // Staff accounts are not customers: their own use must never show up in the numbers.
    const staff = await this.prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    const notStaff = { userId: { notIn: staff.map((user) => user.id) } };
    const [
      users,
      admins,
      newUsersThisWeek,
      plannerTasks,
      englishCards,
      workouts,
      meals,
      mealPlans,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'ADMIN' } }),
      this.prisma.user.count({
        where: { createdAt: { gte: weekAgo }, role: 'CUSTOMER' },
      }),
      this.prisma.plannerTask.count({ where: notStaff }),
      this.prisma.englishCard.count({ where: notStaff }),
      this.prisma.workoutLog.count({ where: notStaff }),
      this.prisma.mealLog.count({ where: notStaff }),
      this.prisma.mealPlan.count({ where: notStaff }),
    ]);
    return {
      users,
      admins,
      customers: users - admins,
      newUsersThisWeek,
      plannerTasks,
      englishCards,
      workouts,
      meals,
      mealPlans,
    };
  }

  @Get('users')
  async users(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ): Promise<AdminUserList> {
    const [total, users] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (Math.max(page, 1) - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: vpnBillingSelect,
      }),
    ]);
    const now = new Date();
    return {
      total,
      users: users.map((user) => {
        const entitlement =
          user.role === 'CUSTOMER' ? paidVpnEntitlement(user, now) : null;
        return {
          ...toUser(user),
          vpnCanInvite: !!entitlement,
          vpnFriend: !!entitlement && user.vpnFriendCycle === entitlement.cycle,
        };
      }),
    };
  }

  @Put('users/:id/vpn-friend')
  async setVpnFriend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: adminVpnFriendSchema }) input: AdminVpnFriendInput,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "users" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id, role: 'CUSTOMER' },
        select: vpnBillingSelect,
      });
      if (!user) throw new NotFoundException();
      const entitlement = input.enabled
        ? paidVpnEntitlement(user, new Date())
        : null;
      if (input.enabled && !entitlement) {
        throw new UnprocessableEntityException(
          'An active paid subscription is required.',
        );
      }
      await tx.user.update({
        where: { id },
        data: { vpnFriendCycle: entitlement?.cycle ?? null },
      });
      await tx.user.updateMany({
        where: { id, vpnSyncAt: { not: null } },
        data: { vpnSyncAt: new Date() },
      });
    });
    return input;
  }
}
