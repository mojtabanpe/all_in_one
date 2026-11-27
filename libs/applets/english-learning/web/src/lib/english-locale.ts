import { HttpErrorResponse } from '@angular/common/http';

export interface BilingualOption<TId extends string = string> {
  readonly id: TId;
  readonly label: string;
  readonly fa: string;
}

export interface LocalizedOption<TId extends string = string> {
  readonly id: TId;
  readonly label: string;
}

/** Pick pre-translated `{ id, label }` options for the active language so `aio-select-field` skips phrase translation. */
export function localizedOptions<TId extends string>(
  items: readonly BilingualOption<TId>[],
  english: boolean,
): LocalizedOption<TId>[] {
  return items.map((item) => ({
    id: item.id,
    label: english ? item.label : item.fa,
  }));
}

export const englishNumber = (value: number) => value.toLocaleString('en-US');

/** Gregorian date in English (Persian screens use `aioDate`). */
export const englishDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Tehran',
  }).format(new Date(iso));

const AI_QUOTA_EN: Record<string, string> = {
  chat: "Today's AI chat limit is used up. It resets tomorrow.",
  tts: "Today's text-to-speech limit is used up. It resets tomorrow.",
  stt: "Today's speech-to-text limit is used up. It resets tomorrow.",
};

/** Shared infrastructure can return Persian errors; never leak them into English. */
export function englishErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0)
      return 'Unable to connect. Check your connection and try again.';
    // A used-up daily AI quota is not a rate limit: say which service and when it comes back.
    if (error.status === 429 && error.error?.code === 'AI_QUOTA_REACHED')
      return (
        AI_QUOTA_EN[error.error.kind as string] ??
        "Today's AI limit is used up. It resets tomorrow."
      );
    if (error.status === 429)
      return 'Too many requests. Please try again shortly.';
    const message = error.error?.message;
    const candidate = Array.isArray(message) ? message[0] : message;
    if (typeof candidate === 'string' && !/\p{Script=Arabic}/u.test(candidate))
      return candidate;
  }
  return fallback;
}
