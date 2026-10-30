import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Prisma, PrismaService } from '@all-in-one/api/db';
import {
  type CreateFocusInput,
  type CreateCountdownInput,
  type FocusQuery,
  type FocusSummary,
  isoDateIn,
  daysBetween,
  nextOccurrence,
  PLANNER_LIMITS,
  type PlannerColor,
  type PlannerCountdown,
  type PlannerFocus,
  type UpdateCountdownInput,
  type UpdateFocusInput,
} from '@all-in-one/applets/planner/contracts';
import { PlannerAccess } from './access.service';

const FOCUS_INCLUDE = {
  task: { select: { title: true } },
} satisfies Prisma.PlannerFocusInclude;
type DbFocus = Prisma.PlannerFocusGetPayload<{ include: typeof FOCUS_INCLUDE }>;

function toFocus(f: DbFocus): PlannerFocus {
  return {
    id: f.id,
    taskId: f.taskId,
    taskTitle: f.task?.title ?? null,
    kind: f.kind,
    startAt: f.startAt.toISOString(),
    endAt: f.endAt.toISOString(),
    durationMin: f.durationMin,
    note: f.note,
  };
}

const MAX_FOCUS_MIN = 12 * 60;

/** Focus records (Pomodoro / stopwatch). A record's duration never changes. */
@Injectable()
export class FocusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlannerAccess,
  ) {}

  /** Records that start in [from, to], at most a month apart. */
  async list(userId: string, { from, to }: FocusQuery): Promise<FocusSummary> {
    const start = new Date(from);
    const end = new Date(to);
    if (end < start) throw new BadRequestException('شروع بعد از پایان است');
    if (end.getTime() - start.getTime() > PLANNER_LIMITS.focusDays * 86_400_000)
      throw new BadRequestException('بازه تمرکز حداکثر یک ماه است');
    const rows = await this.prisma.plannerFocus.findMany({
      where: { userId, startAt: { gte: start, lte: end } },
      include: FOCUS_INCLUDE,
      orderBy: { startAt: 'desc' },
    });
    const records = rows.map(toFocus);
    return {
      records,
      totalMin: records.reduce((sum, r) => sum + r.durationMin, 0),
    };
  }

  async create(userId: string, input: CreateFocusInput): Promise<PlannerFocus> {
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    const minutes = Math.round((endAt.getTime() - startAt.getTime()) / 60_000);
    if (minutes < 1) throw new BadRequestException('تمرکز دست‌کم یک دقیقه است');
    if (minutes > MAX_FOCUS_MIN)
      throw new BadRequestException('تمرکز حداکثر ۱۲ ساعت است');
    if (endAt.getTime() > Date.now() + 60_000)
      throw new BadRequestException('پایان تمرکز در آینده است');
    if (input.taskId) await this.access.task(userId, input.taskId);
    const focus = await this.prisma.plannerFocus.create({
      data: {
        userId,
        taskId: input.taskId ?? null,
        kind: input.kind ?? 'POMODORO',
        startAt,
        endAt,
        durationMin: minutes,
        note: input.note ?? '',
      },
      include: FOCUS_INCLUDE,
    });
    return toFocus(focus);
  }

  /** Changes the note, task or start; the end moves with the start. */
  async update(
    userId: string,
    id: string,
    input: UpdateFocusInput,
  ): Promise<PlannerFocus> {
    const focus = await this.owned(userId, id);
    if (input.taskId) await this.access.task(userId, input.taskId);
    const data: Prisma.PlannerFocusUncheckedUpdateInput = {
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    };
    if (input.startAt) {
      const startAt = new Date(input.startAt);
      const endAt = new Date(
        startAt.getTime() + (focus.endAt.getTime() - focus.startAt.getTime()),
      );
      if (endAt.getTime() > Date.now() + 60_000)
        throw new BadRequestException('پایان تمرکز در آینده است');
      Object.assign(data, { startAt, endAt });
    }
    return toFocus(
      await this.prisma.plannerFocus.update({
        where: { id },
        data,
        include: FOCUS_INCLUDE,
      }),
    );
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.plannerFocus.delete({ where: { id } });
  }

  private async owned(userId: string, id: string) {
    const focus = await this.prisma.plannerFocus.findFirst({
      where: { id, userId },
    });
    if (!focus) throw new NotFoundException('رکورد تمرکز پیدا نشد');
    return focus;
  }
}

/** Countdowns, anniversaries and birthdays. */
@Injectable()
export class CountdownsService {
  constructor(private readonly prisma: PrismaService) {}

  async all(userId: string): Promise<PlannerCountdown[]> {
    const today = isoDateIn(new Date());
    const rows = await this.prisma.plannerCountdown.findMany({
      where: { userId },
    });
    return rows
      .map((c) => {
        const date = c.date.toISOString().slice(0, 10);
        const nextDate = nextOccurrence(date, c.repeatYearly, today);
        return {
          id: c.id,
          title: c.title,
          date,
          kind: c.kind,
          repeatYearly: c.repeatYearly,
          color: c.color as PlannerColor,
          note: c.note,
          nextDate,
          daysLeft: daysBetween(today, nextDate),
        };
      })
      .sort(
        (a, b) =>
          Number(a.daysLeft < 0) - Number(b.daysLeft < 0) ||
          Math.abs(a.daysLeft) - Math.abs(b.daysLeft),
      );
  }

  async create(
    userId: string,
    input: CreateCountdownInput,
  ): Promise<PlannerCountdown> {
    const kind = input.kind ?? 'COUNTDOWN';
    const row = await this.prisma.plannerCountdown.create({
      data: {
        userId,
        title: input.title,
        date: new Date(`${input.date}T00:00:00Z`),
        kind,
        repeatYearly:
          input.repeatYearly ?? (kind === 'BIRTHDAY' || kind === 'ANNIVERSARY'),
        color: input.color ?? 'rose',
        note: input.note ?? '',
      },
    });
    return this.one(userId, row.id);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateCountdownInput,
  ): Promise<PlannerCountdown> {
    await this.owned(userId, id);
    const { date, ...rest } = input;
    await this.prisma.plannerCountdown.update({
      where: { id },
      data: {
        ...rest,
        ...(date ? { date: new Date(`${date}T00:00:00Z`) } : {}),
      },
    });
    return this.one(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.plannerCountdown.delete({ where: { id } });
  }

  private async one(userId: string, id: string): Promise<PlannerCountdown> {
    return (await this.all(userId)).find(
      (c) => c.id === id,
    ) as PlannerCountdown;
  }

  private async owned(userId: string, id: string) {
    const found = await this.prisma.plannerCountdown.count({
      where: { id, userId },
    });
    if (!found) throw new NotFoundException('روزشمار پیدا نشد');
  }
}
