import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Dashboard } from './dashboard';

describe('Dashboard churn by channel', () => {
  it('lists each channel with its churn and never-active share, then the total', async () => {
    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(Dashboard);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne((request) => request.url.endsWith('/growth/churn'))
      .flush({
        inactiveDays: 14,
        from: '2026-08-10',
        to: '2026-11-07',
        totals: { signups: 39, mature: 28, churned: 13, neverActive: 4 },
        rows: [
          {
            source: 'telegram',
            medium: 'social',
            signups: 31,
            mature: 24,
            churned: 10,
            neverActive: 3,
          },
          {
            source: 'direct',
            medium: 'unknown',
            signups: 8,
            mature: 4,
            churned: 3,
            neverActive: 1,
          },
        ],
      });
    // The dashboard's other sections fail; they show their own retry buttons.
    for (let round = 0; round < 3; round++) {
      for (const request of http.match(() => true))
        request.flush(null, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));
    }
    await fixture.whenStable();
    const table = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('table'),
    ].find((t) => t.textContent?.includes('telegram / social'));
    expect(table).toBeTruthy();
    const rows = [...table!.querySelectorAll('tbody tr')].map((row) =>
      row.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('telegram / social');
    expect(rows[0]).toContain('۴۱٫۷٪'); // 10 of 24 churned
    expect(rows[0]).toContain('(۱۰/۲۴)');
    expect(rows[1]).toContain('۷۵٪'); // 3 of 4
    expect(rows[2]).toContain('جمع همهٔ کانال‌ها');
    // A failed section (here every other one) shows its retry button instead of freezing the page.
    expect(fixture.nativeElement.textContent).toContain(
      'دریافت دوباره آمار نگهداشت',
    );
  });
});
