/**
 * The existing health API stores only a Gregorian year, without a month/day.
 * Use the Gregorian year containing Farvardin as its stable year-only mapping.
 * This preserves existing API values on a load/save round trip; an exact birth
 * date cannot be recovered from a year alone.
 */
export function persianBirthYear(year: number | null | undefined): number {
  return year ? year - 621 : 0;
}
export function gregorianBirthYear(year: number): number | null {
  return year ? year + 621 : null;
}
