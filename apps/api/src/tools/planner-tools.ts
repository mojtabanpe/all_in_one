import { BadRequestException } from '@nestjs/common';
import type {
  CalendarsService,
  CountdownsService,
  FocusService,
  HabitsService,
  ListsService,
  TagsService,
  TasksService,
} from '@all-in-one/applets/planner/api';
import {
  checkinSchema,
  COUNTDOWN_KINDS,
  createCalendarSchema,
  createCountdownSchema,
  createFocusSchema,
  createHabitSchema,
  createListSchema,
  createTaskSchema,
  daysBetween,
  FOCUS_KINDS,
  PLANNER_COLORS,
  PLANNER_LIMITS,
  TASK_KINDS,
  TASK_PRIORITIES,
  TIME_PRESETS,
  updateCountdownSchema,
  updateFocusSchema,
  updateHabitSchema,
  updateListSchema,
  updateTaskSchema,
  updateTagSchema,
  tagSchema,
} from '@all-in-one/applets/planner/contracts';
import * as z from 'zod';
import { parseWith, type ToolSink } from './tool-kit';

export interface PlannerServices {
  lists: ListsService;
  tasks: TasksService;
  tags: TagsService;
  habits: HabitsService;
  focus: FocusService;
  calendars: CalendarsService;
  countdowns: CountdownsService;
}

/** snake_case tool arguments → the camelCase inputs of the planner services. */
function camel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camel);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        camel(v),
      ]),
    );
  return value;
}

const id = z.uuid();
const date = z.iso.date().describe('YYYY-MM-DD');
const dateTime = z.iso
  .datetime({ offset: true })
  .describe('ISO 8601 date-time with offset');
const color = z.enum(PLANNER_COLORS);
const tag = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[^\s#,]+$/, 'No spaces, # or commas');

const taskFields = {
  title: z.string().min(1).max(200),
  content: z.string().max(10000).optional().describe('Description / notes'),
  kind: z.enum(TASK_KINDS).optional().describe('TASK (checkable) or NOTE'),
  list_id: id.optional().describe('Defaults to the Inbox'),
  section_id: id.nullable().optional(),
  date: date
    .nullable()
    .optional()
    .describe('Due date; null or omitted = no date'),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional()
    .describe('HH:mm, needs a date'),
  priority: z.enum(TASK_PRIORITIES).optional(),
  tags: z
    .array(tag)
    .max(20)
    .optional()
    .describe('Tag names; missing tags are created'),
  checklist: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        done: z.boolean().optional(),
      }),
    )
    .max(100)
    .optional(),
  assignee_id: id
    .nullable()
    .optional()
    .describe('A member of the list (see get_list)'),
};
const createTask = z.object(taskFields);
const updateTask = createTask
  .partial()
  .extend({ task_id: id, done: z.boolean().optional() });

function range(from: string, to: string, max: number, what: string) {
  const span = daysBetween(from, to);
  if (span < 0) throw new BadRequestException('start_date is after end_date');
  if (span >= max)
    throw new BadRequestException(`${what} covers at most ${max} days`);
}

/**
 * The planner's tools, matching TickTick's ChatGPT MCP (directive 23): task
 * queries, lists with sections and folders, tasks, checklist items,
 * comments, members and assignment, tags, habits with check-ins, focus
 * records, subscribed calendars and countdowns.
 */
