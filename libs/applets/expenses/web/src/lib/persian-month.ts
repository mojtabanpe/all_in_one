import { tehranIsoDate } from '@all-in-one/applets/expenses/contracts';

const PERSIAN_MONTH_FORMATTER = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'UTC',
  month: 'long',
});

/** Current Persian Solar Hijri month name in Tehran time (e.g. «آذر»). */
export function tehranPersianMonthName(now: Date = new Date()): string {
  const iso = tehranIsoDate(now);
  return PERSIAN_MONTH_FORMATTER.format(new Date(`${iso}T12:00:00Z`));
}
