import { TestBed } from '@angular/core/testing';
import { AioDatePipe, AioLocale } from './locale';

describe('aioDate', () => {
  it('shows Solar Hijri in Persian and Gregorian in English', () => {
    const locale = TestBed.inject(AioLocale);
    const pipe = TestBed.runInInjectionContext(() => new AioDatePipe());
    const opts = { year: 'numeric', month: 'long', day: 'numeric' } as const;
    locale.setLanguage('fa');
    expect(pipe.transform('2026-11-02', opts)).toContain('۱۴۰۵');
    locale.setLanguage('en');
    expect(pipe.transform('2026-11-02', opts)).toBe('November 2, 2026');
    expect(pipe.transform('', opts)).toBe('');
  });
});
