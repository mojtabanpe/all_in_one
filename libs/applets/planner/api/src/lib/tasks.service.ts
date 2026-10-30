import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Prisma, PrismaService } from '@all-in-one/api/db';
import {
  addDays,
  type ChecklistItem,
  compareTasks,
  type CreateTaskInput,
  daysBetween,
  inWindow,
  PLANNER_LIMITS,
  type PlannerComment,
  type PlannerTask,
  presetWindow,
  type TaskFilter,
  type TimeWindow,
  type UpdateChecklistItemInput,
  type UpdateTaskInput,
} from '@all-in-one/applets/planner/contracts';
import { PlannerAccess } from './access.service';

export const TASK_INCLUDE = {
  tags: { include: { tag: { select: { name: true } } } },
  checklist: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  _count: { select: { comments: true } },
} satisfies Prisma.PlannerTaskInclude;

type DbTask = Prisma.PlannerTaskGetPayload<{ include: typeof TASK_INCLUDE }>;

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoOf = (date: Date) => date.toISOString().slice(0, 10);
/** Start of a Tehran calendar day (Iran keeps +03:30 all year). */
const dayStart = (iso: string) => new Date(`${iso}T00:00:00+03:30`);

function toItem(i: DbTask['checklist'][number]): ChecklistItem {
  return {
    id: i.id,
    title: i.title,
    done: i.done,
    completedAt: i.completedAt?.toISOString() ?? null,
    sortOrder: i.sortOrder,
  };
}

export function toTask(t: DbTask): PlannerTask {
  return {
    id: t.id,
    listId: t.listId,
    sectionId: t.sectionId,
    title: t.title,
    content: t.content,
    kind: t.kind,
    date: t.date ? isoOf(t.date) : null,
    time: t.time,
    priority: t.priority,
    done: t.status === 'DONE',
    completedAt: t.completedAt?.toISOString() ?? null,
    externalSourceId: t.externalSourceId,
    recurrenceRule: t.recurrenceRule,
    reminders: t.reminders,
    timeZone: t.timeZone,
    endTime: t.endTime,
    deletedAt: t.deletedAt?.toISOString() ?? null,
    tags: t.tags
      .map((x) => x.tag.name)
      .sort((a, b) => a.localeCompare(b, 'fa')),
    checklist: t.checklist.map(toItem),
    assigneeId: t.assigneeId,
    createdById: t.userId,
    commentCount: t._count.comments,
    sortOrder: t.sortOrder,
    createdAt: t.createdAt.toISOString(),
  };
}

function checkRange(from: string, to: string, max: number, what: string) {
  const span = daysBetween(from, to);
  if (span < 0) throw new BadRequestException('تاریخ شروع بعد از پایان است');
  if (span >= max)
    throw new BadRequestException(
      `${what} حداکثر ${max.toLocaleString('fa-IR')} روز است`,
    );
}