export function plannerTools(kit: ToolSink, s: PlannerServices) {
  const user = kit.user;
  const read = 'planner:read' as const;
  const write = 'planner:write' as const;

  // ---------------------------------------------------------------- task queries
  kit.tool(
    'search_tasks',
    {
      description:
        'Search open and completed tasks by keyword in title, description or checklist items.',
      scope: read,
      kind: 'read',
      input: {
        query: z.string().trim().min(1).max(200),
        limit: z.number().int().min(1).max(100).default(50),
      },
    },
    (a) => s.tasks.filter(user, { q: a.query, status: 'all', limit: a.limit }),
  );
  kit.tool(
    'get_task',
    {
      description: 'Read one task with its checklist, tags and assignee.',
      scope: read,
      kind: 'read',
      input: { task_id: id },
    },
    (a) => s.tasks.get(user, a.task_id),
  );
  kit.tool(
    'list_undone_tasks_by_time_query',
    {
      description: `Undone tasks for a time preset: ${TIME_PRESETS.join(', ')}. Dates are in Tehran time; overdue tasks are not included unless the preset covers them.`,
      scope: read,
      kind: 'read',
      input: { query_command: z.enum(TIME_PRESETS) },
    },
    (a) => s.tasks.filter(user, { preset: a.query_command }),
  );
  kit.tool(
    'list_undone_tasks_by_date',
    {
      description: `Undone tasks due between two dates (inclusive), at most ${PLANNER_LIMITS.rangeDays} days.`,
      scope: read,
      kind: 'read',
      input: { start_date: date, end_date: date },
    },
    (a) => s.tasks.undoneInRange(user, a.start_date, a.end_date),
  );
  kit.tool(
    'list_completed_tasks_by_date',
    {
      description: `Tasks completed between two dates (inclusive, by completion day), at most ${PLANNER_LIMITS.completedDays} days.`,
      scope: read,
      kind: 'read',
      input: { start_date: date, end_date: date },
    },
    (a) =>
      s.tasks.filter(user, {
        completedFrom: a.start_date,
        completedTo: a.end_date,
      }),
  );
  kit.tool(
    'filter_tasks',
    {
      description:
        'Filter tasks by several conditions at once: lists, tags, priorities, kind, status, due-date range (optionally including undated tasks), assignee and keyword.',
      scope: read,
      kind: 'read',
      input: {
        list_ids: z.array(id).max(50).optional(),
        tags: z.array(tag).max(20).optional(),
        priorities: z.array(z.enum(TASK_PRIORITIES)).optional(),
        kind: z.enum(TASK_KINDS).optional(),
        status: z.enum(['open', 'done', 'all']).default('open'),
        start_date: date.optional(),
        end_date: date.optional(),
        include_undated: z.boolean().optional(),
        assignee: z.union([id, z.literal('me'), z.literal('none')]).optional(),
        query: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(PLANNER_LIMITS.results).default(100),
      },
    },
    (a) =>
      s.tasks.filter(user, {
        listIds: a.list_ids,
        tags: a.tags,
        priorities: a.priorities,
        kind: a.kind,
        status: a.status,
        from: a.start_date,
        to: a.end_date,
        undated: a.include_undated,
        assigneeId: a.assignee,
        q: a.query,
        limit: a.limit,
      }),
  );
  kit.tool(
    'list_trash',
    {
      description: 'Tasks in the trash (they can be restored).',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.tasks.trashed(user),
  );

  // ---------------------------------------------------------------- lists, sections, folders, members
  kit.tool(
    'list_lists',
    {
      description:
        'All your lists (projects) with sections, open counts and whether they are shared. The Inbox is first.',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.lists.all(user),
  );
  kit.tool(
    'get_list',
    {
      description:
        'One list with its sections and members (for assigning tasks).',
      scope: read,
      kind: 'read',
      input: { list_id: id },
    },
    (a) => s.lists.get(user, a.list_id),
  );
  kit.tool(
    'list_folders',
    {
      description: 'Folders that group your lists.',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.lists.folders(user),
  );
  kit.tool(
    'create_list',
    {
      description: 'Create a list (project), optionally inside a folder.',
      scope: write,
      kind: 'create',
      input: {
        name: z.string().min(1).max(100),
        color: color.optional(),
        folder_id: id.nullable().optional(),
      },
    },
    (a) => s.lists.create(user, parseWith(createListSchema, camel(a))),
  );
  kit.tool(
    'update_list',
    {
      description:
        'Rename, recolour or move a list into/out of a folder (owner only).',
      scope: write,
      kind: 'update',
      input: {
        list_id: id,
        name: z.string().min(1).max(100).optional(),
        color: color.optional(),
        folder_id: id.nullable().optional(),
      },
    },
    ({ list_id, ...patch }) =>
      s.lists.update(user, list_id, parseWith(updateListSchema, camel(patch))),
  );
  kit.tool(
    'delete_list',
    {
      assistant: false,
      description:
        'Permanently delete a list AND all its tasks (owner only; not the Inbox).',
      scope: write,
      kind: 'delete',
      input: { list_id: id },
    },
    (a) => s.lists.remove(user, a.list_id),
  );
  kit.tool(
    'create_folder',
    {
      description: 'Create a folder for lists.',
      scope: write,
      kind: 'create',
      input: { name: z.string().min(1).max(100) },
    },
    (a) => s.lists.createFolder(user, a),
  );
  kit.tool(
    'rename_folder',
    {
      description: 'Rename a folder.',
      scope: write,
      kind: 'update',
      input: { folder_id: id, name: z.string().min(1).max(100) },
    },
    (a) => s.lists.updateFolder(user, a.folder_id, { name: a.name }),
  );
  kit.tool(
    'delete_folder',
    {
      description: 'Delete a folder; its lists stay, outside any folder.',
      scope: write,
      kind: 'delete',
      input: { folder_id: id },
    },
    (a) => s.lists.removeFolder(user, a.folder_id),
  );
  kit.tool(
    'create_section',
    {
      description: 'Add a section (column) to a list.',
      scope: write,
      kind: 'create',
      input: { list_id: id, name: z.string().min(1).max(100) },
    },
    (a) => s.lists.addSection(user, a.list_id, { name: a.name }),
  );
  kit.tool(
    'rename_section',
    {
      description: 'Rename a section.',
      scope: write,
      kind: 'update',
      input: { section_id: id, name: z.string().min(1).max(100) },
    },
    (a) => s.lists.updateSection(user, a.section_id, { name: a.name }),
  );
  kit.tool(
    'delete_section',
    {
      description:
        'Delete a section; its tasks stay in the list without a section.',
      scope: write,
      kind: 'delete',
      input: { section_id: id },
    },
    (a) => s.lists.removeSection(user, a.section_id),
  );
  kit.tool(
    'add_list_member',
    {
      assistant: false,
      description: 'Share a list with another account by email (owner only).',
      scope: write,
      kind: 'create',
      input: { list_id: id, email: z.email() },
    },
    (a) => s.lists.addMember(user, a.list_id, a.email),
  );
  kit.tool(
    'remove_list_member',
    {
      assistant: false,
      description:
        'Remove a member from a shared list (owner), or leave it (your own user id).',
      scope: write,
      kind: 'delete',
      input: { list_id: id, user_id: id },
    },
    (a) => s.lists.removeMember(user, a.list_id, a.user_id),
  );

  // ---------------------------------------------------------------- tasks
  kit.tool(
    'create_task',
    {
      description:
        'Create a task or note. Non-idempotent: retrying creates another task.',
      scope: write,
      kind: 'create',
      input: createTask,
    },
    (a) => s.tasks.create(user, parseWith(createTaskSchema, camel(a))),
  );
  kit.tool(
    'batch_create_tasks',
    {
      description: `Create up to ${PLANNER_LIMITS.batch} tasks at once.`,
      scope: write,
      kind: 'create',
      input: { tasks: z.array(createTask).min(1).max(PLANNER_LIMITS.batch) },
    },
    (a) =>
      s.tasks.createMany(
        user,
        a.tasks.map((t) => parseWith(createTaskSchema, camel(t))),
      ),
  );
  kit.tool(
    'update_task',
    {
      description:
        'Update a task. Send only the fields to change; tags and checklist, when given, replace the existing ones. done=true completes it, done=false reopens it.',
      scope: write,
      kind: 'update',
      input: updateTask,
    },
    ({ task_id, ...patch }) =>
      s.tasks.update(user, task_id, parseWith(updateTaskSchema, camel(patch))),
  );
  kit.tool(
    'batch_update_tasks',
    {
      description: `Update up to ${PLANNER_LIMITS.batch} tasks at once (same fields as update_task).`,
      scope: write,
      kind: 'update',
      input: { tasks: z.array(updateTask).min(1).max(PLANNER_LIMITS.batch) },
    },
    (a) =>
      s.tasks.updateMany(
        user,
        a.tasks.map(({ task_id, ...patch }) => ({
          id: task_id,
          ...parseWith(updateTaskSchema, camel(patch)),
        })),
      ),
  );
  kit.tool(
    'complete_task',
    {
      description: 'Mark a task done.',
      scope: write,
      kind: 'update',
      input: { task_id: id },
    },
    (a) => s.tasks.update(user, a.task_id, { done: true }),
  );
  kit.tool(
    'complete_tasks_in_list',
    {
      description: `Mark up to ${PLANNER_LIMITS.completeBatch} tasks of one list done.`,
      scope: write,
      kind: 'update',
      input: {
        list_id: id,
        task_ids: z.array(id).min(1).max(PLANNER_LIMITS.completeBatch),
      },
    },
    (a) => s.tasks.completeInList(user, a.list_id, a.task_ids),
  );
  kit.tool(
    'move_task',
    {
      description:
        'Move a task to another list (and optionally a section there).',
      scope: write,
      kind: 'update',
      input: { task_id: id, list_id: id, section_id: id.nullable().optional() },
    },
    (a) =>
      s.tasks.update(user, a.task_id, {
        listId: a.list_id,
        ...(a.section_id !== undefined ? { sectionId: a.section_id } : {}),
      }),
  );
  kit.tool(
    'trash_task',
    {
      description: 'Move a task to the trash (restorable with restore_task).',
      scope: write,
      kind: 'delete',
      input: { task_id: id },
    },
    (a) => s.tasks.trash(user, a.task_id),
  );
  kit.tool(
    'restore_task',
    {
      description: 'Bring a task back from the trash.',
      scope: write,
      kind: 'update',
      input: { task_id: id },
    },
    (a) => s.tasks.restore(user, a.task_id),
  );
  kit.tool(
    'add_checklist_item',
    {
      description: 'Add a checklist (sub-task) item to a task.',
      scope: write,
      kind: 'create',
      input: { task_id: id, title: z.string().min(1).max(200) },
    },
    (a) => s.tasks.addItem(user, a.task_id, a.title),
  );
  kit.tool(
    'update_checklist_item',
    {
      description: 'Rename a checklist item or complete / reopen it (done).',
      scope: write,
      kind: 'update',
      input: {
        task_id: id,
        item_id: id,
        title: z.string().min(1).max(200).optional(),
        done: z.boolean().optional(),
      },
    },
    (a) =>
      s.tasks.updateItem(user, a.task_id, a.item_id, {
        title: a.title,
        done: a.done,
      }),
  );
  kit.tool(
    'delete_checklist_item',
    {
      description: 'Remove a checklist item.',
      scope: write,
      kind: 'delete',
      input: { task_id: id, item_id: id },
    },
    (a) => s.tasks.removeItem(user, a.task_id, a.item_id),
  );
  kit.tool(
    'assign_task',
    {
      description:
        'Assign a task in a shared list to a member (user_id from get_list), or null to unassign.',
      scope: write,
      kind: 'update',
      input: { task_id: id, assignee_id: id.nullable() },
    },
    (a) => s.tasks.update(user, a.task_id, { assigneeId: a.assignee_id }),
  );
  kit.tool(
    'list_comments',
    {
      description: 'Comments on a task.',
      scope: read,
      kind: 'read',
      input: { task_id: id },
    },
    (a) => s.tasks.comments(user, a.task_id),
  );
  kit.tool(
    'add_comment',
    {
      description: 'Comment on a task.',
      scope: write,
      kind: 'create',
      input: { task_id: id, body: z.string().trim().min(1).max(2000) },
    },
    (a) => s.tasks.addComment(user, a.task_id, a.body),
  );

  // ---------------------------------------------------------------- tags
  kit.tool(
    'list_tags',
    {
      description: 'Your tags with open task counts.',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.tags.all(user),
  );
  kit.tool(
    'create_tag',
    {
      description: 'Create a tag.',
      scope: write,
      kind: 'create',
      input: { name: tag, color: color.optional() },
    },
    (a) => s.tags.create(user, parseWith(tagSchema, a)),
  );
  kit.tool(
    'update_tag',
    {
      description: 'Rename a tag or change its colour.',
      scope: write,
      kind: 'update',
      input: { tag_id: id, name: tag.optional(), color: color.optional() },
    },
    ({ tag_id, ...patch }) =>
      s.tags.update(user, tag_id, parseWith(updateTagSchema, patch)),
  );
  kit.tool(
    'delete_tag',
    {
      description: 'Delete a tag; it is removed from every task.',
      scope: write,
      kind: 'delete',
      input: { tag_id: id },
    },
    (a) => s.tags.remove(user, a.tag_id),
  );

  // ---------------------------------------------------------------- habits
  const habitFields = {
    name: z.string().min(1).max(100),
    icon: z
      .string()
      .regex(/^lucide[A-Z][A-Za-z0-9]{1,36}$/)
      .optional()
      .describe('Lucide icon name, e.g. lucideGlassWater'),
    color: color.optional(),
    goal: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Check-ins needed per day'),
    unit: z.string().max(20).optional(),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .optional()
      .describe('0 = Sunday … 6 = Saturday'),
    section_id: id.nullable().optional(),
  };
  kit.tool(
    'list_habits',
    {
      description:
        'Your habits with streaks and the past 90 days of check-ins.',
      scope: read,
      kind: 'read',
      input: { include_archived: z.boolean().optional() },
    },
    (a) => s.habits.all(user, undefined, a.include_archived),
  );
  kit.tool(
    'get_habit_checkins',
    {
      description: `Check-ins of every habit between two dates, at most ${PLANNER_LIMITS.checkinDays} days.`,
      scope: read,
      kind: 'read',
      input: { start_date: date, end_date: date },
    },
    async (a) => {
      range(
        a.start_date,
        a.end_date,
        PLANNER_LIMITS.checkinDays + 1,
        'The range',
      );
      const habits = await s.habits.all(
        user,
        { from: a.start_date, to: a.end_date },
        true,
      );
      return habits.map((h) => ({
        habit_id: h.id,
        name: h.name,
        goal: h.goal,
        checkins: h.checkins,
      }));
    },
  );
  kit.tool(
    'list_habit_sections',
    {
      description: 'Sections that group habits.',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.habits.sections(user),
  );
  kit.tool(
    'create_habit_section',
    {
      description: 'Create a habit section (e.g. Morning).',
      scope: write,
      kind: 'create',
      input: { name: z.string().min(1).max(100) },
    },
    (a) => s.habits.createSection(user, a),
  );
  kit.tool(
    'create_habit',
    {
      description: 'Create a habit.',
      scope: write,
      kind: 'create',
      input: habitFields,
    },
    (a) => s.habits.create(user, parseWith(createHabitSchema, camel(a))),
  );
  kit.tool(
    'update_habit',
    {
      description: 'Change a habit; archived=true hides it.',
      scope: write,
      kind: 'update',
      input: z
        .object(habitFields)
        .partial()
        .extend({ habit_id: id, archived: z.boolean().optional() }),
    },
    ({ habit_id, ...patch }) =>
      s.habits.update(
        user,
        habit_id,
        parseWith(updateHabitSchema, camel(patch)),
      ),
  );
  kit.tool(
    'delete_habit',
    {
      assistant: false,
      description: 'Delete a habit and all its check-ins.',
      scope: write,
      kind: 'delete',
      input: { habit_id: id },
    },
    (a) => s.habits.remove(user, a.habit_id),
  );
  kit.tool(
    'checkin_habit',
    {
      description: `Set a day's check-in count for a habit (today or up to ${PLANNER_LIMITS.checkinDays} days back). value 0 clears the day; the day is complete when value reaches the goal.`,
      scope: write,
      kind: 'update',
      input: {
        habit_id: id,
        date,
        value: z.number().int().min(0).max(1000).default(1),
      },
    },
    (a) =>
      s.habits.checkin(
        user,
        a.habit_id,
        parseWith(checkinSchema, { date: a.date, value: a.value }),
      ),
  );

  // ---------------------------------------------------------------- focus
  kit.tool(
    'list_focus_records',
    {
      description:
        'Focus (Pomodoro / stopwatch) records starting between two date-times, at most one month apart, with the total minutes.',
      scope: read,
      kind: 'read',
      input: { from: dateTime, to: dateTime },
    },
    (a) => s.focus.list(user, a),
  );
  kit.tool(
    'create_focus_record',
    {
      description:
        'Record a finished focus session; the duration is end minus start and cannot change later.',
      scope: write,
      kind: 'create',
      input: {
        start_at: dateTime,
        end_at: dateTime,
        kind: z.enum(FOCUS_KINDS).optional(),
        task_id: id.nullable().optional(),
        note: z.string().max(1000).optional(),
      },
    },
    (a) => s.focus.create(user, parseWith(createFocusSchema, camel(a))),
  );
  kit.tool(
    'update_focus_record',
    {
      description:
        'Change the note or linked task of a focus record, or move its start (the end moves with it; the duration never changes).',
      scope: write,
      kind: 'update',
      input: {
        focus_id: id,
        note: z.string().max(1000).optional(),
        task_id: id.nullable().optional(),
        start_at: dateTime.optional(),
      },
    },
    ({ focus_id, ...patch }) =>
      s.focus.update(
        user,
        focus_id,
        parseWith(updateFocusSchema, camel(patch)),
      ),
  );
  kit.tool(
    'delete_focus_record',
    {
      description: 'Delete a focus record.',
      scope: write,
      kind: 'delete',
      input: { focus_id: id },
    },
    (a) => s.focus.remove(user, a.focus_id),
  );

  // ---------------------------------------------------------------- calendars
  kit.tool(
    'list_calendars',
    {
      description: 'Your subscribed (ICS) calendars.',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.calendars.all(user),
  );
  kit.tool(
    'list_calendar_events',
    {
      description: `Events of your subscribed calendars between two dates (inclusive, Tehran time), at most ${PLANNER_LIMITS.eventDays} days. All-day events have date-only start/end (end exclusive).`,
      scope: read,
      kind: 'read',
      input: { start_date: date, end_date: date, calendar_id: id.optional() },
    },
    (a) =>
      s.calendars.events(
        user,
        { from: a.start_date, to: a.end_date },
        a.calendar_id,
      ),
  );
  kit.tool(
    'subscribe_calendar',
    {
      assistant: false,
      description:
        'Subscribe to an iCal feed (https:// or webcal:// .ics link). It is read-only.',
      scope: write,
      kind: 'create',
      input: {
        name: z.string().min(1).max(100),
        url: z.string().max(2000),
        color: color.optional(),
      },
    },
    (a) => s.calendars.create(user, parseWith(createCalendarSchema, a)),
  );
  kit.tool(
    'unsubscribe_calendar',
    {
      description: 'Remove a subscribed calendar.',
      scope: write,
      kind: 'delete',
      input: { calendar_id: id },
    },
    (a) => s.calendars.remove(user, a.calendar_id),
  );

  // ---------------------------------------------------------------- countdowns
  const countdownFields = {
    title: z.string().min(1).max(200),
    date,
    kind: z.enum(COUNTDOWN_KINDS).optional(),
    repeat_yearly: z
      .boolean()
      .optional()
      .describe('Birthdays and anniversaries repeat by default'),
    color: color.optional(),
    note: z.string().max(500).optional(),
  };
  kit.tool(
    'list_countdowns',
    {
      description: 'Your countdowns with days left.',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.countdowns.all(user),
  );
  kit.tool(
    'create_countdown',
    {
      description: 'Create a countdown, birthday, anniversary or holiday.',
      scope: write,
      kind: 'create',
      input: countdownFields,
    },
    (a) =>
      s.countdowns.create(user, parseWith(createCountdownSchema, camel(a))),
  );
  kit.tool(
    'update_countdown',
    {
      description: 'Change a countdown.',
      scope: write,
      kind: 'update',
      input: z.object(countdownFields).partial().extend({ countdown_id: id }),
    },
    ({ countdown_id, ...patch }) =>
      s.countdowns.update(
        user,
        countdown_id,
        parseWith(updateCountdownSchema, camel(patch)),
      ),
  );
  kit.tool(
    'delete_countdown',
    {
      description: 'Delete a countdown.',
      scope: write,
      kind: 'delete',
      input: { countdown_id: id },
    },
    (a) => s.countdowns.remove(user, a.countdown_id),
  );
}
