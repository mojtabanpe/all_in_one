import {
  compareTasks,
  createTaskSchema,
  habitStreak,
  inWindow,
  nextOccurrence,
  parseQuickAdd,
  type PlannerTask,
  presetWindow,
  taskFilterSchema,
  updateFocusSchema,
} from './planner';

const task = (over: Partial<PlannerTask>): PlannerTask => ({
  id: '1',
  listId: 'l',
  sectionId: null,
  title: 't',
  content: '',
  kind: 'TASK',
  date: '2026-10-29',
  time: null,
  priority: 'NONE',
  done: false,
  completedAt: null,
  deletedAt: null,
  tags: [],
  checklist: [],
  assigneeId: null,
  createdById: 'u',
  commentCount: 0,
  sortOrder: 0,
  createdAt: '2026-10-29T00:00:00.000Z',
  ...over,
});

describe('planner contracts', () => {
  it('accepts an undated task with only a title', () => {
    expect(createTaskSchema.parse({ title: '  خرید  ' })).toEqual({
      title: 'خرید',
    });
    expect(
      createTaskSchema.safeParse({ title: 'x', tags: ['a b'] }).success,
    ).toBe(false);
  });

  it('parses filter query strings', () => {
    const parsed = taskFilterSchema.parse({
      priorities: 'HIGH, MEDIUM',
      undated: 'true',
      limit: '20',
    });
    expect(parsed).toEqual({
      priorities: ['HIGH', 'MEDIUM'],
      undated: true,
      limit: 20,
    });
    expect(taskFilterSchema.safeParse({ limit: '1000' }).success).toBe(false);
  });

  it('does not let a focus update change the duration', () => {
    expect(
      updateFocusSchema.parse({ note: 'x', endAt: '2026-10-29T10:00:00Z' }),
    ).toEqual({ note: 'x' });
  });

  it('sorts open, dated, timed and urgent tasks first', () => {
    const tasks = [
      task({ id: 'done', done: true }),
      task({ id: 'undated', date: null }),
      task({ id: 'late', date: '2026-10-30' }),
      task({ id: 'untimed' }),
      task({ id: 'timed', time: '09:00' }),
      task({ id: 'high', priority: 'HIGH' }),
    ];
    expect(tasks.sort(compareTasks).map((t) => t.id)).toEqual([
      'timed',
      'high',
      'untimed',
      'late',
      'undated',
      'done',
    ]);
  });

  it('cuts the 24-hour presets at the current Tehran time', () => {
    // 10:00 UTC = 13:30 in Tehran
    const now = new Date('2026-10-29T10:00:00Z');
    expect(presetWindow('today', now)).toEqual({
      from: '2026-10-29',
      to: '2026-10-29',
    });
    const next = presetWindow('next24hour', now);
    expect(next).toEqual({
      from: '2026-10-29',
      to: '2026-10-30',
      after: '2026-10-29 13:30',
      before: '2026-10-30 13:30',
    });
    expect(inWindow({ date: '2026-10-29', time: '12:00' }, next)).toBe(false);
    expect(inWindow({ date: '2026-10-30', time: '12:00' }, next)).toBe(true);
    expect(inWindow({ date: '2026-10-30', time: null }, next)).toBe(true);
    expect(presetWindow('last7day', now).from).toBe('2026-10-23');
  });

  it('reads tags, priority and day words in quick add', () => {
    expect(parseQuickAdd('خرید نان #خانه !1 فردا', '2026-10-29')).toEqual({
      title: 'خرید نان',
      tags: ['خانه'],
      priority: 'HIGH',
      date: '2026-10-30',
    });
    expect(parseQuickAdd('فردا', '2026-10-29').title).toBe('فردا');
  });

  it('counts a habit streak over due days only', () => {
    // 2026-10-29 is a Thursday (4); the habit skips Wednesdays (3).
    const habit = { goal: 2, weekdays: [0, 1, 2, 4, 5, 6] };
    const checkins = [
      { date: '2026-10-27', value: 2 },
      { date: '2026-10-29', value: 3 },
    ];
    expect(habitStreak(habit, checkins, '2026-10-29')).toBe(2);
    // Today still open: the streak up to yesterday counts.
    expect(habitStreak(habit, checkins.slice(0, 1), '2026-10-29')).toBe(1);
    expect(
      habitStreak(habit, [{ date: '2026-10-29', value: 1 }], '2026-10-29'),
    ).toBe(0);
  });

  it('finds the next yearly occurrence', () => {
    expect(nextOccurrence('1990-11-02', true, '2026-10-29')).toBe('2026-11-02');
    expect(nextOccurrence('1990-03-01', true, '2026-10-29')).toBe('2027-03-01');
    expect(nextOccurrence('2024-02-29', true, '2026-10-29')).toBe('2027-03-01');
    expect(nextOccurrence('2026-01-01', false, '2026-10-29')).toBe(
      '2026-01-01',
    );
  });
});
