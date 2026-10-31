import { type Prisma } from '@all-in-one/api/db';
import {
  type ChecklistItem,
  type PlannerTask,
} from '@all-in-one/applets/planner/contracts';
export const TASK_INCLUDE = {
  tags: { include: { tag: { select: { name: true } } } },
  checklist: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  _count: { select: { comments: true } },
} satisfies Prisma.PlannerTaskInclude;

export type DbTask = Prisma.PlannerTaskGetPayload<{
  include: typeof TASK_INCLUDE;
}>;

const isoOf = (date: Date) => date.toISOString().slice(0, 10);

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
    id:
      t.seriesId && t.occurrenceDate
        ? `${t.seriesId}@${isoOf(t.occurrenceDate)}`
        : t.id,
    isSeries: t.isSeries,
    seriesId: t.seriesId,
    occurrenceDate: t.occurrenceDate ? isoOf(t.occurrenceDate) : null,
    repeatRule: t.repeatRule,
    repeatFrom: t.repeatFrom as 'SCHEDULE' | 'COMPLETION',
    recurrenceEnd: t.recurrenceEnd ? isoOf(t.recurrenceEnd) : null,
    recurrenceTimezone: t.recurrenceTimezone,
    durationMin: t.durationMin,
    listId: t.listId,
    sectionId: t.sectionId,
    title: t.title,
    content: t.content,
    kind: t.kind,
    date: t.date ? isoOf(t.date) : null,
    time: t.time,
    recurrenceNeedsReview: !t.isSeries && !t.seriesId && !!t.recurrenceRule,
    externalSourceId: t.externalSourceId,
    recurrenceRule: t.recurrenceRule,
    reminders: t.reminders,
    timeZone: t.timeZone,
    endTime: t.endTime,
    priority: t.priority,
    done: t.status === 'DONE',
    completedAt: t.completedAt?.toISOString() ?? null,
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

/** Concrete pending tasks; series templates are represented by their projections. */
export const OPEN_TASK_WHERE = {
  status: 'TODO',
  deletedAt: null,
  isSeries: false,
  OR: [{ seriesId: null }, { series: { deletedAt: null } }],
} satisfies Prisma.PlannerTaskWhereInput;
