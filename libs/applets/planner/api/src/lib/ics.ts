import { PLANNER_TIME_ZONE } from '@all-in-one/applets/planner/contracts';

/*
 * A small iCalendar (RFC 5545) reader for subscribed calendars: VEVENTs with
 * DTSTART/DTEND/DURATION, TZID or UTC or floating times, all-day dates,
 * RRULE (FREQ, INTERVAL, COUNT, UNTIL, weekly BYDAY), EXDATE and
 * RECURRENCE-ID overrides. Good enough for Google, Outlook and iCloud feeds.
 */

export interface IcsEvent {
  uid: string;
  title: string;
  location: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
}

interface Prop {
  params: Record<string, string>;
  value: string;
}

interface RawEvent {
  props: Map<string, Prop[]>;
}

const DAY_MS = 86_400_000;
const MAX_STEPS = 5000;

function unfold(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

function parseLine(line: string): [string, Prop] | null {
  const colon = findColon(line);
  if (colon < 0) return null;
  const [name, ...params] = line.slice(0, colon).split(';');
  const record: Record<string, string> = {};
  for (const p of params) {
    const eq = p.indexOf('=');
    if (eq > 0)
      record[p.slice(0, eq).toUpperCase()] = p
        .slice(eq + 1)
        .replace(/^"|"$/g, '');
  }
  return [name.toUpperCase(), { params: record, value: line.slice(colon + 1) }];
}

/** The first colon outside a quoted parameter value. */
function findColon(line: string): number {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) return i;
  }
  return -1;
}

const unescape = (s: string) =>
  s.replace(/\\([\\;,nN])/g, (_, c: string) =>
    c === 'n' || c === 'N' ? '\n' : c,
  );

/** Milliseconds a zone is ahead of UTC at an instant. */
function zoneOffset(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return local - Math.floor(at / 1000) * 1000;
}

function validZone(zone: string | undefined): string {
  if (!zone) return PLANNER_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return PLANNER_TIME_ZONE;
  }
}

/** Parses DATE or DATE-TIME values into an instant (all-day dates at UTC midnight). */
export function parseIcsDate(
  prop: Prop,
): { date: Date; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(
    prop.value.trim(),
  );
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const wall = Date.UTC(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0), +(s ?? 0));
  if (h === undefined || prop.params['VALUE'] === 'DATE')
    return { date: new Date(wall), allDay: true };
  if (z) return { date: new Date(wall), allDay: false };
  const zone = validZone(prop.params['TZID']);
  // Two passes settle the offset around DST changes.
  let at = wall - zoneOffset(wall, zone);
  at = wall - zoneOffset(at, zone);
  return { date: new Date(at), allDay: false };
}

function parseDuration(value: string): number | null {
  const m =
    /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
      value.trim(),
    );
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m;
  const ms =
    ((+(w ?? 0) * 7 + +(d ?? 0)) * 24 * 3600 +
      +(h ?? 0) * 3600 +
      +(mi ?? 0) * 60 +
      +(s ?? 0)) *
    1000;
  return sign === '-' ? -ms : ms;
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

interface Rule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count?: number;
  until?: number;
  byDay?: number[];
}

function parseRule(value: string): Rule | null {
  const parts = Object.fromEntries(
    value.split(';').map((p) => {
      const [k, v = ''] = p.split('=');
      return [k.toUpperCase(), v];
    }),
  );
  const freq = parts['FREQ'];
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;
  const until = parts['UNTIL']
    ? parseIcsDate({ params: {}, value: parts['UNTIL'] })
    : null;
  const byDay = parts['BYDAY']
    ?.split(',')
    .map((d: string) => WEEKDAYS.indexOf(d.slice(-2)))
    .filter((d: number) => d >= 0);
  return {
    freq: freq as Rule['freq'],
    interval: Math.max(1, Number(parts['INTERVAL']) || 1),
    count: parts['COUNT'] ? Number(parts['COUNT']) : undefined,
    // An all-day UNTIL includes that whole day.
    until: until
      ? until.date.getTime() + (until.allDay ? DAY_MS - 1 : 0)
      : undefined,
    byDay: freq === 'WEEKLY' && byDay?.length ? byDay : undefined,
  };
}