/**
 * Tasks with TickTick's operations: queries (search, presets, date ranges,
 * completed, multi-condition filter), create and batch create, update and
 * batch update, complete (one, or up to 20 in a list), move, checklist
 * items, comments, assignment and the trash.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlannerAccess,
  ) {}

  // ---------------------------------------------------------------- queries

  async filter(userId: string, f: TaskFilter): Promise<PlannerTask[]> {
    const lists = await this.access.listIds(userId);
    const listIds = f.listIds
      ? lists.filter((id) => f.listIds?.includes(id))
      : lists;
    let window: TimeWindow | undefined;
    const and: Prisma.PlannerTaskWhereInput[] = [];
    const where: Prisma.PlannerTaskWhereInput = {
      listId: { in: listIds },
      deletedAt: null,
      AND: and,
    };

    let status = f.status ?? 'open';
    if (f.preset) {
      window = presetWindow(f.preset, new Date());
      status = 'open';
    }
    if (f.completedFrom || f.completedTo) {
      const from = f.completedFrom ?? f.completedTo ?? '';
      const to = f.completedTo ?? from;
      checkRange(
        from,
        to,
        PLANNER_LIMITS.completedDays,
        'بازه کارهای انجام‌شده',
      );
      status = 'done';
      and.push({
        completedAt: { gte: dayStart(from), lt: dayStart(addDays(to, 1)) },
      });
    }
    if (status !== 'all') where.status = status === 'done' ? 'DONE' : 'TODO';

    const from = window?.from ?? f.from;
    const to = window?.to ?? f.to;
    if (from || to) {
      if (from && to)
        checkRange(from, to, PLANNER_LIMITS.filterDays, 'بازه تاریخ');
      const range = {
        date: {
          ...(from ? { gte: day(from) } : {}),
          ...(to ? { lte: day(to) } : {}),
        },
      };
      and.push(f.undated ? { OR: [range, { date: null }] } : range);
    } else if (f.undated === false) {
      and.push({ date: { not: null } });
    } else if (f.undated) {
      and.push({ date: null });
    }

    if (f.q) {
      and.push({
        OR: [
          { title: { contains: f.q, mode: 'insensitive' } },
          { content: { contains: f.q, mode: 'insensitive' } },
          {
            checklist: {
              some: { title: { contains: f.q, mode: 'insensitive' } },
            },
          },
        ],
      });
    }
    if (f.tags?.length)
      and.push({ tags: { some: { tag: { name: { in: f.tags } } } } });
    if (f.priorities?.length) where.priority = { in: f.priorities };
    if (f.kind) where.kind = f.kind;
    if (f.assigneeId)
      where.assigneeId =
        f.assigneeId === 'me'
          ? userId
          : f.assigneeId === 'none'
            ? null
            : f.assigneeId;

    const rows = await this.prisma.plannerTask.findMany({
      where,
      include: TASK_INCLUDE,
      orderBy: [{ date: 'asc' }, { time: 'asc' }, { sortOrder: 'asc' }],
      take: f.limit ?? PLANNER_LIMITS.results,
    });
    let tasks = rows.map(toTask);
    if (window?.after || window?.before) {
      const cut = window;
      tasks = tasks.filter((t) => inWindow(t, cut));
    }
    return tasks.sort(compareTasks);
  }

  /** Undone tasks due in a date range of at most 14 days. */
  undoneInRange(userId: string, from: string, to: string) {
    checkRange(from, to, PLANNER_LIMITS.rangeDays, 'بازه تاریخ');
    return this.filter(userId, { from, to, status: 'open' });
  }

  async get(userId: string, id: string): Promise<PlannerTask> {
    await this.access.task(userId, id);
    return toTask(
      await this.prisma.plannerTask.findUniqueOrThrow({
        where: { id },
        include: TASK_INCLUDE,
      }),
    );
  }

  // ---------------------------------------------------------------- writes

  async create(userId: string, input: CreateTaskInput): Promise<PlannerTask> {
    if (input.externalSourceId) {
      const existing = await this.prisma.plannerTask.findUnique({
        where: { userId_externalSourceId: { userId, externalSourceId: input.externalSourceId } },
        include: TASK_INCLUDE,
      });
      if (existing) return toTask(existing);
    }
    const listId = input.listId ?? (await this.access.inbox(userId)).id;
    await this.access.list(userId, listId);
    if (input.sectionId) await this.access.section(listId, input.sectionId);
    if (input.assigneeId) await this.access.member(listId, input.assigneeId);
    const tagIds = await this.tagIds(userId, input.tags ?? []);
    const count = await this.prisma.plannerTask.count({ where: { listId } });
    const date = input.date ?? null;
    const task = await this.prisma.plannerTask.create({
      data: {
        userId,
        listId,
        sectionId: input.sectionId ?? null,
        assigneeId: input.assigneeId ?? null,
        title: input.title,
        content: input.content ?? '',
        kind: input.kind ?? 'TASK',
        date: date ? day(date) : null,
        time: date ? (input.time ?? null) : null,
        priority: input.priority ?? 'NONE',
        externalSourceId: input.externalSourceId ?? null,
        recurrenceRule: input.recurrenceRule ?? null,
        reminders: input.reminders ?? [],
        timeZone: input.timeZone ?? null,
        endTime: input.endTime ?? null,
        ...(input.completedAt ? { status: 'DONE' as const, completedAt: new Date(input.completedAt) } : {}),
        sortOrder: count,
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
        checklist: {
          create: (input.checklist ?? []).map((item, i) => ({
            title: item.title,
            done: item.done ?? false,
            completedAt: item.done ? new Date() : null,
            sortOrder: i,
          })),
        },
      },
      include: TASK_INCLUDE,
    });
    return toTask(task);
  }

  async createMany(
    userId: string,
    inputs: CreateTaskInput[],
  ): Promise<PlannerTask[]> {
    const created: PlannerTask[] = [];
    for (const input of inputs) created.push(await this.create(userId, input));
    return created;
  }

  async update(
    userId: string,
    id: string,
    input: UpdateTaskInput,
  ): Promise<PlannerTask> {
    const task = await this.access.task(userId, id);
    if (task.deletedAt)
      throw new BadRequestException('این کار در سطل زباله است؛ اول برش گردان');
    const listId = input.listId ?? task.listId;
    const moved = listId !== task.listId;
    if (moved) await this.access.list(userId, listId);
    const sectionId =
      input.sectionId !== undefined
        ? input.sectionId
        : moved
          ? null
          : task.sectionId;
    if (sectionId) await this.access.section(listId, sectionId);

    let assigneeId =
      input.assigneeId !== undefined ? input.assigneeId : task.assigneeId;
    if (assigneeId && input.assigneeId !== undefined)
      await this.access.member(listId, assigneeId);
    else if (assigneeId && moved) {
      const stays = await this.prisma.plannerListMember.count({
        where: { listId, userId: assigneeId },
      });
      if (!stays) assigneeId = null;
    }

    const date =
      input.date !== undefined
        ? input.date
        : task.date
          ? isoOf(task.date)
          : null;
    const data: Prisma.PlannerTaskUncheckedUpdateInput = {
      listId,
      sectionId,
      assigneeId,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.recurrenceRule !== undefined ? { recurrenceRule: input.recurrenceRule } : {}),
      ...(input.reminders !== undefined ? { reminders: input.reminders } : {}),
      ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
      ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      date: date ? day(date) : null,
      time: !date ? null : input.time !== undefined ? input.time : task.time,
    };
    if (input.done !== undefined && input.done !== (task.status === 'DONE')) {
      data.status = input.done ? 'DONE' : 'TODO';
      data.completedAt = input.done ? new Date() : null;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.plannerTask.update({ where: { id }, data });
      if (input.tags) {
        const tagIds = await this.tagIds(userId, input.tags, tx);
        await tx.plannerTaskTag.deleteMany({ where: { taskId: id } });
        await tx.plannerTaskTag.createMany({
          data: tagIds.map((tagId) => ({ taskId: id, tagId })),
        });
      }
      if (input.checklist) {
        await tx.plannerChecklistItem.deleteMany({ where: { taskId: id } });
        await tx.plannerChecklistItem.createMany({
          data: input.checklist.map((item, i) => ({
            taskId: id,
            title: item.title,
            done: item.done ?? false,
            completedAt: item.done ? new Date() : null,
            sortOrder: i,
          })),
        });
      }
    });
    return this.get(userId, id);
  }

  async updateMany(
    userId: string,
    inputs: (UpdateTaskInput & { id: string })[],
  ): Promise<PlannerTask[]> {
    const updated: PlannerTask[] = [];
    for (const { id, ...input } of inputs)
      updated.push(await this.update(userId, id, input));
    return updated;
  }

  /** Completes up to 20 tasks of one list; returns how many changed. */
  async completeInList(
    userId: string,
    listId: string,
    taskIds: string[],
  ): Promise<{ completed: number }> {
    await this.access.list(userId, listId);
    const { count } = await this.prisma.plannerTask.updateMany({
      where: { id: { in: taskIds }, listId, status: 'TODO', deletedAt: null },
      data: { status: 'DONE', completedAt: new Date() },
    });
    return { completed: count };
  }

  // ---------------------------------------------------------------- trash

  async trash(userId: string, id: string): Promise<void> {
    await this.access.task(userId, id);
    await this.prisma.plannerTask.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async restore(userId: string, id: string): Promise<PlannerTask> {
    await this.access.task(userId, id);
    await this.prisma.plannerTask.update({
      where: { id },
      data: { deletedAt: null },
    });
    return this.get(userId, id);
  }

  async trashed(userId: string): Promise<PlannerTask[]> {
    const rows = await this.prisma.plannerTask.findMany({
      where: {
        listId: { in: await this.access.listIds(userId) },
        deletedAt: { not: null },
      },
      include: TASK_INCLUDE,
      orderBy: { deletedAt: 'desc' },
      take: PLANNER_LIMITS.results,
    });
    return rows.map(toTask);
  }

  /** Deletes one trashed task, or the whole trash, for good. */
  async purge(userId: string, id?: string): Promise<void> {
    if (id) {
      const task = await this.access.task(userId, id);
      if (!task.deletedAt)
        throw new BadRequestException(
          'فقط کارهای سطل زباله برای همیشه حذف می‌شوند',
        );
    }
    await this.prisma.plannerTask.deleteMany({
      where: {
        ...(id ? { id } : {}),
        listId: { in: await this.access.listIds(userId) },
        deletedAt: { not: null },
      },
    });
  }

  // ---------------------------------------------------------------- checklist

  async addItem(
    userId: string,
    taskId: string,
    title: string,
  ): Promise<PlannerTask> {
    await this.access.task(userId, taskId);
    const count = await this.prisma.plannerChecklistItem.count({
      where: { taskId },
    });
    if (count >= 100) throw new BadRequestException('حداکثر ۱۰۰ زیرکار');
    await this.prisma.plannerChecklistItem.create({
      data: { taskId, title, sortOrder: count },
    });
    return this.get(userId, taskId);
  }

  async updateItem(
    userId: string,
    taskId: string,
    itemId: string,
    input: UpdateChecklistItemInput,
  ): Promise<PlannerTask> {
    await this.item(userId, taskId, itemId);
    await this.prisma.plannerChecklistItem.update({
      where: { id: itemId },
      data: {
        ...input,
        ...(input.done === undefined
          ? {}
          : { completedAt: input.done ? new Date() : null }),
      },
    });
    return this.get(userId, taskId);
  }

  async removeItem(
    userId: string,
    taskId: string,
    itemId: string,
  ): Promise<PlannerTask> {
    await this.item(userId, taskId, itemId);
    await this.prisma.plannerChecklistItem.delete({ where: { id: itemId } });
    return this.get(userId, taskId);
  }

  private async item(userId: string, taskId: string, itemId: string) {
    await this.access.task(userId, taskId);
    const found = await this.prisma.plannerChecklistItem.count({
      where: { id: itemId, taskId },
    });
    if (!found) throw new NotFoundException('زیرکار پیدا نشد');
  }

  // ---------------------------------------------------------------- comments

  async comments(userId: string, taskId: string): Promise<PlannerComment[]> {
    await this.access.task(userId, taskId);
    const rows = await this.prisma.plannerComment.findMany({
      where: { taskId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((c) => ({
      id: c.id,
      taskId: c.taskId,
      userId: c.userId,
      author: c.user.name || c.user.email,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      mine: c.userId === userId,
    }));
  }

  async addComment(
    userId: string,
    taskId: string,
    body: string,
  ): Promise<PlannerComment[]> {
    await this.access.task(userId, taskId);
    await this.prisma.plannerComment.create({ data: { taskId, userId, body } });
    return this.comments(userId, taskId);
  }

  async removeComment(userId: string, commentId: string): Promise<void> {
    const comment = await this.prisma.plannerComment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('یادداشت پیدا نشد');
    await this.access.task(userId, comment.taskId);
    if (comment.userId !== userId)
      throw new ForbiddenException('فقط نویسنده می‌تواند حذفش کند');
    await this.prisma.plannerComment.delete({ where: { id: commentId } });
  }

  // ---------------------------------------------------------------- tags

  /** The acting user's tag ids for these names, creating missing tags. */
  private async tagIds(
    userId: string,
    names: string[],
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<string[]> {
    const unique = [...new Set(names)];
    const ids: string[] = [];
    for (const name of unique) {
      const tag = await tx.plannerTag.upsert({
        where: { userId_name: { userId, name } },
        create: { userId, name },
        update: {},
      });
      ids.push(tag.id);
    }
    return ids;
  }
}
