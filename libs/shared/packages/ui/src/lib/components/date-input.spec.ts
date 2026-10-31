import { TestBed } from '@angular/core/testing';
import { AioDateInput, isoToJalali, jalaliToIso } from './date-input';

describe('Persian date control', () => {
  it('converts Nowruz and leap Esfand without changing the ISO calendar day', () => {
    for (const [iso, expected] of [
      ['2025-03-20', [1403, 12, 30]],
      ['2025-03-21', [1404, 1, 1]],
      ['2026-03-21', [1405, 1, 1]],
    ] as const) {
      const date = isoToJalali(iso);
      expect(date && [date.year, date.month, date.day]).toEqual(expected);
      expect(date && jalaliToIso(date)).toBe(iso);
    }
  });
  it('rejects empty and invalid API days instead of displaying a different day', () => {
    for (const value of ['', '1405/01/01', '2026-02-30', '2026-13-01']) {
      expect(isoToJalali(value)).toBeUndefined();
    }
  });
  it('shows a Persian year and honours disabled form controls', async () => {
    const fixture = TestBed.createComponent(AioDateInput);
    fixture.componentRef.setInput('value', '2026-03-21');
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('button');
    expect(button.textContent).toContain('۱۴۰۵');
    expect(button.textContent).toContain('فروردین');
    expect(button.textContent).not.toContain('2026');
    expect(button.disabled).toBe(true);
  });
});
