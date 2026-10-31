import {
  taskOccurrences,
  normalizeRepeatRule,
  zonedInstant,
} from './recurrence';
import { createTaskSchema, updateTaskSchema, taskIdSchema } from './planner';
import { tickTickSchedule } from './ticktick';

const base = {
  date: '2026-10-30',
  time: '10:00',
  repeatRule: 'RRULE:FREQ=DAILY',
  recurrenceTimezone: 'Asia/Tehran',
};
const dates = (rule: string, from = '2026-10-30', to = '2026-11-10') =>
  taskOccurrences({ ...base, repeatRule: rule }, from, to).map((s) => s.date);
describe('native RFC5545 recurrence', () => {
  it('projects the TickTick daily schedule at Tehran time', () => {
    const slots = taskOccurrences(base, '2026-10-30', '2026-11-01');
    expect(slots.map((s) => [s.date, s.time])).toEqual([
      ['2026-10-30', '10:00'],
      ['2026-10-31', '10:00'],
      ['2026-11-01', '10:00'],
    ]);
    expect(slots[0].startsAt).toBe('2026-10-30T06:30:00.000Z');
  });
  it('selects Saturday and Wednesday', () =>
    expect(dates('RRULE:FREQ=WEEKLY;BYDAY=SA,WE')).toEqual([
      '2026-10-31',
      '2026-11-04',
      '2026-11-07',
    ]));
  it('uses intervals', () =>
    expect(dates('FREQ=DAILY;INTERVAL=3')).toEqual([
      '2026-10-30',
      '2026-11-02',
      '2026-11-05',
      '2026-11-08',
    ]));
  it('counts from DTSTART even when a query starts later', () =>
    expect(dates('FREQ=DAILY;COUNT=3', '2026-11-01')).toEqual(['2026-11-01']));
  it('honors UTC UNTIL', () =>
    expect(dates('FREQ=DAILY;UNTIL=20261031T063000Z')).toEqual([
      '2026-10-30',
      '2026-10-31',
    ]));
  it('honors date-only UNTIL and separate inclusive end', () => {
    expect(dates('FREQ=DAILY;UNTIL=20261031')).toEqual([
      '2026-10-30',
      '2026-10-31',
    ]);
    expect(
      taskOccurrences(
        { ...base, recurrenceEnd: '2026-10-31' },
        '2026-10-30',
        '2026-11-10',
      ),
    ).toHaveLength(2);
  });
  it('skips nonexistent month days instead of clamping them', () =>
    expect(
      taskOccurrences(
        { ...base, date: '2026-01-31', repeatRule: 'FREQ=MONTHLY' },
        '2026-01-01',
        '2026-05-31',
      ).map((s) => s.date),
    ).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']));
  it('supports yearly leap days', () =>
    expect(
      taskOccurrences(
        { ...base, date: '2024-02-29', repeatRule: 'FREQ=YEARLY' },
        '2024-01-01',
        '2030-12-31',
      ).map((s) => s.date),
    ).toEqual(['2024-02-29', '2028-02-29']));
  it('supports last weekday and BYSETPOS custom rules', () =>
    expect(
      taskOccurrences(
        {
          ...base,
          date: '2026-01-01',
          repeatRule: 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
        },
        '2026-01-01',
        '2026-03-31',
      ).map((s) => s.date),
    ).toEqual(['2026-01-30', '2026-02-27', '2026-03-31']));
  it('is bounded and excludes edited/completed keys without shifting COUNT', () => {
    expect(
      taskOccurrences(
        { ...base, excludedDates: ['2026-10-31'] },
        '2026-10-30',
        '2030-01-01',
        3,
      ).map((s) => s.date),
    ).toEqual(['2026-10-30', '2026-11-01', '2026-11-02']);
  });
  it('keeps a New York morning at 10 through daylight saving', () => {
    const slots = taskOccurrences(
      { ...base, date: '2026-10-31', recurrenceTimezone: 'America/New_York' },
      '2026-10-31',
      '2026-11-02',
    );
    expect(slots.map((s) => s.startsAt)).toEqual([
      '2026-10-31T14:00:00.000Z',
      '2026-11-01T15:00:00.000Z',
      '2026-11-02T15:00:00.000Z',
    ]);
    expect(slots.map((s) => s.time)).toEqual(['17:30', '18:30', '18:30']);
  });
  it('skips a spring gap and uses the first instant of a repeated clock', () => {
    expect(zonedInstant('2026-03-08', '02:30', 'America/New_York')).toBeNull();
    expect(
      zonedInstant('2026-11-01', '01:30', 'America/New_York')?.toISOString(),
    ).toBe('2026-11-01T05:30:00.000Z');
    expect(
      taskOccurrences(
        {
          ...base,
          date: '2026-03-07',
          time: '02:30',
          recurrenceTimezone: 'America/New_York',
          repeatRule: 'FREQ=DAILY;COUNT=2',
        },
        '2026-03-07',
        '2026-03-10',
      ).map((s) => s.key),
    ).toEqual(['2026-03-07', '2026-03-09']);
  });
  it('normalizes prefixes and rejects unsafe or ambiguous rules', () => {
    expect(normalizeRepeatRule('freq=weekly;byday=sa')).toBe(
      'RRULE:FREQ=WEEKLY;BYDAY=SA',
    );
    for (const rule of [
      'FREQ=SECONDLY',
      'FREQ=DAILY;INTERVAL=0',
      'FREQ=DAILY;COUNT=1;UNTIL=20270101',
      'FREQ=WEEKLY;BYDAY=BO',
      'FREQ=DAILY;BYHOUR=1,2',
      'FREQ=MONTHLY;BYMONTH=13',
      'FREQ=WEEKLY;BYDAY=2MO',
      'FREQ=DAILY;FREQ=YEARLY',
    ])
      expect(() => normalizeRepeatRule(rule)).toThrow();
  });
  it('retains one-off contracts and validates recurrence fields', () => {
    expect(createTaskSchema.parse({ title: 'one off' })).toEqual({
      title: 'one off',
    });
    expect(
      createTaskSchema.safeParse({ title: 'x', repeatRule: 'bad' }).success,
    ).toBe(false);
    expect(
      createTaskSchema.safeParse({
        title: 'x',
        recurrenceTimezone: 'Mars/Unknown',
      }).success,
    ).toBe(false);
    expect(
      updateTaskSchema.parse({ recurrenceScope: 'FUTURE', repeatRule: null }),
    ).toEqual({ recurrenceScope: 'FUTURE', repeatRule: null });
    expect(
      taskIdSchema.safeParse('0190f5e2-0000-7000-8000-00000000000a@2026-10-31')
        .success,
    ).toBe(true);
  });
  it('preserves TickTick offsets, duration and completion basis', () => {
    const task = {
      id: 'reading',
      startDate: '2026-10-30T10:00:00+0330',
      dueDate: '2026-10-30T10:15:00+0330',
      timeZone: 'Asia/Tehran',
      repeatFlag: 'RRULE:FREQ=DAILY',
      repeatFrom: '0' as const,
    };
    expect(tickTickSchedule(task)).toEqual({
      ...base,
      durationMin: 15,
      repeatFrom: 'SCHEDULE',
    });
    expect(tickTickSchedule({ ...task, repeatFrom: '1' }).repeatFrom).toBe(
      'COMPLETION',
    );
    expect(() =>
      tickTickSchedule({ ...task, startDate: '2026-10-30T10:00:00' }),
    ).toThrow();
  });
});
