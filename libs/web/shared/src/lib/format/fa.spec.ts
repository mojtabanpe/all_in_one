import { faDate } from './fa';

describe('Persian date display', () => {
  const full = { day: 'numeric', month: 'long', year: 'numeric' } as const;
  it('uses Solar Hijri dates and Persian digits for stored calendar days', () => {
    expect(faDate('2026-03-21', full)).toContain('۱۴۰۵');
    expect(faDate('2026-03-21', full)).toContain('فروردین');
    expect(faDate('2026-03-21', full)).not.toMatch(/[0-9]/);
  });
  it('uses Tehran days for timestamps and preserves date-only days in the formatter cache', () => {
    expect(faDate('2026-03-20T21:00:00Z', full)).toContain('فروردین');
    expect(faDate('2026-03-20', full)).toContain('اسفند');
  });
});
