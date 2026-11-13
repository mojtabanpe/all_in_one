import { fromLocalInput } from './time-format';

const MINUTE = 60_000;

/** Why a chosen end time cannot be saved, or null when it can. */
export function fastEndError(
  startedAt: string,
  endInput: string,
  now: number,
): string | null {
  const at = fromLocalInput(endInput);
  if (!at) return null;
  const time = at.getTime();
  if (time > now + MINUTE) return 'پایان نمی‌تواند در آینده باشد.';
  if (time <= Date.parse(startedAt)) return 'پایان باید بعد از شروع باشد.';
  return null;
}

/** The ISO end to send for a chosen time; a value within a minute of now is left to the server clock. */
export function chosenEnd(endInput: string, now: number): string | undefined {
  const at = fromLocalInput(endInput);
  return at && now - at.getTime() > MINUTE ? at.toISOString() : undefined;
}
