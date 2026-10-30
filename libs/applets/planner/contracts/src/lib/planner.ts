import * as z from 'zod/mini';
import { addDays } from '@all-in-one/shared/schemas';

export { addDays, toIsoDate } from '@all-in-one/shared/schemas';

/*
 * Planner applet, modelled on TickTick and its ChatGPT MCP (directive 23):
 * lists with sections and folders, shared lists with members, tasks with
 * checklists, tags and comments, a trash, habits with check-ins, focus
 * records, subscribed calendars and countdowns.
 */

/** Dates are calendar days in this zone (the app is Persian). */
export const PLANNER_TIME_ZONE = 'Asia/Tehran';

// ---------------------------------------------------------------- limits

/** TickTick MCP limits, enforced by the api. */
export const PLANNER_LIMITS = {
  /** Undone tasks by date range. */
  rangeDays: 14,
  /** Tasks completed in one list at once. */
  completeBatch: 20,
  /** Create / update in one batch. */
  batch: 50,
  /** Habit check-ins can be set this far back. */
  checkinDays: 90,
  /** Focus records per query. */
  focusDays: 31,
  /** Calendar events per query. */
  eventDays: 92,
  /** Completed tasks by completion date. */
  completedDays: 31,
  /** Any filter's due-date range. */
  filterDays: 366,
  /** Search and filter results. */
  results: 500,
} as const;

// ---------------------------------------------------------------- enums

export const TASK_PRIORITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  NONE: 'بدون',
  LOW: 'کم',
  MEDIUM: 'متوسط',
  HIGH: 'زیاد',
};

