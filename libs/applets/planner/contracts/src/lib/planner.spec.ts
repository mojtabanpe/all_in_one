import {
  addDays,
  compareTasks,
  createTaskSchema,
  type PlannerTask,
  updateTaskSchema,
} from './planner';

const task = (over: Partial<PlannerTask>): PlannerTask => ({
  id: '1',
  title: 't',
  notes: null,
  date: '2026-10-29',
  time: null,
  priority: 'MEDIUM',
  area: 'personal',
  done: false,
  completedAt: null,
  ...over,
});

describe('planner contracts', () => {
  it('fills defaults when creating a task', () => {
    const parsed = createTaskSchema.parse({
      title: '  خرید  ',
      date: '2026-10-29',
    });
    expect(parsed).toEqual({
      title: 'خرید',
      date: '2026-10-29',
      priority: 'MEDIUM',
      area: 'personal',
    });
  });

  it('rejects bad times and empty titles', () => {
    expect(
      createTaskSchema.safeParse({
        title: 'x',
        date: '2026-10-29',
        time: '25:00',
      }).success,
    ).toBe(false);
    expect(
      createTaskSchema.safeParse({ title: '   ', date: '2026-10-29' }).success,
    ).toBe(false);
  });

  it('allows partial updates', () => {
    expect(updateTaskSchema.parse({ done: true })).toEqual({ done: true });
  });

  it('sorts open, timed, high-priority tasks first', () => {
    const sorted = [
      task({ id: 'done', done: true }),
      task({ id: 'untimed-high', priority: 'HIGH' }),
      task({ id: 'nine', time: '09:00', priority: 'LOW' }),
      task({ id: 'eight', time: '08:00' }),
    ].sort(compareTasks);
    expect(sorted.map((t) => t.id)).toEqual([
      'eight',
      'nine',
      'untimed-high',
      'done',
    ]);
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
