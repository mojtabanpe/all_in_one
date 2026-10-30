const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** Formats a YYYY-MM-DD (or ISO) date in Persian with the Solar Hijri calendar. */
export function faDate(
  iso: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' },
): string {
  const key = JSON.stringify(options);
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: 'UTC',
      ...options,
    });
    dateFormatters.set(key, formatter);
  }
  const date = iso.length === 10 ? new Date(`${iso}T00:00:00Z`) : new Date(iso);
  // Intl writes a Latin comma ("۸ آبان, جمعه"); use the Persian one.
  return formatter.format(date).replace(/,/g, '،');
}

/** Persian digits with grouping, e.g. 2,260 → ۲٬۲۶۰. */
export function faNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return value.toLocaleString('fa-IR', options);
}
