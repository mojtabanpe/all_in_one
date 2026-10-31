export const PLANNER_TIME_ZONE = 'Asia/Tehran';
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const timeFormats = new Map<string, Intl.DateTimeFormat>();
/** YYYY-MM-DD of `date` in a time zone. */
export function isoDateIn(date: Date, timeZone = PLANNER_TIME_ZONE): string {
  let formatter = dateFormats.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormats.set(timeZone, formatter);
  }
  return formatter.format(date);
}

/** "HH:mm" of `date` in a time zone. */
export function timeIn(date: Date, timeZone = PLANNER_TIME_ZONE): string {
  let formatter = timeFormats.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    timeFormats.set(timeZone, formatter);
  }
  return formatter.format(date);
}