/** Occurrence starts of a rule, in order, from the first start. */
function* occurrences(start: Date, rule: Rule): Generator<Date> {
  let emitted = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    let batch: Date[];
    if (rule.freq === 'WEEKLY' && rule.byDay) {
      // The week (Sunday-based) `step * interval` weeks after the start's week.
      const weekStart =
        start.getTime() -
        start.getUTCDay() * DAY_MS +
        step * rule.interval * 7 * DAY_MS;
      batch = rule.byDay
        .slice()
        .sort()
        .map((d) => new Date(weekStart + d * DAY_MS))
        .filter((d) => d >= start);
    } else {
      const d = new Date(start);
      if (rule.freq === 'DAILY')
        d.setUTCDate(d.getUTCDate() + step * rule.interval);
      if (rule.freq === 'WEEKLY')
        d.setUTCDate(d.getUTCDate() + step * rule.interval * 7);
      if (rule.freq === 'MONTHLY')
        d.setUTCMonth(d.getUTCMonth() + step * rule.interval);
      if (rule.freq === 'YEARLY')
        d.setUTCFullYear(d.getUTCFullYear() + step * rule.interval);
      // Skip months without that day (e.g. the 31st), as RFC 5545 does.
      if (
        (rule.freq === 'MONTHLY' || rule.freq === 'YEARLY') &&
        d.getUTCDate() !== start.getUTCDate()
      )
        continue;
      batch = [d];
    }
    for (const d of batch) {
      if (rule.until !== undefined && d.getTime() > rule.until) return;
      if (rule.count !== undefined && emitted >= rule.count) return;
      emitted++;
      yield d;
    }
  }
}

/** Events overlapping [from, to). */
export function parseIcs(text: string, from: Date, to: Date): IcsEvent[] {
  const raw: RawEvent[] = [];
  let current: RawEvent | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') current = { props: new Map() };
    else if (line === 'END:VEVENT') {
      if (current) raw.push(current);
      current = null;
    } else if (current) {
      const parsed = parseLine(line);
      if (parsed)
        current.props.set(parsed[0], [
          ...(current.props.get(parsed[0]) ?? []),
          parsed[1],
        ]);
    }
  }

  const one = (e: RawEvent, name: string) => e.props.get(name)?.[0];
  const overridden = new Set<string>();
  for (const e of raw) {
    const rid = one(e, 'RECURRENCE-ID');
    const at = rid && parseIcsDate(rid);
    if (at) overridden.add(`${one(e, 'UID')?.value}|${at.date.getTime()}`);
  }

  const events: IcsEvent[] = [];
  for (const e of raw) {
    const startProp = one(e, 'DTSTART');
    const start = startProp && parseIcsDate(startProp);
    if (!start) continue;
    if (one(e, 'STATUS')?.value === 'CANCELLED') continue;
    const endProp = one(e, 'DTEND');
    const end = endProp && parseIcsDate(endProp);
    const duration = one(e, 'DURATION');
    let length = end
      ? end.date.getTime() - start.date.getTime()
      : duration
        ? (parseDuration(duration.value) ?? 0)
        : 0;
    if (start.allDay && length <= 0) length = DAY_MS;
    const uid = one(e, 'UID')?.value ?? `${start.date.getTime()}`;
    const base = {
      uid,
      title: unescape(one(e, 'SUMMARY')?.value ?? ''),
      location: unescape(one(e, 'LOCATION')?.value ?? ''),
      allDay: start.allDay,
    };
    const push = (at: Date) => {
      const until = at.getTime() + length;
      const overlaps = until > from.getTime() || (length === 0 && at >= from);
      if (overlaps && at < to)
        events.push({
          ...base,
          start: at,
          end: length ? new Date(until) : null,
        });
    };

    const ruleProp = one(e, 'RRULE');
    const rule =
      ruleProp && !one(e, 'RECURRENCE-ID') ? parseRule(ruleProp.value) : null;
    if (!rule) {
      push(start.date);
      continue;
    }
    const skip = new Set<number>();
    for (const ex of e.props.get('EXDATE') ?? [])
      for (const value of ex.value.split(',')) {
        const at = parseIcsDate({ params: ex.params, value });
        if (at) skip.add(at.date.getTime());
      }
    for (const at of occurrences(start.date, rule)) {
      if (at >= to) break;
      if (skip.has(at.getTime()) || overridden.has(`${uid}|${at.getTime()}`))
        continue;
      push(at);
    }
  }
  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}
