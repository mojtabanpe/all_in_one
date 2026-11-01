import { HttpErrorResponse } from '@angular/common/http';

export const englishNumber = (value: number) => value.toLocaleString('en-US');

/** Keep Solar Hijri calendar dates, with English month names and Latin digits. */
export const englishDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US-u-ca-persian', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Tehran',
  }).format(new Date(iso));

/** Shared infrastructure can return Persian errors; never leak them into English. */
export function englishErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0)
      return 'Unable to connect. Check your connection and try again.';
    if (error.status === 429)
      return 'Too many requests. Please try again shortly.';
    const message = error.error?.message;
    const candidate = Array.isArray(message) ? message[0] : message;
    if (typeof candidate === 'string' && !/\p{Script=Arabic}/u.test(candidate))
      return candidate;
  }
  return fallback;
}
