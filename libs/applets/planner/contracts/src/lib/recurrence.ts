import { RRule } from 'rrule';
import { isoDateIn, timeIn, PLANNER_TIME_ZONE } from './planner-time';

const addCalendarDays = (date: string, days: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000)
    .toISOString()
    .slice(0, 10);

export const REPEAT_FROM = ['SCHEDULE', 'COMPLETION'] as const;
export const RECURRENCE_SCOPES = ['OCCURRENCE', 'FUTURE', 'SERIES'] as const;
export const OCCURRENCE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@\d{4}-\d{2}-\d{2}$/i;
export function validTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** One daily-or-coarser RFC5545 rule. DTSTART belongs to the task, not the rule. */
export function normalizeRepeatRule(value: string): string {
  const rule = value
    .trim()
    .toUpperCase()
    .replace(/^RRULE:/, '');
  if (!rule || rule.length > 1000 || /[\r\n]/.test(rule))
    throw new Error('One RRULE is required');
  const entries = rule.split(';').map((p) => p.split('='));
  const allowed = new Set([
    'FREQ',
    'INTERVAL',
    'COUNT',
    'UNTIL',
    'BYDAY',
    'BYMONTHDAY',
    'BYMONTH',
    'BYSETPOS',
    'BYYEARDAY',
    'BYWEEKNO',
    'WKST',
  ]);
  if (
    entries.some(([k, v]) => !allowed.has(k) || !v) ||
    new Set(entries.map(([k]) => k)).size !== entries.length
  )
    throw new Error('Unsupported or duplicate RRULE property');
  const parts: Record<string, string> = Object.fromEntries(entries);
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(parts['FREQ']))
    throw new Error('Use DAILY, WEEKLY, MONTHLY or YEARLY');
  if (parts['COUNT'] && parts['UNTIL'])
    throw new Error('COUNT and UNTIL are mutually exclusive');
  for (const key of ['COUNT', 'INTERVAL'])
    if (
      parts[key] &&
      (!/^\d+$/.test(parts[key]) || +parts[key] < 1 || +parts[key] > 10000)
    )
      throw new Error(`Invalid ${key}`);
  if (parts['UNTIL'] && !/^\d{8}(T\d{6}Z)?$/.test(parts['UNTIL']))
    throw new Error('UNTIL must be YYYYMMDD or a UTC date-time');
  for (const [key, min, max] of [
    ['BYMONTH', 1, 12],
    ['BYMONTHDAY', -31, 31],
    ['BYYEARDAY', -366, 366],
    ['BYWEEKNO', -53, 53],
    ['BYSETPOS', -366, 366],
  ] as const) {
    if (
      parts[key]
        ?.split(',')
        .some((v) => !/^-?\d+$/.test(v) || +v === 0 || +v < min || +v > max)
    )
      throw new Error(`Invalid ${key}`);
  }
  if (
    parts['BYDAY']
      ?.split(',')
      .some((v) => !/^([+-]?[1-9]\d?)?(MO|TU|WE|TH|FR|SA|SU)$/.test(v))
  )
    throw new Error('Invalid BYDAY');
  if (
    parts['BYDAY'] &&
    /\d/.test(parts['BYDAY']) &&
    ['DAILY', 'WEEKLY'].includes(parts['FREQ'])
  )
    throw new Error('Ordinal weekdays require MONTHLY or YEARLY');
  if (parts['WKST'] && !/^(MO|TU|WE|TH|FR|SA|SU)$/.test(parts['WKST']))
    throw new Error('Invalid WKST');
  if (
    parts['BYDAY']
      ?.split(',')
      .some((v) => Math.abs(Number(v.slice(0, -2))) > 53)
  )
    throw new Error('Invalid ordinal weekday');
  if (parts['BYMONTHDAY'] && parts['FREQ'] === 'WEEKLY')
    throw new Error('BYMONTHDAY cannot be used with WEEKLY');
  if (
    parts['BYYEARDAY'] &&
    ['DAILY', 'WEEKLY', 'MONTHLY'].includes(parts['FREQ'])
  )
    throw new Error('BYYEARDAY requires YEARLY');
  if (parts['BYWEEKNO'] && parts['FREQ'] !== 'YEARLY')
    throw new Error('BYWEEKNO requires YEARLY');
  if (parts['BYWEEKNO'] && parts['BYDAY'] && /\d/.test(parts['BYDAY']))
    throw new Error('Ordinal BYDAY cannot be combined with BYWEEKNO');
  if (
    parts['BYSETPOS'] &&
    !entries.some(([k]) => k.startsWith('BY') && k !== 'BYSETPOS')
  )
    throw new Error('BYSETPOS requires another BY rule');
  if (parts['UNTIL']) {
    const compact = parts['UNTIL'];
    const date =
      compact.slice(0, 4) +
      '-' +
      compact.slice(4, 6) +
      '-' +
      compact.slice(6, 8);
    const time =
      compact.length > 8
        ? compact.slice(9, 11) +
          ':' +
          compact.slice(11, 13) +
          ':' +
          compact.slice(13, 15)
        : '00:00:00';
    const parsed = new Date(date + 'T' + time + 'Z');
    if (
      !Number.isFinite(+parsed) ||
      parsed.toISOString().slice(0, 19) !== date + 'T' + time
    )
      throw new Error('Invalid UNTIL');
  }
  const parsed = RRule.parseString(rule);
  new RRule({ ...parsed, dtstart: new Date('2026-01-01T00:00:00Z') });
  return `RRULE:${rule}`;
}
export function isRepeatRule(value: string): boolean {
  try {
    normalizeRepeatRule(value);
    return true;
  } catch {
    return false;
  }
}

