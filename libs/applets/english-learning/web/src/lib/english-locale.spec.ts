import { HttpErrorResponse } from '@angular/common/http';
import {
  englishDate,
  englishErrorMessage,
  englishNumber,
} from './english-locale';

describe('English applet locale', () => {
  it('uses Latin digits and English month names while retaining Solar Hijri dates', () => {
    expect(englishNumber(1234)).toBe('1,234');
    const date = englishDate('2026-11-01T12:00:00Z');
    expect(date).toContain('1405');
    expect(date).not.toMatch(/\p{Script=Arabic}/u);
  });
  it('does not display Persian infrastructure errors', () => {
    const error = new HttpErrorResponse({
      status: 502,
      error: { message: 'خطایی رخ داد' },
    });
    expect(englishErrorMessage(error, 'Unable to load cards.')).toBe(
      'Unable to load cards.',
    );
    expect(
      englishErrorMessage(new HttpErrorResponse({ status: 429 })),
    ).toContain('Too many requests');
  });
});
