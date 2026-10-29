import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('public App', () => {
  it('shows the floating bottom nav with the public pages', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const nav = fixture.nativeElement.querySelector(
      'aio-bottom-nav nav',
    ) as HTMLElement;
    expect(nav.textContent).toContain('اپلت‌ها');
    expect(nav.textContent).toContain('درباره');
  });
});
