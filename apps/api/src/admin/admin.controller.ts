import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Roles, toUser } from '@all-in-one/api/auth';
import { PrismaService, type Prisma } from '@all-in-one/api/db';
import {
  adminUsersQuerySchema,
  adminVpnFriendSchema,
  type AdminStats,
  type AdminUserList,
  type AdminUsersQuery,
  type AdminVpnFriendInput,
} from '@all-in-one/shared/schemas';

import { paidVpnEntitlement, vpnBillingSelect } from '../vpn/vpn-entitlement';

const PAGE_SIZE = 50;

function toAsciiDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

function phoneSearchTerms(query: string): string[] {
  const compact = toAsciiDigits(query).replace(/[\s()-]+/g, '');
  if (!compact) return [];
  const terms = new Set<string>([compact]);
  if (/^09\d*$/.test(compact)) terms.add(`+98${compact.slice(1)}`);
  else if (/^989\d*$/.test(compact)) terms.add(`+${compact}`);
  return [...terms];
}

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
    @Query({ schema: adminUsersQuerySchema }) query: AdminUsersQuery,
  ): Promise<AdminUserList> {
    const page = Math.max(query.page ?? 1, 1);
    const skip = (page - 1) * PAGE_SIZE;
    const now = new Date();
    const filter = query.filter;

    if (
      query.role === 'ADMIN' &&
      (filter === 'vpn_friend' || filter === 'vpn_eligible')
    ) {
      return { total: 0, users: [] };
    }

    const clauses: Prisma.UserWhereInput[] = [];
    if (query.role) clauses.push({ role: query.role });

    const q = query.q?.trim();
    if (q) {
      clauses.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          ...phoneSearchTerms(q).map((phone) => ({
            phone: { contains: phone, mode: 'insensitive' as const },
          })),
        ],
      });
    }

    if (filter === 'paid') {
      clauses.push({ billingSubscription: { is: { paidUntil: { gt: now } } } });
    } else if (filter === 'free') {
      clauses.push({
        NOT: { billingSubscription: { is: { paidUntil: { gt: now } } } },
      });
    } else if (filter === 'telegram') {
      clauses.push({ telegramLink: { isNot: null } });
    } else if (filter === 'vpn_friend' || filter === 'vpn_eligible') {
      clauses.push({
        role: 'CUSTOMER',
        billingSubscription: { is: { paidUntil: { gt: now } } },
        billingOrders: { some: { status: 'PAID', paidAt: { not: null } } },
        ...(filter === 'vpn_friend' ? { vpnFriendCycle: { not: null } } : {}),
      });
    }

    const where: Prisma.UserWhereInput = clauses.length ? { AND: clauses } : {};

    if (filter === 'vpn_friend' || filter === 'vpn_eligible') {
      const candidates = await this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: vpnBillingSelect,
      });
      const matched = candidates.flatMap((user) => {
        const entitlement = paidVpnEntitlement(user, now);
        if (!entitlement) return [];
        const vpnFriend = user.vpnFriendCycle === entitlement.cycle;
        if (filter === 'vpn_friend' && !vpnFriend) return [];
        return [{ ...toUser(user), vpnCanInvite: true, vpnFriend }];
      });
      return {
        total: matched.length,
        users: matched.slice(skip, skip + PAGE_SIZE),
      };
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
        include: vpnBillingSelect,
      }),
    ]);
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
