import { asciiDigits, translateMessage } from './localization';
import { MESSAGES } from './messages';

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
    for (const [fa, en] of MESSAGES) {
      const slots = (s: string) =>
        [...new Set(s.match(/\{\d+\}/g) ?? [])].sort();
      expect(slots(fa), fa).toEqual(slots(en));
    }
  });
});