export const TASK_KINDS = ['TASK', 'NOTE'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const LIST_ROLES = ['OWNER', 'EDITOR'] as const;
export type ListRole = (typeof LIST_ROLES)[number];

export const FOCUS_KINDS = ['POMODORO', 'STOPWATCH'] as const;
export type FocusKind = (typeof FOCUS_KINDS)[number];
export const FOCUS_KIND_LABELS: Record<FocusKind, string> = {
  POMODORO: 'پومودورو',
  STOPWATCH: 'زمان‌سنج',
};

export const COUNTDOWN_KINDS = [
  'COUNTDOWN',
  'ANNIVERSARY',
  'BIRTHDAY',
  'HOLIDAY',
] as const;
export type CountdownKind = (typeof COUNTDOWN_KINDS)[number];
export const COUNTDOWN_KIND_LABELS: Record<CountdownKind, string> = {
  COUNTDOWN: 'روزشمار',
  ANNIVERSARY: 'سالگرد',
  BIRTHDAY: 'تولد',
  HOLIDAY: 'تعطیلی',
};

/** Colour names; each UI maps them to its palette. */
export const PLANNER_COLORS = [
  'sky',
  'violet',
  'rose',
  'amber',
  'sage',
  'clay',
  'slate',
] as const;
export type PlannerColor = (typeof PLANNER_COLORS)[number];

/** TickTick's MCP time-query presets for undone tasks. */
export const TIME_PRESETS = [
  'today',
  'tomorrow',
  'last24hour',
  'next24hour',
  'last7day',
  'next7day',
] as const;
export type TimePreset = (typeof TIME_PRESETS)[number];
export const TIME_PRESET_LABELS: Record<TimePreset, string> = {
  today: 'امروز',
  tomorrow: 'فردا',
  last24hour: '۲۴ ساعت گذشته',
  next24hour: '۲۴ ساعت آینده',
  last7day: '۷ روز گذشته',
  next7day: '۷ روز آینده',
};

// ---------------------------------------------------------------- shapes

export interface PlannerFolder {
  id: string;
  name: string;
  sortOrder: number;
}

export interface PlannerSection {
  id: string;
  listId: string;
  name: string;
  sortOrder: number;
}

export interface PlannerMember {
  userId: string;
  name: string | null;
  email: string;
  role: ListRole;
}

export interface PlannerList {
  id: string;
  name: string;
  color: PlannerColor;
  isInbox: boolean;
  folderId: string | null;
  sortOrder: number;
  /** Your role: owners manage members and can delete the list. */
  role: ListRole;
  shared: boolean;
  /** Undone, not trashed. */
  openCount: number;
  sections: PlannerSection[];
}

export interface PlannerListDetail extends PlannerList {
  members: PlannerMember[];
}

export interface PlannerTag {
  id: string;
  name: string;
  color: PlannerColor;
  /** Undone tasks with this tag. */
  openCount: number;
}

export interface ChecklistItem {
  id: string;
  title: string;
  done: boolean;
  completedAt: string | null;
  sortOrder: number;
}

export interface PlannerTask {
  id: string;
  listId: string;
  sectionId: string | null;
  title: string;
  content: string;
  kind: TaskKind;
  /** YYYY-MM-DD, or null for undated tasks */
  date: string | null;
  /** HH:mm */
  time: string | null;
  priority: TaskPriority;
  done: boolean;
  completedAt: string | null;
  externalSourceId: string | null;
  recurrenceRule: string | null;
  reminders: string[];
  timeZone: string | null;
  endTime: string | null;
  /** Set while the task is in the trash. */
  deletedAt: string | null;
  tags: string[];
  checklist: ChecklistItem[];
  assigneeId: string | null;
  createdById: string;
  commentCount: number;
  sortOrder: number;
  createdAt: string;
}

export interface PlannerComment {
  id: string;
  taskId: string;
  userId: string;
  author: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

export interface HabitSection {
  id: string;
  name: string;
  sortOrder: number;
}

export interface HabitCheckin {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

export interface PlannerHabit {
  id: string;
  sectionId: string | null;
  name: string;
  icon: string;
  color: PlannerColor;
  goal: number;
  unit: string;
  /** 0 = Sunday … 6 = Saturday */
  weekdays: number[];
  archived: boolean;
  sortOrder: number;
  /** Check-ins of the requested window (default: the past 90 days). */
  checkins: HabitCheckin[];
  /** Consecutive completed due days up to today (today counts once done). */
  streak: number;
  /** Completed days in total. */
  total: number;
}

export interface PlannerFocus {
  id: string;
  taskId: string | null;
  taskTitle: string | null;
  kind: FocusKind;
  startAt: string;
  endAt: string;
  durationMin: number;
  note: string;
}

export interface FocusSummary {
  records: PlannerFocus[];
  totalMin: number;
}

export interface PlannerCalendar {
  id: string;
  name: string;
  url: string;
  color: PlannerColor;
  lastFetchedAt: string | null;
  lastError: string | null;
}

export interface CalendarEvent {
  calendarId: string;
  uid: string;
  title: string;
  location: string;
  /** ISO date-time, or YYYY-MM-DD for all-day events */
  start: string;
  end: string | null;
  allDay: boolean;
}

export interface PlannerCountdown {
  id: string;
  title: string;
  /** The original date, YYYY-MM-DD */
  date: string;
  kind: CountdownKind;
  repeatYearly: boolean;
  color: PlannerColor;
  note: string;
  /** Next occurrence (the date itself unless it repeats yearly) */
  nextDate: string;
  /** Days from today to nextDate; negative once a one-off date has passed */
  daysLeft: number;
}

// ---------------------------------------------------------------- schemas

const name = z.string().check(z.trim(), z.minLength(1), z.maxLength(100));
const title = z.string().check(z.trim(), z.minLength(1), z.maxLength(200));
const content = z.string().check(z.maxLength(10000));
const isoDate = z.iso.date();
export const timeOfDay = z.string().check(z.regex(/^([01]\d|2[0-3]):[0-5]\d$/));
const color = z.enum(PLANNER_COLORS);
const tagName = z
  .string()
  .check(
    z.trim(),
    z.minLength(1),
    z.maxLength(50),
    z.regex(/^[^\s#,]+$/, 'برچسب فاصله، # یا ویرگول ندارد'),
  );
const uuid = z.uuid();
const sortOrder = z.number().check(z.int());

export const createListSchema = z.object({
  name,
  color: z.optional(color),
  folderId: z.optional(z.nullable(uuid)),
});
export type CreateListInput = z.infer<typeof createListSchema>;

export const updateListSchema = z.partial(
  z.object({
    name,
    color,
    folderId: z.nullable(uuid),
    sortOrder,
  }),
);
export type UpdateListInput = z.infer<typeof updateListSchema>;

export const folderSchema = z.object({
  name,
  sortOrder: z.optional(sortOrder),
});
export type FolderInput = z.infer<typeof folderSchema>;

export const sectionSchema = z.object({
  name,
  sortOrder: z.optional(sortOrder),
});
export type SectionInput = z.infer<typeof sectionSchema>;

export const addMemberSchema = z.object({
  email: z.email(),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

const checklistInput = z.object({
  title,
  done: z.optional(z.boolean()),
});

export const createTaskSchema = z.object({
  title,
  content: z.optional(content),
  kind: z.optional(z.enum(TASK_KINDS)),
  /** Defaults to the Inbox. */
  listId: z.optional(uuid),
  sectionId: z.optional(z.nullable(uuid)),
  date: z.optional(z.nullable(isoDate)),
  time: z.optional(z.nullable(timeOfDay)),
  priority: z.optional(z.enum(TASK_PRIORITIES)),
  tags: z.optional(z.array(tagName).check(z.maxLength(20))),
  checklist: z.optional(z.array(checklistInput).check(z.maxLength(100))),
  assigneeId: z.optional(z.nullable(uuid)),
  externalSourceId: z.optional(z.string().check(z.minLength(1), z.maxLength(120))),
  recurrenceRule: z.optional(z.nullable(z.string().check(z.maxLength(500)))),
  reminders: z.optional(z.array(z.string().check(z.maxLength(150))).check(z.maxLength(30))),
  timeZone: z.optional(z.nullable(z.string().check(z.maxLength(80)))),
  endTime: z.optional(z.nullable(timeOfDay)),
  completedAt: z.optional(z.iso.datetime({ offset: true })),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.partial(
  z.object({
    title,
    content,
    kind: z.enum(TASK_KINDS),
    listId: uuid,
    sectionId: z.nullable(uuid),
    date: z.nullable(isoDate),
    time: z.nullable(timeOfDay),
    priority: z.enum(TASK_PRIORITIES),
    tags: z.array(tagName).check(z.maxLength(20)),
    /** Replaces the checklist (TickTick's update semantics). */
    checklist: z.array(checklistInput).check(z.maxLength(100)),
    assigneeId: z.nullable(uuid),
    recurrenceRule: z.nullable(z.string().check(z.maxLength(500))),
    reminders: z.array(z.string().check(z.maxLength(150))).check(z.maxLength(30)),
    timeZone: z.nullable(z.string().check(z.maxLength(80))),
    endTime: z.nullable(timeOfDay),
    done: z.boolean(),
    sortOrder,
  }),
);
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const batchCreateTasksSchema = z.object({
  tasks: z
    .array(createTaskSchema)
    .check(z.minLength(1), z.maxLength(PLANNER_LIMITS.batch)),
});
export type BatchCreateTasksInput = z.infer<typeof batchCreateTasksSchema>;

export const batchUpdateTasksSchema = z.object({
  tasks: z
    .array(z.extend(updateTaskSchema, { id: uuid }))
    .check(z.minLength(1), z.maxLength(PLANNER_LIMITS.batch)),
});
export type BatchUpdateTasksInput = z.infer<typeof batchUpdateTasksSchema>;

export const completeInListSchema = z.object({
  listId: uuid,
  taskIds: z
    .array(uuid)
    .check(z.minLength(1), z.maxLength(PLANNER_LIMITS.completeBatch)),
});
export type CompleteInListInput = z.infer<typeof completeInListSchema>;

export const moveTaskSchema = z.object({
  listId: uuid,
  sectionId: z.optional(z.nullable(uuid)),
});
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

export const checklistItemSchema = z.object({ title });
export const updateChecklistItemSchema = z.partial(
  z.object({ title, done: z.boolean(), sortOrder }),
);
export type UpdateChecklistItemInput = z.infer<
  typeof updateChecklistItemSchema
>;

export const commentSchema = z.object({
  body: z.string().check(z.trim(), z.minLength(1), z.maxLength(2000)),
});

export const assignSchema = z.object({ assigneeId: z.nullable(uuid) });

export const tagSchema = z.object({ name: tagName, color: z.optional(color) });
export type TagInput = z.infer<typeof tagSchema>;
export const updateTagSchema = z.partial(z.object({ name: tagName, color }));
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

/** Query strings: comma-separated lists and 'true'/'false' flags. */
const csv = <T>(item: z.ZodMiniType<T, string>) =>
  z.pipe(
    z.pipe(
      z.string(),
      z.transform((s) =>
        s
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean),
      ),
    ),
    z.array(item),
  );
const flag = z.pipe(
  z.enum(['true', 'false']),
  z.transform((s) => s === 'true'),
);

export const TASK_STATUSES = ['open', 'done', 'all'] as const;
export type TaskStatusFilter = (typeof TASK_STATUSES)[number];

/**
 * TickTick's multi-condition filter (and the base of every task query).
 * Dates are inclusive; `undated` includes tasks without a date.
 */
export const taskFilterSchema = z.object({
  q: z.optional(z.string().check(z.trim(), z.maxLength(200))),
  listIds: z.optional(csv(uuid)),
  tags: z.optional(csv(tagName)),
  priorities: z.optional(csv(z.enum(TASK_PRIORITIES))),
  kind: z.optional(z.enum(TASK_KINDS)),
  status: z.optional(z.enum(TASK_STATUSES)),
  from: z.optional(isoDate),
  to: z.optional(isoDate),
  undated: z.optional(flag),
  assigneeId: z.optional(z.union([uuid, z.literal('me'), z.literal('none')])),
  preset: z.optional(z.enum(TIME_PRESETS)),
  /** Completed-at window instead of the due date (TickTick "completed by date"). */
  completedFrom: z.optional(isoDate),
  completedTo: z.optional(isoDate),
  limit: z.optional(
    z.pipe(
      z.pipe(
        z.string(),
        z.transform((s) => Number(s)),
      ),
      z.int().check(z.minimum(1), z.maximum(PLANNER_LIMITS.results)),
    ),
  ),
});
export type TaskFilterQuery = z.input<typeof taskFilterSchema>;
export type TaskFilter = z.infer<typeof taskFilterSchema>;

export const createHabitSchema = z.object({
  name,
  icon: z.optional(z.string().check(z.regex(/^lucide[A-Z][A-Za-z0-9]{1,36}$/))),
  color: z.optional(color),
  goal: z.optional(z.number().check(z.int(), z.minimum(1), z.maximum(100))),
  unit: z.optional(z.string().check(z.trim(), z.maxLength(20))),
  weekdays: z.optional(
    z
      .array(z.number().check(z.int(), z.minimum(0), z.maximum(6)))
      .check(z.minLength(1), z.maxLength(7)),
  ),
  sectionId: z.optional(z.nullable(uuid)),
});
export type CreateHabitInput = z.infer<typeof createHabitSchema>;

export const updateHabitSchema = z.extend(z.partial(createHabitSchema), {
  archived: z.optional(z.boolean()),
  sortOrder: z.optional(sortOrder),
});
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;

export const checkinSchema = z.object({
  date: isoDate,
  /** 0 clears the day. */
  value: z.number().check(z.int(), z.minimum(0), z.maximum(1000)),
});
export type CheckinInput = z.infer<typeof checkinSchema>;

export const dateRangeSchema = z.object({ from: isoDate, to: isoDate });
export type DateRange = z.infer<typeof dateRangeSchema>;

export const habitQuerySchema = z.object({
  from: z.optional(isoDate),
  to: z.optional(isoDate),
  archived: z.optional(flag),
});
export type HabitQuery = z.infer<typeof habitQuerySchema>;

export const eventsQuerySchema = z.extend(dateRangeSchema, {
  calendarId: z.optional(uuid),
});
export type EventsQuery = z.infer<typeof eventsQuerySchema>;

const isoDateTime = z.iso.datetime({ offset: true });

export const createFocusSchema = z.object({
  taskId: z.optional(z.nullable(uuid)),
  kind: z.optional(z.enum(FOCUS_KINDS)),
  startAt: isoDateTime,
  endAt: isoDateTime,
  note: z.optional(z.string().check(z.trim(), z.maxLength(1000))),
});
export type CreateFocusInput = z.infer<typeof createFocusSchema>;

/** The duration is fixed: moving `startAt` moves `endAt` with it. */
export const updateFocusSchema = z.partial(
  z.object({
    taskId: z.nullable(uuid),
    startAt: isoDateTime,
    note: z.string().check(z.trim(), z.maxLength(1000)),
  }),
);
export type UpdateFocusInput = z.infer<typeof updateFocusSchema>;

export const focusQuerySchema = z.object({
  from: isoDateTime,
  to: isoDateTime,
});
export type FocusQuery = z.infer<typeof focusQuerySchema>;

export const createCalendarSchema = z.object({
  name,
  url: z
    .string()
    .check(
      z.trim(),
      z.maxLength(2000),
      z.regex(
        /^(https|webcal):\/\/\S+$/i,
        'نشانی باید با https یا webcal شروع شود',
      ),
    ),
  color: z.optional(color),
});
export type CreateCalendarInput = z.infer<typeof createCalendarSchema>;
export const updateCalendarSchema = z.partial(z.object({ name, color }));
export type UpdateCalendarInput = z.infer<typeof updateCalendarSchema>;

export const createCountdownSchema = z.object({
  title,
  date: isoDate,
  kind: z.optional(z.enum(COUNTDOWN_KINDS)),
  repeatYearly: z.optional(z.boolean()),
  color: z.optional(color),
  note: z.optional(z.string().check(z.trim(), z.maxLength(500))),
});
export type CreateCountdownInput = z.infer<typeof createCountdownSchema>;
export const updateCountdownSchema = z.partial(createCountdownSchema);
export type UpdateCountdownInput = z.infer<typeof updateCountdownSchema>;

// ---------------------------------------------------------------- logic

/** YYYY-MM-DD of `date` in a time zone. */
export function isoDateIn(date: Date, timeZone = PLANNER_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** "HH:mm" of `date` in a time zone. */
export function timeIn(date: Date, timeZone = PLANNER_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/** Whole days from `from` to `to` (YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

export interface TimeWindow {
  from: string;
  to: string;
  /** For the 24-hour presets: only tasks at or after / before this local "date time". */
  after?: string;
  before?: string;
}

/**
 * The date window of a TickTick time preset. The 24-hour presets cover two
 * calendar days and cut them at the current local time; untimed tasks count
 * for their whole day.
 */
export function presetWindow(preset: TimePreset, now: Date): TimeWindow {
  const today = isoDateIn(now);
  const clock = timeIn(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'tomorrow':
      return { from: addDays(today, 1), to: addDays(today, 1) };
    case 'last24hour':
      return {
        from: addDays(today, -1),
        to: today,
        after: `${addDays(today, -1)} ${clock}`,
        before: `${today} ${clock}`,
      };
    case 'next24hour':
      return {
        from: today,
        to: addDays(today, 1),
        after: `${today} ${clock}`,
        before: `${addDays(today, 1)} ${clock}`,
      };
    case 'last7day':
      return { from: addDays(today, -6), to: today };
    case 'next7day':
      return { from: today, to: addDays(today, 6) };
  }
}

/** Whether a dated task falls inside the cut of a 24-hour window. */
export function inWindow(
  task: Pick<PlannerTask, 'date' | 'time'>,
  window: TimeWindow,
): boolean {
  if (!task.date || task.date < window.from || task.date > window.to)
    return false;
  if (!task.time) return true;
  const at = `${task.date} ${task.time}`;
  return (
    (!window.after || at >= window.after) &&
    (!window.before || at <= window.before)
  );
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
  NONE: 3,
};

/** Open tasks first, then by date (undated last), time (untimed last), priority, order. */
export function compareTasks(a: PlannerTask, b: PlannerTask): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.date !== b.date) {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : 1;
  }
  if (a.time !== b.time) {
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time < b.time ? -1 : 1;
  }
  const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (rank) return rank;
  return a.sortOrder - b.sortOrder || (a.createdAt < b.createdAt ? -1 : 1);
}

export interface QuickAdd {
  title: string;
  tags: string[];
  priority?: TaskPriority;
  date?: string;
}

const QUICK_PRIORITY: Record<string, TaskPriority> = {
  '!1': 'HIGH',
  '!2': 'MEDIUM',
  '!3': 'LOW',
  '!۱': 'HIGH',
  '!۲': 'MEDIUM',
  '!۳': 'LOW',
};

/**
 * TickTick-style quick add: `#tag`, `!1`/`!2`/`!3` (high/medium/low) and the
 * words «امروز» / «فردا» / «پس‌فردا» are taken out of the title.
 */
export function parseQuickAdd(text: string, today: string): QuickAdd {
  const tags: string[] = [];
  let priority: TaskPriority | undefined;
  let date: string | undefined;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const rest = words.filter((word) => {
    if (/^#[^\s#,]{1,50}$/.test(word)) {
      if (!tags.includes(word.slice(1))) tags.push(word.slice(1));
      return false;
    }
    if (word in QUICK_PRIORITY) {
      priority = QUICK_PRIORITY[word];
      return false;
    }
    const day = { امروز: 0, فردا: 1, پس‌فردا: 2 }[word];
    if (day !== undefined && words.length > 1) {
      date = addDays(today, day);
      return false;
    }
    return true;
  });
  return { title: rest.join(' '), tags, priority, date };
}

/** Whether a habit is due on a day (YYYY-MM-DD). */
export function habitDueOn(
  habit: Pick<PlannerHabit, 'weekdays'>,
  date: string,
) {
  return habit.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
}

/**
 * Consecutive completed due days ending today (or yesterday, while today is
 * still open). Days the habit is not due are skipped.
 */
export function habitStreak(
  habit: Pick<PlannerHabit, 'weekdays' | 'goal'>,
  checkins: HabitCheckin[],
  today: string,
): number {
  const done = new Set(
    checkins.filter((c) => c.value >= habit.goal).map((c) => c.date),
  );
  let streak = 0;
  let day = today;
  if (!done.has(day)) day = addDays(day, -1);
  for (let i = 0; i < 400; i++, day = addDays(day, -1)) {
    if (!habitDueOn(habit, day)) continue;
    if (!done.has(day)) break;
    streak++;
  }
  return streak;
}

/** Next yearly occurrence of a date on or after `today`. */
export function nextOccurrence(
  date: string,
  repeatYearly: boolean,
  today: string,
): string {
  if (!repeatYearly || date >= today) return date;
  const [, m, d] = date.split('-');
  const year = Number(today.slice(0, 4));
  // Feb 29 falls on Mar 1 in common years (Date.UTC rolls it over).
  const fit = (y: number) =>
    new Date(Date.UTC(y, Number(m) - 1, Number(d))).toISOString().slice(0, 10);
  const thisYear = fit(year);
  return thisYear >= today ? thisYear : fit(year + 1);
}
