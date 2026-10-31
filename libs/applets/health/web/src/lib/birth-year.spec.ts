import { persianBirthYear, gregorianBirthYear } from './birth-year';

describe('Persian birth year input', () => {
  it('accepts Persian years while preserving the existing API representation', () => {
    expect(persianBirthYear(1994)).toBe(1373);
    expect(gregorianBirthYear(1373)).toBe(1994);
    for (let year = 1920; year <= 2020; year++) {
      expect(gregorianBirthYear(persianBirthYear(year))).toBe(year);
    }
  });
  it('keeps an unset birth year unset', () => {
    expect(persianBirthYear(null)).toBe(0);
    expect(gregorianBirthYear(0)).toBeNull();
  });
});
