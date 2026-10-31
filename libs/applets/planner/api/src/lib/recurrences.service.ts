import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, type Prisma } from '@all-in-one/api/db';
import {
  addDays,
  isoDateIn,
  normalizeRepeatRule,
  OCCURRENCE_ID,
  taskOccurrences,
  timeIn,
  type TaskFilter,
  type UpdateTaskInput,
} from '@all-in-one/applets/planner/contracts';
import { RRule } from 'rrule';
import { TASK_INCLUDE, toTask, type DbTask } from './task-mapping';

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class RecurrencesService {
  constructor(private readonly prisma: PrismaService) {}

  config(t: DbTask) {
    const count = t.repeatRule
      ? RRule.parseString(t.repeatRule.replace(/^RRULE:/, '')).count
      : null;
    return {
      date: iso(t.completionAnchor ?? t.date!),
      time: t.time,
      repeatRule: t.repeatRule!,
      recurrenceTimezone: t.recurrenceTimezone,
      recurrenceEnd: t.recurrenceEnd ? iso(t.recurrenceEnd) : null,
      seriesUntil: t.seriesUntil ? iso(t.seriesUntil) : null,
      excludedDates: t.excludedDates,
      ...(t.repeatFrom === 'COMPLETION' && count
        ? { remainingCount: Math.max(0, count - t.completionCount) }
        : {}),
    };
  }

  project(
    t: DbTask,
    from: string,
    to: string,
    limit = 500,
    savedKeys: string[] = [],
  ): DbTask[] {
    if (!t.repeatRule || !t.date) return [];
    const config = this.config(t);
    if (t.repeatFrom !== 'COMPLETION')
      config.excludedDates = [...config.excludedDates, ...savedKeys];
    const slots = taskOccurrences(
      config,
      t.repeatFrom === 'COMPLETION' ? config.date : from,
      to,
      t.repeatFrom === 'COMPLETION' ? 1 : limit,
    ).filter((s) => s.date >= from && s.date <= to);
    return (t.repeatFrom === 'COMPLETION' ? slots.slice(0, 1) : slots).map(
      (slot) => ({
        ...t,
        id: `${t.id}@${slot.key}`,
        isSeries: false,
        seriesId: t.id,
        occurrenceDate: day(slot.key),
        date: day(slot.date),
        time: slot.time,
        externalSourceId: null,
        timeZone: 'Asia/Tehran',
        endTime:
          slot.startsAt && t.durationMin
            ? timeIn(
                new Date(Date.parse(slot.startsAt) + t.durationMin * 60000),
                'Asia/Tehran',
              )
            : t.endTime,
        status: 'TODO',
        completedAt: null,
        _count: { comments: 0 },
        checklist: t.checklist.map((i) => {
          const hash = createHash('sha256')
            .update(`${t.id}@${slot.key}@${i.id}`)
            .digest('hex');
          const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
          return { ...i, id, done: false, completedAt: null };
        }),
      }),
    );
  }

  async projected(
    listIds: string[],
    f: TaskFilter,
    from?: string,
    to?: string,
  ) {
    if (
      f.status === 'done' ||
      f.completedFrom ||
      f.completedTo ||
      (f.undated && !from && !to)
    )
      return [];
    const series = await this.prisma.plannerTask.findMany({
      where: { isSeries: true, deletedAt: null, listId: { in: listIds } },
      include: TASK_INCLUDE,
    });
    const result: DbTask[] = [];
    for (const t of series) {
      // Without a date window, expose the next year, with the same 500-result bound as native tasks.
      const start = from ?? iso(t.date!);
      const end = to ?? addDays(isoDateIn(new Date()), 366);
      const saved = await this.prisma.plannerTask.findMany({
        where: {
          seriesId: t.id,
          occurrenceDate: {
            gte: day(addDays(start, -2)),
            lte: day(addDays(end, 2)),
          },
        },
        select: { occurrenceDate: true },
      });
      const keys = new Set(saved.map((s) => iso(s.occurrenceDate!)));
      const candidates = this.project(t, start, end, 500, [...keys]);
      result.push(
        ...candidates.filter((c) => !keys.has(iso(c.occurrenceDate!))),
      );
    }
    return result;
  }

  /** Read-only lookup: querying a virtual occurrence never materializes a record. */
  async read(userId: string, handle: string): Promise<DbTask> {
    const [seriesId, key] = handle.split('@');
    if (
      !OCCURRENCE_ID.test(handle) ||
      !Number.isFinite(+day(key)) ||
      iso(day(key)) !== key
    )
      throw new BadRequestException('شناسه نوبت معتبر نیست');
    const stored = await this.prisma.plannerTask.findFirst({
      where: {
        seriesId,
        occurrenceDate: day(key),
        list: { members: { some: { userId } } },
      },
      include: TASK_INCLUDE,
    });
    if (stored) return stored;
    const root = await this.prisma.plannerTask.findFirst({
      where: {
        id: seriesId,
        isSeries: true,
        list: { members: { some: { userId } } },
      },
      include: TASK_INCLUDE,
    });
    if (!root) throw new NotFoundException('سری پیدا نشد');
    const saved = await this.prisma.plannerTask.findUnique({
      where: {
        seriesId_occurrenceDate: { seriesId, occurrenceDate: day(key) },
      },
      include: TASK_INCLUDE,
    });
    if (saved) throw new NotFoundException('این نوبت در فهرست دیگری است');
    if (root.deletedAt) throw new NotFoundException('سری در سطل زباله است');
    const occurrence = this.project(
      root,
      addDays(key, -2),
      addDays(key, 2),
    ).find((t) => iso(t.occurrenceDate!) === key);
    if (!occurrence) throw new NotFoundException('نوبت پیدا نشد');
    return occurrence;
  }

  /** Resolve a stable series@local-date handle, snapshotting only when addressed individually. */
  async resolve(userId: string, handle: string): Promise<string> {
    if (!OCCURRENCE_ID.test(handle)) return handle;
    const [seriesId, key] = handle.split('@');
    if (!Number.isFinite(+day(key)) || iso(day(key)) !== key)
      throw new BadRequestException('تاریخ نوبت معتبر نیست');
    const stored = await this.prisma.plannerTask.findFirst({
      where: {
        seriesId,
        occurrenceDate: day(key),
        list: { members: { some: { userId } } },
      },
      select: { id: true },
    });
    if (stored) return stored.id;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM planner_tasks WHERE id = ${seriesId}::uuid FOR UPDATE`;
      const series = await tx.plannerTask.findFirst({
        where: {
          id: seriesId,
          isSeries: true,
          list: { members: { some: { userId } } },
        },
        include: TASK_INCLUDE,
      });
      if (!series) throw new NotFoundException('سری تکرار پیدا نشد');
      const found = await tx.plannerTask.findUnique({
        where: {
          seriesId_occurrenceDate: { seriesId, occurrenceDate: day(key) },
        },
      });
      if (found) {
        const member = await tx.plannerListMember.count({
          where: { listId: found.listId, userId },
        });
        if (!member) throw new NotFoundException('این نوبت در فهرست دیگری است');
        return found.id;
      }
      if (series.deletedAt) throw new NotFoundException('سری در سطل زباله است');
      const occurrence = this.project(
        series,
        addDays(key, -2),
        addDays(key, 2),
      ).find((o) => iso(o.occurrenceDate!) === key);
      if (!occurrence)
        throw new NotFoundException('این نوبت در برنامه تکرار وجود ندارد');
      const created = await tx.plannerTask.create({
        data: this.snapshot(occurrence, seriesId, key),
      });
      return created.id;
    });
  }

  snapshot(
    t: DbTask,
    seriesId: string,
    key: string,
  ): Prisma.PlannerTaskUncheckedCreateInput {
    return {
      userId: t.userId,
      listId: t.listId,
      sectionId: t.sectionId,
      assigneeId: t.assigneeId,
      title: t.title,
      content: t.content,
      kind: t.kind,
      date: t.date,
      time: t.time,
      priority: t.priority,
      recurrenceRule: t.recurrenceRule,
      reminders: t.reminders,
      timeZone: t.timeZone,
      endTime: t.endTime,
      sortOrder: t.sortOrder,
      status: t.status,
      completedAt: t.completedAt,
      seriesId,
      occurrenceDate: day(key),
      repeatRule: t.repeatRule,
      repeatFrom: t.repeatFrom,
      recurrenceEnd: t.recurrenceEnd,
      recurrenceTimezone: t.recurrenceTimezone,
      durationMin: t.durationMin,
      tags: { create: t.tags.map((x) => ({ tagId: x.tagId })) },
      checklist: {
        create: t.checklist.map((x) => ({
          ...(t.seriesId === seriesId ? { id: x.id } : {}),
          title: x.title,
          done: x.done,
          completedAt: x.completedAt,
          sortOrder: x.sortOrder,
        })),
      },
    };
  }

  initialCompletion(
    completedAt: Date,
    rule: string,
    time: string | null,
    timezone: string,
    end: string | null,
    originalKey?: string,
  ) {
    const completed = isoDateIn(completedAt, timezone);
    const after =
      originalKey && originalKey > completed ? originalKey : completed;
    const next = taskOccurrences(
      {
        date: completed,
        time,
        repeatRule: rule,
        recurrenceTimezone: timezone,
        recurrenceEnd: end,
        remainingCount: Infinity,
      },
      addDays(after, -2),
      addDays(after, 36600),
      10,
    ).find((slot) => slot.key > after);
    return {
      completionCount: 1,
      completionAnchor: day(next?.key ?? addDays(completed, 36601)),
    };
  }

  /** Serialized with occurrence completion; retries cannot move the anchor a second time. */
  async complete(tx: Prisma.TransactionClient, id: string, done: boolean) {
    const t = await tx.plannerTask.findUniqueOrThrow({ where: { id } });
    if (!t.seriesId) return;
    await tx.$queryRaw`SELECT id FROM planner_tasks WHERE id = ${t.seriesId}::uuid FOR UPDATE`;
    const current = await tx.plannerTask.findUniqueOrThrow({ where: { id } });
    const root = await tx.plannerTask.findUniqueOrThrow({
      where: { id: t.seriesId },
      include: TASK_INCLUDE,
    });
    if (root.repeatFrom !== 'COMPLETION') return;
    if (!done && current.status !== 'TODO')
      throw new BadRequestException(
        'بازکردن نوبت انجام‌شده در تکرار از زمان انجام پشتیبانی نمی‌شود؛ تاریخچه حفظ می‌شود',
      );
    if (!done || current.status !== 'TODO' || current.deletedAt) return;
    const completed = isoDateIn(new Date(), root.recurrenceTimezone);
    const key = current.occurrenceDate
      ? iso(current.occurrenceDate)
      : completed;
    const after = key > completed ? key : completed;
    const next = taskOccurrences(
      {
        ...this.config(root),
        date: completed,
        remainingCount: Infinity,
        excludedDates: [],
      },
      addDays(after, -2),
      addDays(after, 36600),
      10,
    ).find((slot) => slot.key > after);
    await tx.plannerTask.update({
      where: { id: root.id },
      data: {
        completionCount: { increment: 1 },
        completionAnchor: next ? day(next.key) : day(addDays(completed, 36601)),
      },
    });
  }

  async series(userId: string) {
    const rows = await this.prisma.plannerTask.findMany({
      where: {
        seriesId: null,
        OR: [{ isSeries: true }, { recurrenceRule: { not: null } }],
        deletedAt: null,
        list: { members: { some: { userId } } },
      },
      include: TASK_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return rows.map(toTask);
  }

  /** Split future edits into a new template. Completed snapshots remain with the old series. */
  async fork(
    userId: string,
    occurrence: DbTask,
    input: UpdateTaskInput,
  ): Promise<string> {
    const rootId = occurrence.seriesId ?? occurrence.id;
    const key = iso(occurrence.occurrenceDate ?? occurrence.date!);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM planner_tasks WHERE id = ${rootId}::uuid FOR UPDATE`;
      const root = await tx.plannerTask.findFirstOrThrow({
        where: { id: rootId, list: { members: { some: { userId } } } },
        include: TASK_INCLUDE,
      });
      const future = await tx.plannerTask.findMany({
        where: { seriesId: rootId, occurrenceDate: { gte: day(key) } },
      });
      const splitKey = `split:${rootId}:${key}`;
      const existing = await tx.plannerTask.findUnique({
        where: {
          userId_idempotencyKey: {
            userId: root.userId,
            idempotencyKey: splitKey,
          },
        },
      });
      if (existing) return existing.id;
      if (root.deletedAt || occurrence.deletedAt)
        throw new BadRequestException('نوبت در سطل زباله است');
      const rule = normalizeRepeatRule(input.repeatRule ?? root.repeatRule!);
      const opts = RRule.parseString(rule.slice(6));
      const before = taskOccurrences(
        { ...this.config(root), excludedDates: [] },
        addDays(iso(root.date!), -2),
        addDays(key, 2),
        10000,
      ).filter((slot) => slot.key < key).length;
      const adjusted =
        opts.count && input.repeatRule === undefined
          ? rule.replace(
              /COUNT=\d+/,
              `COUNT=${Math.max(1, opts.count - before - (root.repeatFrom === 'COMPLETION' ? root.completionCount : 0))}`,
            )
          : rule;
      const start = input.date ?? key;
      const end =
        input.recurrenceEnd !== undefined
          ? input.recurrenceEnd
          : root.recurrenceEnd
            ? iso(root.recurrenceEnd)
            : null;
      if (end && end < start)
        throw new BadRequestException('پایان تکرار قبل از شروع است');
      const moved = !!input.listId && input.listId !== root.listId;
      let assignee =
        input.assigneeId !== undefined ? input.assigneeId : root.assigneeId;
      if (
        moved &&
        assignee &&
        !(await tx.plannerListMember.count({
          where: { listId: input.listId, userId: assignee },
        }))
      )
        assignee = null;
      const data: Prisma.PlannerTaskUncheckedCreateInput = {
        ...this.snapshot(root, rootId, key),
        seriesId: null,
        occurrenceDate: null,
        isSeries: input.repeatRule !== null,
        date: day(start),
        repeatRule: input.repeatRule === null ? null : adjusted,
        recurrenceRule:
          input.repeatRule === null
            ? null
            : adjusted.length <= 500
              ? adjusted
              : null,
        timeZone:
          (input.recurrenceTimezone ?? root.recurrenceTimezone).length <= 80
            ? (input.recurrenceTimezone ?? root.recurrenceTimezone)
            : null,
        endTime: input.endTime !== undefined ? input.endTime : root.endTime,
        reminders: input.reminders ?? root.reminders,
        status: 'TODO',
        completedAt: null,
        idempotencyKey: splitKey,
        title: input.title ?? root.title,
        content: input.content ?? root.content,
        kind: input.kind ?? root.kind,
        priority: input.priority ?? root.priority,
        listId: input.listId ?? root.listId,
        sectionId:
          input.sectionId !== undefined
            ? input.sectionId
            : moved
              ? null
              : root.sectionId,
        assigneeId: assignee,
        time: input.time !== undefined ? input.time : root.time,
        durationMin:
          input.durationMin !== undefined
            ? input.durationMin
            : root.durationMin,
        repeatFrom: input.repeatFrom ?? root.repeatFrom,
        recurrenceTimezone: input.recurrenceTimezone ?? root.recurrenceTimezone,
        recurrenceEnd: end ? day(end) : null,
        excludedDates: future
          .filter((t) => t.status !== 'TODO' || t.deletedAt)
          .map((t) => iso(t.occurrenceDate!)),
      };
      if (input.tags) {
        const ids = [];
        for (const name of [...new Set(input.tags)]) {
          const tag = await tx.plannerTag.upsert({
            where: { userId_name: { userId, name } },
            create: { userId, name },
            update: {},
          });
          ids.push(tag.id);
        }
        data.tags = { create: ids.map((tagId) => ({ tagId })) };
      }
      if (input.checklist)
        data.checklist = {
          create: input.checklist.map((i, index) => ({
            title: i.title,
            done: i.done ?? false,
            completedAt: i.done ? new Date() : null,
            sortOrder: index,
          })),
        };
      const created = await tx.plannerTask.create({ data });
      await tx.plannerTask.update({
        where: { id: rootId },
        data: { seriesUntil: day(addDays(key, -1)) },
      });
      await tx.plannerTask.updateMany({
        where: {
          seriesId: rootId,
          occurrenceDate: { gte: day(key) },
          status: 'TODO',
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });
      return created.id;
    });
  }
}
