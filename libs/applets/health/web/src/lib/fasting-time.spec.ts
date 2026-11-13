import { chosenEnd, fastEndError } from './fasting-time';
import { fromLocalInput } from './time-format';

const at = (value: string) => {
  const date = fromLocalInput(value);
  if (!date) throw new Error(`Invalid date ${value}`);
  return date;
};
const start = '2026-11-13T20:00';
const startedAt = at(start).toISOString();
const now = Date.parse('2026-11-13T23:00');

describe('fast end times', () => {
  it('accepts an end between the start and now', () => {
    expect(fastEndError(startedAt, '2026-11-13T22:30', now)).toBeNull();
    expect(fastEndError(startedAt, '2026-11-13T20:01', now)).toBeNull();
  });

  it('rejects an end in the future or before the start', () => {
    expect(fastEndError(startedAt, '2026-11-13T23:05', now)).toBe(
      'پایان نمی‌تواند در آینده باشد.',
    );
    expect(fastEndError(startedAt, '2026-11-13T19:30', now)).toBe(
      'پایان باید بعد از شروع باشد.',
    );
    expect(fastEndError(startedAt, start, now)).toBe(
      'پایان باید بعد از شروع باشد.',
    );
  });

  it('ignores an empty field', () => {
    expect(fastEndError(startedAt, '', now)).toBeNull();
  });

  it('sends a chosen past end and leaves "now" to the server', () => {
    expect(chosenEnd('2026-11-13T22:00', now)).toBe(
      at('2026-11-13T22:00').toISOString(),
    );
    expect(chosenEnd('2026-11-13T22:59', now)).toBeUndefined();
    expect(chosenEnd('', now)).toBeUndefined();
  });
});
