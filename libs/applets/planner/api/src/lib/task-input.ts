import { BadRequestException } from '@nestjs/common';
import {
  addDays,
  normalizeRepeatRule,
  validTimeZone,
  zonedInstant,
  timeIn,
  type CreateTaskInput,
  type UpdateTaskInput,
} from '@all-in-one/applets/planner/contracts';

interface ExistingClock {
  date: Date | null;
  time: string | null;
  timeZone: string | null;
  recurrenceTimezone: string;
  isSeries: boolean;
  durationMin: number | null;
  endTime: string | null;
}
/** Existing TickTick REST import fields are aliases of the native recurrence model, not another scheduler. */
export function nativeTaskInput<T extends CreateTaskInput | UpdateTaskInput>(
  input: T,
  current?: ExistingClock,
): T {
  const out = { ...input };
  const rule =
    input.repeatRule !== undefined ? input.repeatRule : input.recurrenceRule;
  if (rule !== undefined) {
    try {
      out.repeatRule = rule ? normalizeRepeatRule(rule) : null;
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (
      input.repeatRule !== undefined &&
      input.recurrenceRule !== undefined &&
      (input.recurrenceRule
        ? normalizeRepeatRule(input.recurrenceRule)
        : null) !== out.repeatRule
    )
      throw new BadRequestException('Conflicting recurrence aliases');
    out.recurrenceRule =
      out.repeatRule && out.repeatRule.length <= 500 ? out.repeatRule : null;
  }
  const zone =
    input.recurrenceTimezone ??
    (input.timeZone !== undefined
      ? (input.timeZone ?? 'Asia/Tehran')
      : undefined);
  if (zone !== undefined) {
    if (!validTimeZone(zone))
      throw new BadRequestException('Invalid IANA timezone');
    out.recurrenceTimezone = zone;
    out.timeZone = zone.length <= 80 ? zone : null;
  }
  const date =
    input.date !== undefined
      ? input.date
      : current?.date?.toISOString().slice(0, 10);
  const start = input.time !== undefined ? input.time : current?.time;
  const clockZone =
    zone ??
    (current?.isSeries ? current.recurrenceTimezone : current?.timeZone) ??
    'Asia/Tehran';
  if (input.durationMin === undefined && input.endTime !== undefined && start) {
    if (input.endTime === null) out.durationMin = null;
    else {
      const minutes = (clock: string) =>
        +clock.slice(0, 2) * 60 + +clock.slice(3);
      let duration = (minutes(input.endTime) - minutes(start) + 1440) % 1440;
      if (date) {
        const a = zonedInstant(date, start, clockZone);
        const b = zonedInstant(
          input.endTime > start ? date : addDays(date, 1),
          input.endTime,
          clockZone,
        );
        if (a && b) duration = (+b - +a) / 60000;
      }
      out.durationMin = duration > 0 ? duration : null;
    }
  }
  if (input.durationMin !== undefined && input.endTime === undefined && start) {
    const a = date ? zonedInstant(date, start, clockZone) : null;
    out.endTime =
      input.durationMin && a
        ? timeIn(new Date(+a + input.durationMin * 60000), clockZone)
        : null;
  }
  return out;
}
