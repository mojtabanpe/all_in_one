import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { Roles, toUser } from '@all-in-one/api/auth';
import { PrismaService } from '@all-in-one/api/db';
import type { AdminStats, AdminUserList } from '@all-in-one/shared/schemas';

const PAGE_SIZE = 50;

/** Read-only endpoints for the admin app. */
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
      }),
    ]);
    return { total, users: users.map(toUser) };
  }
}
