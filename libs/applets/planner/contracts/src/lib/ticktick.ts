import * as z from 'zod/mini';
import { isoDateIn, timeIn } from './planner';
import { normalizeRepeatRule, validTimeZone } from './recurrence';

export const tickTickTaskSchema = z.object({
  id: z.string().check(z.minLength(1), z.maxLength(200)),
  existingTaskId: z.optional(z.uuid()),
  title: z.optional(z.string().check(z.maxLength(200))),
  startDate: z.string().check(z.maxLength(50)),
  dueDate: z.optional(z.nullable(z.string().check(z.maxLength(50)))),
  timeZone: z.optional(z.string().check(z.refine(validTimeZone))),
  repeatFlag: z.string().check(z.maxLength(1000)),
  repeatFrom: z.optional(
    z.union([z.literal('0'), z.literal('1'), z.literal(0), z.literal(1)]),
  ),
});
export const tickTickReconciliationSchema = z.object({
  tasks: z.array(tickTickTaskSchema).check(z.minLength(1), z.maxLength(50)),
});
export const applyTickTickReconciliationSchema = z.extend(
  tickTickReconciliationSchema,
  { approvedDigest: z.string().check(z.regex(/^[a-f0-9]{64}$/)) },
);
export type TickTickReconciliation = z.infer<
  typeof tickTickReconciliationSchema
>;
export type TickTickTask = z.infer<typeof tickTickTaskSchema>;
const instant = (value: string) => {
  // TickTick exports RFC822-style offsets, e.g. +0330; never interpret a date-time in the host timezone.
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(normalized))
    throw new Error('TickTick date-time requires an explicit offset');
  const d = new Date(normalized);
  if (!Number.isFinite(+d)) throw new Error('Invalid TickTick date-time');
  return d;
};
export function tickTickSchedule(task: TickTickTask) {
  const zone = task.timeZone ?? 'Asia/Tehran';
  const start = instant(task.startDate);
  const duration = task.dueDate
    ? (+instant(task.dueDate) - +start) / 60000
    : null;
  if (
    duration !== null &&
    (!Number.isInteger(duration) || duration < 1 || duration > 10080)
  )
    throw new Error('Invalid TickTick duration');
  return {
    date: isoDateIn(start, zone),
    time: timeIn(start, zone),
    durationMin: duration,
    repeatRule: normalizeRepeatRule(task.repeatFlag),
    repeatFrom:
      String(task.repeatFrom ?? '0') === '1'
        ? ('COMPLETION' as const)
        : ('SCHEDULE' as const),
    recurrenceTimezone: zone,
  };
}
