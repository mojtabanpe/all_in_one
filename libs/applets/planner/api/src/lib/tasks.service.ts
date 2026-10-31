import { nativeTaskInput } from './task-input';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Prisma, PrismaService } from '@all-in-one/api/db';
import {
  addDays,
  normalizeRepeatRule,
  OCCURRENCE_ID,
  zonedInstant,
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

import { TASK_INCLUDE, toTask } from './task-mapping';
export { TASK_INCLUDE, toTask } from './task-mapping';
import { RecurrencesService } from './recurrences.service';
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoOf = (date: Date) => date.toISOString().slice(0, 10);
const dayStart = (iso: string) => {
  const start =
    zonedInstant(iso, '00:00', 'Asia/Tehran') ??
    zonedInstant(iso, '01:00', 'Asia/Tehran');
  if (!start) throw new BadRequestException('تاریخ معتبر نیست');
  return start;
};

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
    private readonly recurrence: RecurrencesService,
  ) {}

  recurring(userId: string) {
    return this.recurrence.series(userId);
  }

  // ---------------------------------------------------------------- queries

  async filter(
    userId: string,
    f: TaskFilter,
    forReminders = false,
  ): Promise<PlannerTask[]> {
    const lists = await this.access.listIds(userId);
    const listIds = f.listIds
      ? lists.filter((id) => f.listIds?.includes(id))
      : lists;
    let window: TimeWindow | undefined;
    const and: Prisma.PlannerTaskWhereInput[] = [];
    const where: Prisma.PlannerTaskWhereInput = {
      listId: { in: listIds },
      deletedAt: null,
      isSeries: false,
      OR: [{ seriesId: null }, { series: { deletedAt: null } }],
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
      take: forReminders ? undefined : (f.limit ?? PLANNER_LIMITS.results),
    });
    const virtual = await this.recurrence.projected(
      listIds,
      { ...f, status },
      from,
      to,
    );
    let tasks = [
      ...rows.map(toTask),
      ...virtual.map(toTask).filter((t) => {
        if (
          f.q &&
          ![t.title, t.content, ...t.checklist.map((i) => i.title)].some((x) =>
            x.toLocaleLowerCase().includes(f.q!.toLocaleLowerCase()),
          )
        )
          return false;
        if (f.tags?.length && !t.tags.some((tag) => f.tags!.includes(tag)))
          return false;
        if (f.priorities?.length && !f.priorities.includes(t.priority))
          return false;
        if (f.kind && t.kind !== f.kind) return false;
        if (
          f.assigneeId &&
          t.assigneeId !==
            (f.assigneeId === 'me'
              ? userId
              : f.assigneeId === 'none'
                ? null
                : f.assigneeId)
        )
          return false;
        return true;
      }),
    ];
    if (window?.after || window?.before) {
      const cut = window;
      tasks = tasks.filter((t) => inWindow(t, cut));
    }
    return tasks
      .sort(compareTasks)
      .slice(0, forReminders ? undefined : (f.limit ?? PLANNER_LIMITS.results));
  }

  /** Undone tasks due in a date range of at most 14 days. */
  undoneInRange(userId: string, from: string, to: string) {
    checkRange(from, to, PLANNER_LIMITS.rangeDays, 'بازه تاریخ');
    return this.filter(userId, { from, to, status: 'open' });
  }

  async get(userId: string, id: string): Promise<PlannerTask> {
    if (OCCURRENCE_ID.test(id))
      return toTask(await this.recurrence.read(userId, id));
    id = (await this.access.task(userId, id)).id;
    return toTask(
      await this.prisma.plannerTask.findUniqueOrThrow({
        where: { id },
        include: TASK_INCLUDE,
      }),
    );
  }

  // ---------------------------------------------------------------- writes

  async create(userId: string, input: CreateTaskInput): Promise<PlannerTask> {
    input = nativeTaskInput(input);
    if (input.externalSourceId) {
      const existing = await this.prisma.plannerTask.findUnique({
        where: {
          userId_externalSourceId: {
            userId,
            externalSourceId: input.externalSourceId,
          },
        },
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
    if (input.repeatRule && (!date || input.kind === 'NOTE'))
      throw new BadRequestException('تکرار به تاریخ شروع و نوع کار نیاز دارد');
    if (input.recurrenceEnd && date && input.recurrenceEnd < date)
      throw new BadRequestException('پایان تکرار قبل از شروع است');
    if (input.idempotencyKey) {
      const existing = await this.prisma.plannerTask.findUnique({
        where: {
          userId_idempotencyKey: {
            userId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: TASK_INCLUDE,
      });
      if (existing) return toTask(existing);
    }
    const createArgs = {
      data: {
        userId,
        listId,
        idempotencyKey: input.idempotencyKey,
        isSeries: !!input.repeatRule,
        repeatRule: input.repeatRule
          ? normalizeRepeatRule(input.repeatRule)
          : null,
        repeatFrom: input.repeatFrom,
        recurrenceEnd: input.recurrenceEnd ? day(input.recurrenceEnd) : null,
        recurrenceTimezone: input.recurrenceTimezone,
        durationMin: input.durationMin,
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
        ...(input.completedAt && !input.repeatRule
          ? {
              status: 'DONE' as const,
              completedAt: new Date(input.completedAt),
            }
          : {}),
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
    } satisfies Prisma.PlannerTaskCreateArgs;
    const unique = input.externalSourceId
      ? {
          userId_externalSourceId: {
            userId,
            externalSourceId: input.externalSourceId,
          },
        }
      : input.idempotencyKey
        ? {
            userId_idempotencyKey: {
              userId,
              idempotencyKey: input.idempotencyKey,
            },
          }
        : undefined;
    const task = await this.prisma
      .$transaction(async (tx) => {
        const created = unique
          ? await tx.plannerTask.upsert({
              where: unique,
              create: createArgs.data,
              update: {},
              include: TASK_INCLUDE,
            })
          : await tx.plannerTask.create(createArgs);
        if (input.completedAt && input.repeatRule && date) {
          const occurrenceDate = day(date);
          const existing = await tx.plannerTask.findUnique({
            where: {
              seriesId_occurrenceDate: { seriesId: created.id, occurrenceDate },
            },
          });
          if (!existing) {
            await tx.plannerTask.create({
              data: this.recurrence.snapshot(
                {
                  ...created,
                  status: 'DONE',
                  completedAt: new Date(input.completedAt),
                },
                created.id,
                date,
              ),
            });
            if (input.repeatFrom === 'COMPLETION')
              await tx.plannerTask.update({
                where: { id: created.id },
                data: this.recurrence.initialCompletion(
                  new Date(input.completedAt),
                  input.repeatRule,
                  input.time ?? null,
                  input.recurrenceTimezone ?? 'Asia/Tehran',
                  input.recurrenceEnd ?? null,
                  date,
                ),
              });
          }
        }
        return created;
      })
      .catch(async (error) => {
        if (unique && error.code === 'P2002')
          return this.prisma.plannerTask.findFirstOrThrow({
            where: {
              userId,
              OR: [
                ...(input.externalSourceId
                  ? [{ externalSourceId: input.externalSourceId }]
                  : []),
                ...(input.idempotencyKey
                  ? [{ idempotencyKey: input.idempotencyKey }]
                  : []),
              ],
            },
            include: TASK_INCLUDE,
          });
        throw error;
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
    if (input.recurrenceScope === 'SERIES' && OCCURRENCE_ID.test(id)) {
      const occurrence = await this.recurrence.read(userId, id);
      id = occurrence.seriesId ?? occurrence.id;
    }
    let task = await this.access.task(userId, id);
    id = task.id;
    input = nativeTaskInput(input, task);
    if (task.seriesId) {
      const root = await this.prisma.plannerTask.findUniqueOrThrow({
        where: { id: task.seriesId },
      });
      if (root.deletedAt) throw new BadRequestException('سری در سطل زباله است');
    }
    if (task.isSeries && input.recurrenceScope === 'FUTURE')
      throw new BadRequestException('برای تغییر آینده، یک نوبت را انتخاب کن');
    if (task.seriesId && input.recurrenceScope === 'FUTURE') {
      if (input.done !== undefined)
        throw new BadRequestException(
          'انجام نوبت و تغییر سری را جداگانه انجام بده',
        );
      const targetList = input.listId ?? task.listId;
      await this.access.list(userId, targetList);
      if (input.sectionId)
        await this.access.section(targetList, input.sectionId);
      if (input.assigneeId)
        await this.access.member(targetList, input.assigneeId);
      if (input.date === null || input.kind === 'NOTE')
        throw new BadRequestException('سری به تاریخ شروع و نوع کار نیاز دارد');
      const occurrence = await this.prisma.plannerTask.findUniqueOrThrow({
        where: { id },
        include: TASK_INCLUDE,
      });
      const forkId = await this.recurrence.fork(userId, occurrence, input);
      return this.get(userId, forkId);
    }
    if (task.seriesId && input.recurrenceScope === 'SERIES') {
      id = task.seriesId;
      task = await this.access.task(userId, id);
    }
    const recurrenceEdit = [
      'repeatRule',
      'repeatFrom',
      'recurrenceEnd',
      'recurrenceTimezone',
    ].some((k) => Object.hasOwn(input, k));
    if (task.seriesId && recurrenceEdit)
      throw new BadRequestException(
        'تنظیم تکرار را برای کل سری یا این نوبت و آینده تغییر بده',
      );
    if (task.isSeries && input.done !== undefined)
      throw new BadRequestException(
        'برای انجام یا بازکردن، شناسه یک نوبت را انتخاب کن',
      );
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
    const repeatRule =
      input.repeatRule !== undefined ? input.repeatRule : task.repeatRule;
    const end =
      input.recurrenceEnd !== undefined
        ? input.recurrenceEnd
        : task.recurrenceEnd
          ? isoOf(task.recurrenceEnd)
          : null;
    if (
      repeatRule &&
      !task.seriesId &&
      (!date || (input.kind ?? task.kind) === 'NOTE')
    )
      throw new BadRequestException('تکرار به تاریخ شروع و نوع کار نیاز دارد');
    if (end && date && end < date)
      throw new BadRequestException('پایان تکرار قبل از شروع است');
    const data: Prisma.PlannerTaskUncheckedUpdateInput = {
      ...(input.repeatRule !== undefined
        ? {
            repeatRule: input.repeatRule
              ? normalizeRepeatRule(input.repeatRule)
              : null,
            isSeries: task.isSeries || !!input.repeatRule,
          }
        : {}),
      ...(input.repeatFrom !== undefined
        ? { repeatFrom: input.repeatFrom }
        : {}),
      ...(input.recurrenceTimezone !== undefined
        ? { recurrenceTimezone: input.recurrenceTimezone }
        : {}),
      ...(input.recurrenceEnd !== undefined
        ? {
            recurrenceEnd: input.recurrenceEnd
              ? day(input.recurrenceEnd)
              : null,
          }
        : {}),
      ...(input.durationMin !== undefined
        ? { durationMin: input.durationMin }
        : {}),
      listId,
      sectionId,
      assigneeId,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.recurrenceRule !== undefined
        ? { recurrenceRule: input.recurrenceRule }
        : {}),
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
      if (task.isSeries) {
        await tx.$queryRaw`SELECT id FROM planner_tasks WHERE id=${id}::uuid FOR UPDATE`;
        if (
          input.repeatFrom &&
          input.repeatFrom !== task.repeatFrom &&
          (await tx.plannerTask.count({ where: { seriesId: id } }))
        )
          throw new BadRequestException(
            'پس از ثبت نوبت‌ها، مبنای تکرار را با گزینه این نوبت و آینده تغییر بده',
          );
      }
      if (input.done !== undefined) {
        await this.recurrence.complete(tx, id, input.done);
        // Preserve the first completion timestamp when a completion is retried.
        if (input.done) {
          const current = await tx.plannerTask.findUniqueOrThrow({
            where: { id },
          });
          data.status = 'DONE';
          data.completedAt = current.completedAt ?? new Date();
        }
      }
      if (
        !task.isSeries &&
        !task.seriesId &&
        input.repeatRule &&
        task.status === 'DONE'
      ) {
        const original = await tx.plannerTask.findUniqueOrThrow({
          where: { id },
          include: TASK_INCLUDE,
        });
        await tx.plannerTask.create({
          data: this.recurrence.snapshot(
            { ...original, repeatRule: input.repeatRule },
            id,
            original.date ? isoOf(original.date) : date!,
          ),
        });
        data.status = 'TODO';
        data.completedAt = null;
        if ((input.repeatFrom ?? task.repeatFrom) === 'COMPLETION')
          Object.assign(
            data,
            this.recurrence.initialCompletion(
              original.completedAt ?? new Date(),
              input.repeatRule,
              input.time !== undefined ? input.time : task.time,
              input.recurrenceTimezone ?? task.recurrenceTimezone,
              end,
              original.date ? isoOf(original.date) : (date ?? undefined),
            ),
          );
      }
      await tx.plannerTask.update({ where: { id }, data });
      if (task.isSeries) {
        const inherited: Prisma.PlannerTaskUncheckedUpdateManyInput = {};
        for (const key of [
          'title',
          'content',
          'kind',
          'priority',
          'time',
          'durationMin',
          'recurrenceRule',
          'timeZone',
          'endTime',
          'reminders',
          'repeatRule',
          'repeatFrom',
          'recurrenceEnd',
          'recurrenceTimezone',
          'listId',
          'sectionId',
          'assigneeId',
        ] as const) {
          if (input[key] !== undefined)
            Object.assign(inherited, { [key]: data[key] });
        }
        if (input.listId !== undefined)
          Object.assign(inherited, {
            sectionId: data.sectionId,
            assigneeId: data.assigneeId,
          });
        if (input.repeatRule === null) inherited.deletedAt = new Date();
        await tx.plannerTask.updateMany({
          where: { seriesId: id, status: 'TODO', deletedAt: null },
          data: inherited,
        });
        if (input.tags || input.checklist) {
          const pending = await tx.plannerTask.findMany({
            where: { seriesId: id, status: 'TODO', deletedAt: null },
            select: { id: true },
          });
          for (const child of pending) {
            if (input.tags) {
              const ids = await this.tagIds(userId, input.tags, tx);
              await tx.plannerTaskTag.deleteMany({
                where: { taskId: child.id },
              });
              await tx.plannerTaskTag.createMany({
                data: ids.map((tagId) => ({ taskId: child.id, tagId })),
              });
            }
            if (input.checklist) {
              await tx.plannerChecklistItem.deleteMany({
                where: { taskId: child.id },
              });
              await tx.plannerChecklistItem.createMany({
                data: input.checklist.map((item, i) => ({
                  taskId: child.id,
                  title: item.title,
                  done: item.done ?? false,
                  completedAt: item.done ? new Date() : null,
                  sortOrder: i,
                })),
              });
            }
          }
        }
      }
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
    let completed = 0;
    for (const id of [...new Set(taskIds)]) {
      const task = await this.access.task(userId, id);
      if (task.listId !== listId)
        throw new BadRequestException('کار در این فهرست نیست');
      if (task.status !== 'DONE' && !task.deletedAt) {
        await this.update(userId, id, { done: true });
        completed++;
      }
    }
    return { completed };
  }

  // ---------------------------------------------------------------- trash

  async trash(userId: string, id: string): Promise<void> {
    id = (await this.access.task(userId, id)).id;
    await this.prisma.$transaction(async (tx) => {
      await this.recurrence.complete(tx, id, true);
      const current = await tx.plannerTask.findUniqueOrThrow({ where: { id } });
      await tx.plannerTask.update({
        where: { id },
        data: { deletedAt: current.deletedAt ?? new Date() },
      });
    });
  }

  async restore(userId: string, id: string): Promise<PlannerTask> {
    const task = await this.access.task(userId, id);
    id = task.id;
    if (task.seriesId && task.deletedAt && task.status === 'TODO') {
      const root = await this.prisma.plannerTask.findUniqueOrThrow({
        where: { id: task.seriesId },
      });
      if (root.repeatFrom === 'COMPLETION')
        throw new BadRequestException(
          'نوبت ردشده به آینده منتقل شده؛ بازگردانی مبنای تکرار را تغییر می‌دهد',
        );
    }
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
      id = task.id;
      if (!task.deletedAt)
        throw new BadRequestException(
          'فقط کارهای سطل زباله برای همیشه حذف می‌شوند',
        );
    }
    const listIds = await this.access.listIds(userId);
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.plannerTask.findMany({
        where: {
          ...(id ? { id } : {}),
          listId: { in: listIds },
          deletedAt: { not: null },
        },
      });
      const ids = rows.map((t) => t.id);
      for (const row of rows)
        if (row.seriesId && row.occurrenceDate && !ids.includes(row.seriesId)) {
          await tx.$queryRaw`SELECT id FROM planner_tasks WHERE id=${row.seriesId}::uuid FOR UPDATE`;
          const root = await tx.plannerTask.findUniqueOrThrow({
            where: { id: row.seriesId },
          });
          await tx.plannerTask.update({
            where: { id: root.id },
            data: {
              excludedDates: [
                ...new Set([...root.excludedDates, isoOf(row.occurrenceDate)]),
              ],
            },
          });
        }
      await tx.plannerTask.deleteMany({ where: { id: { in: ids } } });
    });
  }

  // ---------------------------------------------------------------- checklist

  async addItem(
    userId: string,
    taskId: string,
    title: string,
  ): Promise<PlannerTask> {
    taskId = (await this.access.task(userId, taskId)).id;
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
    taskId = (await this.access.task(userId, taskId)).id;
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
    taskId = (await this.access.task(userId, taskId)).id;
    await this.item(userId, taskId, itemId);
    await this.prisma.plannerChecklistItem.delete({ where: { id: itemId } });
    return this.get(userId, taskId);
  }

  private async item(userId: string, taskId: string, itemId: string) {
    taskId = (await this.access.task(userId, taskId)).id;
    const found = await this.prisma.plannerChecklistItem.count({
      where: { id: itemId, taskId },
    });
    if (!found) throw new NotFoundException('زیرکار پیدا نشد');
  }

  // ---------------------------------------------------------------- comments

  async comments(userId: string, taskId: string): Promise<PlannerComment[]> {
    if (OCCURRENCE_ID.test(taskId)) {
      const task = await this.recurrence.read(userId, taskId);
      if (task.id.includes('@')) return [];
      taskId = task.id;
    } else taskId = (await this.access.task(userId, taskId)).id;
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
    taskId = (await this.access.task(userId, taskId)).id;
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
