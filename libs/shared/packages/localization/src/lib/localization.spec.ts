import { asciiDigits, translateMessage } from './localization';
import { MESSAGES } from './messages';
import { REVIEWED_MESSAGES } from './reviewed-messages';

describe('application messages', () => {
  it('uses the chosen language regardless of the source language', () => {
    expect(translateMessage('خانه', 'en')).toBe('Home');
    expect(translateMessage('Home', 'fa')).toBe('خانه');
    expect(translateMessage('Poshtetgarm', 'fa')).toBe('Poshtetgarm');
    expect(translateMessage('Exercise', 'fa')).toBe('تمرین');
  });
  it('formats positional values and rendered dynamic copy without changing stored values', () => {
    expect(translateMessage('{0} از {1}', 'en', [2, 5])).toBe('2 of 5');
    expect(translateMessage('۲ روز پیاپی', 'en')).not.toMatch(
      /[\u0600-\u06ff]/,
    );
    expect(asciiDigits('۱۲٣۴')).toBe('1234');
    expect(translateMessage('My own task', 'en')).toBe('My own task');
  });
  it('keeps every translation’s positional placeholders intact', () => {
    for (const [fa, en] of [...MESSAGES, ...REVIEWED_MESSAGES]) {
      const slots = (s: string) =>
        [...new Set(s.match(/\{\d+\}/g) ?? [])].sort();
      expect(slots(fa), fa).toEqual(slots(en));
    }
  });
  it('uses reviewed complete sentences and preserves unknown user titles', () => {
    expect(translateMessage('عقب‌افتاده', 'en')).toBe('Overdue');
    expect(translateMessage('TRX کل بدن — هر روز ۳۰ دقیقه', 'en')).toBe(
      'Full-body TRX · 30 minutes daily',
    );
    expect(translateMessage('کل بدن A — سبک‌تر (روز هفتم)', 'en')).toBe(
      'Full body A — Lighter session (day 7)',
    );
    expect(translateMessage('اسکات با کش', 'en')).toBe('Resistance-band squat');
    expect(translateMessage('My own plan 30 دقیقه', 'en')).toBe(
      'My own plan 30 دقیقه',
    );
    expect(
      translateMessage('{0} از شروع، ساعت {1}', 'en', [
        '13 hours 31 minutes',
        '22:30',
      ]),
    ).toBe('13 hours 31 minutes elapsed · Started at 22:30');
  });
});
