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
    const [
      users,
      admins,
      newUsersThisWeek,
      plannerTasks,
      englishWordsInReview,
      workouts,
      meals,
      mealPlans,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'ADMIN' } }),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.plannerTask.count(),
      this.prisma.englishWordProgress.count(),
      this.prisma.workoutLog.count(),
      this.prisma.mealLog.count(),
      this.prisma.mealPlan.count(),
    ]);
    return {
      users,
      admins,
      customers: users - admins,
      newUsersThisWeek,
      plannerTasks,
      englishWordsInReview,
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