/** RFC5545: first instant for a repeated clock time; nonexistent DST clocks are skipped. */
export function zonedInstant(
  date: string,
  time: string,
  zone: string,
): Date | null {
  const wall = Date.parse(`${date}T${time}:00Z`);
  const candidates = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const probe = new Date(wall + delta);
    const local = Date.parse(
      `${isoDateIn(probe, zone)}T${timeIn(probe, zone)}:00Z`,
    );
    candidates.add(wall - (local - probe.getTime()));
  }
  const matches = [...candidates]
    .filter(
      (t) =>
        isoDateIn(new Date(t), zone) === date &&
        timeIn(new Date(t), zone) === time,
    )
    .sort((a, b) => a - b);
  return matches.length ? new Date(matches[0]) : null;
}
export interface RecurrenceConfig {
  date: string;
  time: string | null;
  repeatRule: string;
  recurrenceTimezone: string;
  recurrenceEnd?: string | null;
  seriesUntil?: string | null;
  excludedDates?: string[];
  remainingCount?: number;
}
export interface TaskOccurrence {
  key: string;
  date: string;
  time: string | null;
  startsAt: string | null;
}
/** Bounded projection; no database writes. Date windows use the planner's Tehran calendar. */
export function taskOccurrences(
  config: RecurrenceConfig,
  from: string,
  to: string,
  limit = 500,
): TaskOccurrence[] {
  const normalized = normalizeRepeatRule(config.repeatRule);
  const options = RRule.parseString(normalized.slice(6));
  const until = options.until;
  const untilIsDate = /UNTIL=\d{8}(;|$)/.test(normalized);
  const maxCount = config.remainingCount ?? options.count ?? Infinity;
  // Count valid local instances, not nonexistent daylight-saving clocks.
  const rule = new RRule(
    {
      ...options,
      count: null,
      until: null,
      dtstart: new Date(`${config.date}T${config.time ?? '00:00'}:00Z`),
    },
    true,
  );
  const out: TaskOccurrence[] = [];
  let ordinal = 0;
  rule.between(
    new Date(
      `${!options.count && from > config.date ? addCalendarDays(from, -2) : config.date}T00:00:00Z`,
    ),
    new Date(Date.parse(`${to}T23:59:59Z`) + 2 * 86400000),
    true,
    (wall) => {
      const key = wall.toISOString().slice(0, 10);
      if (
        (config.recurrenceEnd && key > config.recurrenceEnd) ||
        (config.seriesUntil && key > config.seriesUntil)
      )
        return false;
      const at = config.time
        ? zonedInstant(key, config.time, config.recurrenceTimezone)
        : new Date(`${key}T00:00:00Z`);
      if (!at) return true;
      if (
        until &&
        (untilIsDate ? key > until.toISOString().slice(0, 10) : at > until)
      )
        return false;
      if (++ordinal > maxCount) return false;
      if (config.excludedDates?.includes(key)) return true;
      const date = config.time ? isoDateIn(at, PLANNER_TIME_ZONE) : key;
      if (date >= from && date <= to)
        out.push({
          key,
          date,
          time: config.time ? timeIn(at, PLANNER_TIME_ZONE) : null,
          startsAt: config.time ? at.toISOString() : null,
        });
      return out.length < limit;
    },
  );
  return out;
}
