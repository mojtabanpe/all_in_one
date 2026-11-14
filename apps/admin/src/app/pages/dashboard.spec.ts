import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Dashboard } from './dashboard';

describe('Dashboard churn by channel', () => {
  it('shows separate app clients, preserves zero counts and explains what is measured', async () => {
    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(Dashboard);
    const http = TestBed.inject(HttpTestingController);
    await new Promise((resolve) => setTimeout(resolve));
    http
      .expectOne((request) => request.url.endsWith('/growth/clients'))
      .flush({
        from: '2026-10-16',
        to: '2026-11-14',
        rows: [
          { client: 'bazaar', visitors: 7 },
          { client: 'myket', visitors: 0 },
          { client: 'direct_apk', visitors: 3 },
          { client: 'pwa', visitors: 4 },
          { client: 'web', visitors: 5 },
        ],
      });
    for (let round = 0; round < 3; round++) {
      for (const request of http.match(() => true))
        request.flush(null, { status: 500, statusText: 'Server Error' });
      await new Promise((resolve) => setTimeout(resolve));
    }
    await fixture.whenStable();
    const table = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('table'),
    ].find((element) => element.textContent?.includes('APK'));
    expect(table).toBeDefined();
    if (!table) throw new Error('App distribution table is missing');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(table.textContent).toContain('کافه‌بازار');
    expect(table.textContent).toContain('مایکت');
    expect(table.textContent).toContain('۰');
    expect(table.textContent).toContain('PWA');
    http.verify();
  });
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

    const select = (
      fixture.nativeElement as HTMLElement
    ).querySelector<HTMLSelectElement>('#retention-channel')!;
    select.value = 'source=telegram&medium=social';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    TestBed.tick();
    http
      .expectOne((request) =>
        request.url.endsWith(
          '/growth/retention-cohorts?source=telegram&medium=social',
        ),
      )
      .flush([]);

    select.value = '';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    TestBed.tick();
    http
      .expectOne((request) => request.url.endsWith('/growth/retention-cohorts'))
      .flush([]);
  });
});
