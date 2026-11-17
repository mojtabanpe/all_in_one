/** Reminders more than a week before the task are not supported (and not sent). */
export const REMINDER_MAX_MINUTES = 7 * 1440;

const DURATION =
  /^(?:TRIGGER:)?(-)?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/**
 * Minutes before the task's time for a relative reminder, or null when the value is not one (an absolute TickTick
 * trigger, a reminder after the task, or garbage). Accepts every ISO 8601 spelling a client may send — `PT0S`,
 * `-PT15M`, `-PT1H`, `-P1D`, `-PT1H30M` — not only the four the task screen offers.
 */
export function reminderMinutesBefore(value: string): number | null {
  const match = DURATION.exec(value.trim().toUpperCase());
  if (!match || !(match[2] || match[3] || match[4] || match[5])) return null;
  const minutes =
    Number(match[2] ?? 0) * 1440 +
    Number(match[3] ?? 0) * 60 +
    Number(match[4] ?? 0) +
    Math.floor(Number(match[5] ?? 0) / 60);
  // A positive offset means after the task's time; only "at the time" is meaningful without the minus sign.
  if (!match[1] && minutes > 0) return null;
  return minutes <= REMINDER_MAX_MINUTES ? minutes : null;
}

/**
 * One spelling per relative reminder (`TRIGGER:PT0M`, `TRIGGER:-PT15M`), so the task screen recognises what the
 * assistant, ChatGPT or an import saved. Values that are not relative reminders are kept as they were (TickTick
 * metadata); duplicates are dropped.
 */
export function normalizeReminders(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const minutes = reminderMinutesBefore(value);
    const normal =
      minutes === null
        ? value
        : minutes === 0
          ? 'TRIGGER:PT0M'
          : `TRIGGER:-PT${minutes}M`;
    if (!out.includes(normal)) out.push(normal);
  }
  return out;
}
