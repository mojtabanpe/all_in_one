import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AioDateInput, AioLocale } from '@all-in-one/ui';
import type {
  GrowthAccountActivationCoverage,
  GrowthAccountActivationMetric,
  GrowthAccountActivationMetrics,
  GrowthAccountActivationReport,
} from '@all-in-one/shared/schemas';
import { API_BASE_URL } from '@all-in-one/web/shared';
import { AccountActivationReport } from './account-activation-report';

const endpoint = '/configured-api/growth/account-activation';
const emptyMetric: GrowthAccountActivationMetric = {
  eligible: 0,
  successful: 0,
  percent: null,
};
const emptyMetrics: GrowthAccountActivationMetrics = {
  firstAction: emptyMetric,
  d1: emptyMetric,
  d7: emptyMetric,
  medianFirstActionMinutes: null,
};
const coverage: GrowthAccountActivationCoverage = {
  accounts: 0,
  excludedTestAccounts: 0,
  untimedReviewAccounts: 0,
  phoneOnlyAccounts: 0,
};
const emptyReport = (from: string, to: string) =>
  ({
    from,
    to,
    overall: emptyMetrics,
    coverage,
    bySource: [],
    bySignupPlatform: [],
  }) satisfies GrowthAccountActivationReport;

describe('Account activation report', () => {
  let fixture: ComponentFixture<AccountActivationReport>;
  let element: HTMLElement;
  let http: HttpTestingController;

  function request(from = '2026-10-26', to = '2026-11-24') {
    return http.expectOne({
      method: 'GET',
      url: `${endpoint}?from=${from}&to=${to}`,
    });
  }

  function selectDay(field: 'from' | 'to', day: string): void {
    const pickers = fixture.debugElement.queryAll(By.directive(AioDateInput));
    const picker: AioDateInput =
      pickers[field === 'from' ? 0 : 1].injector.get(AioDateInput);
    picker.value.set(day);
    fixture.detectChanges();
  }

  function submit(): void {
    const button = element.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    if (!button) throw new Error('Report submit button is missing');
    button.click();
    fixture.detectChanges();
    TestBed.tick();
  }

  beforeEach(() => {
    // November 24 in UTC and November 25 in Tehran.
    vi.setSystemTime(new Date('2026-11-24T21:00:00Z'));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/configured-api' },
      ],
    });
    fixture = TestBed.createComponent(AccountActivationReport);
    fixture.componentRef.setInput('platformLabel', (value: string) =>
      value === 'web' ? 'مرورگر وب' : value,
    );
    fixture.detectChanges();
    element = fixture.nativeElement;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  it('requests the last 30 complete Tehran days and applies an inclusive same-day range', async () => {
    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      'در حال دریافت گزارش فعال‌سازی حساب‌ها',
    );
    request().flush(emptyReport('2026-10-26', '2026-11-24'));
    await fixture.whenStable();

    selectDay('from', '2026-11-20');
    selectDay('to', '2026-11-19');
    submit();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'تاریخ شروع و پایان را به ترتیب',
    );
    http.expectNone((candidate) => candidate.url.startsWith(endpoint));

    selectDay('to', '2026-11-20');
    http.expectNone((candidate) => candidate.url.startsWith(endpoint));
    submit();
    request('2026-11-20', '2026-11-20').flush(
      emptyReport('2026-11-20', '2026-11-20'),
    );
    await fixture.whenStable();
    const selectedDay = TestBed.inject(AioLocale).date('2026-11-20', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    expect(element.textContent).toContain(
      `از ${selectedDay} تا ${selectedDay}`,
    );
    expect(element.textContent).toContain(
      'برای این بازه داده‌ای از ثبت‌نام حساب‌ها وجود ندارد.',
    );
    expect(element.querySelector('table')).toBeNull();
  });

  it('shows each grouping with supplied counts and rates and omits individual fields', async () => {
    const overall: GrowthAccountActivationMetrics = {
      firstAction: { eligible: 4, successful: 3, percent: 75 },
      d1: { eligible: 3, successful: 0, percent: 0 },
      d7: emptyMetric,
      medianFirstActionMinutes: 12.5,
    };
    const unknownMetrics: GrowthAccountActivationMetrics = {
      ...emptyMetrics,
      firstAction: { eligible: 1, successful: 0, percent: null },
    };
    const report = {
      from: '2026-10-26',
      to: '2026-11-24',
      overall,
      coverage: { ...coverage, accounts: 9, untimedReviewAccounts: 2 },
      bySource: [
        {
          source: 'telegram',
          metrics: { ...overall, medianFirstActionMinutes: 0 },
        },
        { source: null, metrics: unknownMetrics },
        { source: 'unknown', metrics: unknownMetrics },
        { source: 'direct', metrics: unknownMetrics },
        {
          source: 'other',
          metrics: { ...overall, medianFirstActionMinutes: 135 },
        },
      ],
      bySignupPlatform: [
        { signupPlatform: 'web', metrics: overall },
        { signupPlatform: null, metrics: unknownMetrics },
      ],
    } satisfies GrowthAccountActivationReport;
    // A contract drift: individual fields must never be shown even if sent.
    request().flush({
      ...report,
      accounts: [{ id: 'synthetic-individual-id', email: 'fake@example.test' }],
    });
    await fixture.whenStable();

    const [total, source, platform] = element.querySelectorAll('table');
    expect(total.caption?.textContent).toContain('کل حساب‌ها در بازه');
    const cells = [...total.querySelectorAll('tbody td')].map((cell) =>
      cell.textContent?.trim(),
    );
    expect(cells).toHaveLength(4);
    expect(cells[0]).toContain('۷۵٪');
    expect(cells[0]).toContain('۳/۴');
    expect(cells[1]).toContain('۰٪');
    expect(cells[1]).toContain('۰/۳');
    expect(cells[2]).toContain('حساب واجد شرایط ندارد');
    expect(cells[2]).toContain('۰/۰');
    expect(cells[3]).toBe('۱۲٫۵ دقیقه');

    expect(source.caption?.textContent).toContain('منبع جذب');
    expect(source.tBodies[0].rows).toHaveLength(5);
    expect(source.tBodies[0].rows[0].textContent).toContain('telegram');
    expect(source.tBodies[0].rows[0].cells[4].textContent?.trim()).toBe(
      '۰ دقیقه',
    );
    const labels = [...source.tBodies[0].rows].map((row) =>
      row.cells[0].textContent?.trim(),
    );
    expect(labels).toEqual([
      'telegram',
      'ثبت‌نشده (حساب قدیمی/بدون رضایت)',
      'نامشخص',
      'مستقیم',
      'سایر',
    ]);
    expect(source.tBodies[0].rows[4].cells[4].textContent?.trim()).toBe(
      '۲ ساعت و ۱۵ دقیقه',
    );
    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      'ممکن است کم‌شمارش باشد',
    );
    expect(element.textContent).toContain('حساب تست قدیمی');
    expect(source.tBodies[0].rows[1].cells[1].textContent).toContain(
      'غیرقابل محاسبه',
    );
    expect(source.tBodies[0].rows[1].cells[1].textContent).toContain('۰/۱');
    expect(source.tBodies[0].rows[1].cells[4].textContent).toContain(
      'غیرقابل محاسبه',
    );
    expect(source.textContent).not.toContain('مرورگر وب');

    expect(platform.caption?.textContent).toContain('بستر ثبت‌نام');
    expect(platform.tBodies[0].rows).toHaveLength(2);
    expect(platform.textContent).toContain('مرورگر وب');
    expect(platform.textContent).toContain('نامشخص');
    expect(platform.textContent).not.toContain('telegram');

    expect(element.textContent).toContain('دقیقاً در روز تقویمی ۱ یا ۷');
    expect(element.textContent).toContain('به وقت تهران');
    expect(element.textContent).toContain('روز ثبت‌نام روز صفر است');
    expect(element.textContent).toContain('روز مربوط برایشان به پایان رسیده');
    expect(element.textContent).not.toMatch(
      /synthetic-individual-id|fake@example.test|CSV/,
    );
    expect(element.querySelector('a[download]')).toBeNull();
  });

  it('offers a retry on request failure without presenting it as zero or empty data', async () => {
    request().flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'گزارش فعال‌سازی حساب‌ها دریافت نشد.',
    );
    expect(element.textContent).not.toContain('داده‌ای از ثبت‌نام');
    expect(element.querySelector('table')).toBeNull();

    const retry = [...element.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('تلاش دوباره'),
    );
    if (!retry) throw new Error('Report retry button is missing');
    retry.click();
    TestBed.tick();
    request().flush(emptyReport('2026-10-26', '2026-11-24'));
    await fixture.whenStable();
    expect(element.textContent).toContain('داده‌ای از ثبت‌نام');
  });

  it('rejects a future end day, an over-90-day range and a stale today before requesting', async () => {
    request().flush(emptyReport('2026-10-26', '2026-11-24'));
    await fixture.whenStable();

    selectDay('to', '2026-11-26');
    submit();
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    http.expectNone((candidate) => candidate.url.startsWith(endpoint));

    selectDay('from', '2026-08-27');
    selectDay('to', '2026-11-25');
    submit();
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    http.expectNone((candidate) => candidate.url.startsWith(endpoint));

    selectDay('from', '2026-08-28');
    submit();
    request('2026-08-28', '2026-11-25').flush(
      emptyReport('2026-08-28', '2026-11-25'),
    );
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')).toBeNull();

    // The Tehran day rolls over while the page stays open.
    vi.setSystemTime(new Date('2026-11-25T21:00:00Z'));
    element
      .querySelector('form')
      ?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    fixture.detectChanges();
    selectDay('to', '2026-11-26');
    // With today = 2026-11-26 the oldest allowed day is 2026-08-29.
    submit();
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    http.expectNone((candidate) => candidate.url.startsWith(endpoint));
    selectDay('from', '2026-08-29');
    submit();
    request('2026-08-29', '2026-11-26').flush(
      emptyReport('2026-08-29', '2026-11-26'),
    );
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('explains a rejected range (400) without a retry button', async () => {
    request().flush(null, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'بازهٔ انتخاب‌شده پذیرفته نشد',
    );
    expect(element.textContent).not.toContain('تلاش دوباره');
  });

  it('shows coverage counts, hides the warning at zero and labels other platforms', async () => {
    request().flush({
      ...emptyReport('2026-10-26', '2026-11-24'),
      overall: {
        ...emptyMetrics,
        firstAction: { eligible: 2, successful: 1, percent: 50 },
        medianFirstActionMinutes: 1,
      },
      coverage: {
        accounts: 7,
        excludedTestAccounts: 3,
        untimedReviewAccounts: 0,
        phoneOnlyAccounts: 2,
      },
      bySignupPlatform: [
        {
          signupPlatform: 'other',
          metrics: {
            ...emptyMetrics,
            firstAction: { eligible: 2, successful: 1, percent: 50 },
          },
        },
      ],
    } satisfies GrowthAccountActivationReport);
    await fixture.whenStable();

    const text = element.textContent ?? '';
    expect(text).toContain('حساب‌های گزارش: ۷');
    expect(text).toContain('حساب تست حذف‌شده: ۳');
    expect(text).toContain('بدون بررسی دامنهٔ تست): ۲');
    expect(text).not.toContain('ممکن است کم‌شمارش باشد');
    expect(element.querySelector('[role="status"]')).toBeNull();
    const platform = element.querySelectorAll('table')[2];
    expect(platform.tBodies[0].rows[0].cells[0].textContent).toContain('سایر');
    expect(
      element.querySelectorAll('table')[0].tBodies[0].rows[0].cells[4]
        .textContent,
    ).toContain('۱ دقیقه');
  });
});
