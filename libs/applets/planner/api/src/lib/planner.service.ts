import { Injectable, NotFoundException } from '@nestjs/common';
import { type PlannerTask as DbTask, PrismaService } from '@all-in-one/api/db';
import type {
  CreateTaskInput,
  ListTasksQuery,
  PlannerArea,
  PlannerTask,
  UpdateTaskInput,
} from '@all-in-one/applets/planner/contracts';

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function toTask(t: DbTask): PlannerTask {
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    date: t.date.toISOString().slice(0, 10),
    time: t.time,
    priority: t.priority,
    area: t.area as PlannerArea,
    done: t.status === 'DONE',
    completedAt: t.completedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class PlannerService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    { from, to }: ListTasksQuery,
  ): Promise<PlannerTask[]> {
    const tasks = await this.prisma.plannerTask.findMany({
      where: { userId, date: { gte: toDate(from), lte: toDate(to) } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }, { createdAt: 'asc' }],
    });
    return tasks.map(toTask);
  }

  async create(userId: string, input: CreateTaskInput): Promise<PlannerTask> {
    const task = await this.prisma.plannerTask.create({
      data: {
        userId,
        title: input.title,
        notes: input.notes ?? null,
        date: toDate(input.date),
        time: input.time ?? null,
        priority: input.priority ?? 'MEDIUM',
        area: input.area ?? 'personal',
      },
    });
    return toTask(task);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateTaskInput,
  ): Promise<PlannerTask> {
    await this.ensureOwned(userId, id);
    const { done, date, ...rest } = input;
    const task = await this.prisma.plannerTask.update({
      where: { id },
      data: {
        ...rest,
        ...(date ? { date: toDate(date) } : {}),
        ...(done === undefined
          ? {}
          : {
              status: done ? 'DONE' : 'TODO',
              completedAt: done ? new Date() : null,
            }),
      },
    });
    return toTask(task);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.ensureOwned(userId, id);
    await this.prisma.plannerTask.delete({ where: { id } });
  }

  private async ensureOwned(userId: string, id: string): Promise<void> {
    const found = await this.prisma.plannerTask.count({
      where: { id, userId },
    });
    if (!found) throw new NotFoundException('کار پیدا نشد');
  }
}
