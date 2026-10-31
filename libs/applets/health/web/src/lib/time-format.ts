import { faNumber } from '@all-in-one/web/shared';

const two = (n: number) => faNumber(n, { minimumIntegerDigits: 2 });

/** A running timer, hours:minutes ("۱۲:۰۵"). */
export function timer(hours: number): string {
  const minutes = Math.floor(hours * 60);
  return `${faNumber(Math.floor(minutes / 60))}:${two(minutes % 60)}`;
}

/** "۱۲ ساعت و ۵ دقیقه" (minutes only below an hour). */
export function duration(hours: number): string {
  const minutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${faNumber(m)} دقیقه`;
  return m
    ? `${faNumber(h)} ساعت و ${faNumber(m)} دقیقه`
    : `${faNumber(h)} ساعت`;
}

const clock = new Intl.DateTimeFormat('fa-IR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Local time of day of an ISO instant ("۲۰:۳۰"). */
export function clockTime(iso: string): string {
  return clock.format(new Date(iso));
}

/** A Date as a `datetime-local` input value (local time, minutes). */
export function toLocalInput(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** Parses a `datetime-local` value as local time; null when empty or invalid. */
export function fromLocalInput(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
