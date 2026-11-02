import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AioLocale, AioTranslate } from './locale';

@Component({
  imports: [AioTranslate],
  template: `<span>{{ 'خانه' | aioTranslate }}</span>`,
})
class Host {
  readonly locale = inject(AioLocale);
}

describe('application language', () => {
  afterEach(() => {
    localStorage.removeItem('poshtetgarm_language');
    document.cookie = 'poshtetgarm_language=; Path=/; Max-Age=0';
  });
  it('changes static copy, direction and numeric/date formatting immediately', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('خانه');
    const locale = fixture.componentInstance.locale;
    locale.setLanguage('en');
    await fixture.whenStable();
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
    expect(fixture.nativeElement.textContent).toContain('Home');
    expect(locale.number(123)).toBe('123');
    expect(locale.date('2026-11-02')).not.toMatch(/[\u0600-\u06ff]/);
    locale.setLanguage('fa');
    await fixture.whenStable();
    expect(document.documentElement.dir).toBe('rtl');
    expect(fixture.nativeElement.textContent).toContain('خانه');
    expect(locale.number(123)).toBe('۱۲۳');
  });
  it('restores a previous choice and ignores invalid stored values', () => {
    localStorage.setItem('poshtetgarm_language', 'en');
    expect(TestBed.inject(AioLocale).language()).toBe('en');
    TestBed.resetTestingModule();
    localStorage.setItem('poshtetgarm_language', 'invalid');
    expect(TestBed.inject(AioLocale).language()).toBe('fa');
  });
});
