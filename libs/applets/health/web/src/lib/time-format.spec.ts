import { clockTime, duration, timer } from './time-format';

describe('localized fasting time', () => {
  it('formats complete durations with singular and plural English units', () => {
    expect(duration(13 + 31 / 60, 'en')).toBe('13 hours 31 minutes');
    expect(duration(1 + 1 / 60, 'en')).toBe('1 hour 1 minute');
    expect(duration(0, 'en')).toBe('0 minutes');
    expect(duration(1.5, 'fa')).toBe('۱ ساعت و ۳۰ دقیقه');
  });
  it('keeps timer digits localized and clock times in Tehran', () => {
    expect(timer(13 + 31 / 60, 'en')).toBe('13:31');
    expect(timer(1.5, 'fa')).toBe('۱:۳۰');
    expect(clockTime('2026-11-02T19:00:00Z', 'en')).toBe('22:30');
    expect(clockTime('2026-11-02T19:00:00Z', 'fa')).toBe('۲۲:۳۰');
  });
});
