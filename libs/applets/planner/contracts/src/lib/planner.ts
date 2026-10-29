import * as z from 'zod/mini';

export { addDays, toIsoDate } from '@all-in-one/shared/schemas';

export const PLANNER_AREAS = [
  'personal',
  'work',
  'health',
  'learning',
  'home',
] as const;
export type PlannerArea = (typeof PLANNER_AREAS)[number];

/** Persian labels for areas, used by every UI that embeds the planner. */
export const PLANNER_AREA_LABELS: Record<PlannerArea, string> = {
  personal: 'شخصی',
  work: 'کار',
  health: 'سلامت',
  learning: 'یادگیری',
  home: 'خانه',
};

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'کم',
  MEDIUM: 'متوسط',
  HIGH: 'زیاد',
};

const title = z.string().check(z.trim(), z.minLength(1), z.maxLength(200));
const notes = z.string().check(z.trim(), z.maxLength(2000));
const time = z.string().check(z.regex(/^([01]\d|2[0-3]):[0-5]\d$/));

export const createTaskSchema = z.object({
  title,
  notes: z.optional(notes),
  date: z.iso.date(),
  time: z.optional(time),
  priority: z._default(z.enum(TASK_PRIORITIES), 'MEDIUM'),
  area: z._default(z.enum(PLANNER_AREAS), 'personal'),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

export const updateTaskSchema = z.partial(
  z.object({
    title,
    notes: z.nullable(notes),
    date: z.iso.date(),
    time: z.nullable(time),
    priority: z.enum(TASK_PRIORITIES),
    area: z.enum(PLANNER_AREAS),
    done: z.boolean(),
  }),
);
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const listTasksQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export interface PlannerTask {
  id: string;
  title: string;
  notes: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string | null;
  priority: TaskPriority;
  area: PlannerArea;
  done: boolean;
  completedAt: string | null;
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

/** Open tasks first, then by time (untimed last), then by priority. */
export function compareTasks(a: PlannerTask, b: PlannerTask): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.time !== b.time) {
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time < b.time ? -1 : 1;
  }
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}
