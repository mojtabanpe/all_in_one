import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import {
  addDays,
  type CheckinInput,
  type CreateHabitInput,
  daysBetween,
  type HabitCheckin,
  type HabitSection,
  habitStreak,
  isoDateIn,
  PLANNER_LIMITS,
  type PlannerColor,
  type PlannerHabit,
  type SectionInput,
  type UpdateHabitInput,
} from '@all-in-one/applets/planner/contracts';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoOf = (date: Date) => date.toISOString().slice(0, 10);

/** Habits with sections and daily check-ins (TickTick habits). */
@Injectable()
export class HabitsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Habits with check-ins in [from, to] (default: the past 90 days). */
  async all(
    userId: string,
    range?: { from: string; to: string },
    includeArchived = false,
  ): Promise<PlannerHabit[]> {
    const today = isoDateIn(new Date());
    const from = range?.from ?? addDays(today, -PLANNER_LIMITS.checkinDays);
    const to = range?.to ?? today;
    if (daysBetween(from, to) < 0 || daysBetween(from, to) > 366)
      throw new BadRequestException('بازه تاریخ حداکثر یک سال است');
    const habits = await this.prisma.plannerHabit.findMany({
      where: { userId, ...(includeArchived ? {} : { archived: false }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (!habits.length) return [];
    const ids = habits.map((h) => h.id);
    // Streaks and totals need the whole history (a few hundred rows a year).
    const checkins = await this.prisma.plannerHabitCheckin.findMany({
      where: { habitId: { in: ids }, value: { gt: 0 } },
      orderBy: { date: 'asc' },
    });
    return habits.map((h) => {
      const own: HabitCheckin[] = checkins
        .filter((c) => c.habitId === h.id)
        .map((c) => ({ date: isoOf(c.date), value: c.value }));
      return {
        id: h.id,
        sectionId: h.sectionId,
        name: h.name,
        icon: h.icon,
        color: h.color as PlannerColor,
        goal: h.goal,
        unit: h.unit,
        weekdays: h.weekdays,
        externalSourceId: h.externalSourceId,
        repeatRule: h.repeatRule,
        reminders: h.reminders,
        archived: h.archived,
        sortOrder: h.sortOrder,
        checkins: own.filter((c) => c.date >= from && c.date <= to),
        streak: habitStreak(h, own, today),
        total: own.filter((c) => c.value >= h.goal).length,
      };
    });
  }

  async get(userId: string, id: string): Promise<PlannerHabit> {
    await this.owned(userId, id);
    const habits = await this.all(userId, undefined, true);
    return habits.find((h) => h.id === id) as PlannerHabit;
  }

  async create(userId: string, input: CreateHabitInput): Promise<PlannerHabit> {
    if (input.externalSourceId) {
      const existing = await this.prisma.plannerHabit.findUnique({
        where: {
          userId_externalSourceId: {
            userId,
            externalSourceId: input.externalSourceId,
          },
        },
      });
      if (existing) return this.get(userId, existing.id);
    }
    if (input.sectionId) await this.section(userId, input.sectionId);
    const count = await this.prisma.plannerHabit.count({ where: { userId } });
    const habit = await this.prisma.plannerHabit.create({
      data: {
        userId,
        name: input.name,
        icon: input.icon ?? 'lucideSparkles',
        color: input.color ?? 'sage',
        goal: input.goal ?? 1,
        unit: input.unit ?? '',
        externalSourceId: input.externalSourceId ?? null,
        repeatRule: input.repeatRule ?? null,
        reminders: [...new Set(input.reminders ?? [])].sort(),
        weekdays: input.weekdays
          ? [...new Set(input.weekdays)].sort()
          : undefined,
        sectionId: input.sectionId ?? null,
        sortOrder: count,
      },
    });
    return this.get(userId, habit.id);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateHabitInput,
  ): Promise<PlannerHabit> {
    await this.owned(userId, id);
    if (input.sectionId) await this.section(userId, input.sectionId);
    await this.prisma.plannerHabit.update({
      where: { id },
      data: {
        ...input,
        ...(input.reminders
          ? { reminders: [...new Set(input.reminders)].sort() }
          : {}),
        ...(input.weekdays
          ? { weekdays: [...new Set(input.weekdays)].sort() }
          : {}),
      },
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.plannerHabit.delete({ where: { id } });
  }

  /** Sets a day's count; only today and the past 90 days. */
  async checkin(
    userId: string,
    id: string,
    input: CheckinInput,
  ): Promise<PlannerHabit> {
    await this.owned(userId, id);
    const today = isoDateIn(new Date());
    const ago = daysBetween(input.date, today);
    if (ago < 0)
      throw new BadRequestException('برای روزهای آینده نمی‌شود ثبت کرد');
    if (ago > PLANNER_LIMITS.checkinDays)
      throw new BadRequestException('فقط تا ۹۰ روز گذشته ثبت می‌شود');
    const key = { habitId_date: { habitId: id, date: day(input.date) } };
    if (input.value === 0)
      await this.prisma.plannerHabitCheckin.deleteMany({
        where: { habitId: id, date: day(input.date) },
      });
    else
      await this.prisma.plannerHabitCheckin.upsert({
        where: key,
        create: { habitId: id, date: day(input.date), value: input.value },
        update: { value: input.value },
      });
    return this.get(userId, id);
  }

  /** Import historical values atomically, preserving original calendar days. */
  async importCheckins(
    userId: string,
    id: string,
    entries: CheckinInput[],
  ): Promise<PlannerHabit> {
    await this.owned(userId, id);
    const today = isoDateIn(new Date());
    if (entries.some((item) => daysBetween(item.date, today) < 0))
      throw new BadRequestException('تاریخ آینده قابل ثبت نیست');
    await this.prisma.$transaction(async (tx) => {
      for (const item of entries) {
        const key = { habitId_date: { habitId: id, date: day(item.date) } };
        if (item.value === 0) {
          await tx.plannerHabitCheckin.deleteMany({
            where: { habitId: id, date: day(item.date) },
          });
        } else {
          await tx.plannerHabitCheckin.upsert({
            where: key,
            create: { habitId: id, date: day(item.date), value: item.value },
            update: { value: item.value },
          });
        }
      }
    });
    return this.get(userId, id);
  }

  // ---- sections

  async sections(userId: string): Promise<HabitSection[]> {
    const rows = await this.prisma.plannerHabitSection.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(({ id, name, sortOrder }) => ({ id, name, sortOrder }));
  }

  async createSection(
    userId: string,
    input: SectionInput,
  ): Promise<HabitSection> {
    const count = await this.prisma.plannerHabitSection.count({
      where: { userId },
    });
    const s = await this.prisma.plannerHabitSection.create({
      data: { userId, name: input.name, sortOrder: input.sortOrder ?? count },
    });
    return { id: s.id, name: s.name, sortOrder: s.sortOrder };
  }

  async updateSection(
    userId: string,
    id: string,
    input: Partial<SectionInput>,
  ): Promise<HabitSection> {
    await this.section(userId, id);
    const s = await this.prisma.plannerHabitSection.update({
      where: { id },
      data: input,
    });
    return { id: s.id, name: s.name, sortOrder: s.sortOrder };
  }

  async removeSection(userId: string, id: string): Promise<void> {
    await this.section(userId, id);
    await this.prisma.plannerHabitSection.delete({ where: { id } });
  }

  private async owned(userId: string, id: string) {
    const found = await this.prisma.plannerHabit.count({
      where: { id, userId },
    });
    if (!found) throw new NotFoundException('عادت پیدا نشد');
  }

  private async section(userId: string, id: string) {
    const found = await this.prisma.plannerHabitSection.count({
      where: { id, userId },
    });
    if (!found) throw new NotFoundException('بخش عادت‌ها پیدا نشد');
  }
}
