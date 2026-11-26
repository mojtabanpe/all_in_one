import { TestBed } from '@angular/core/testing';
import { resolveExpenseDateRange } from '@all-in-one/applets/expenses/contracts';
import { AioLocale } from '@all-in-one/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpensesApi } from './expenses-api';
import { ExpensesCategoriesPage } from './expenses-categories-page';
import { ExpensesListPage } from './expenses-list-page';
import { ExpensesReportPage } from './expenses-report-page';
import { ExpensesShell } from './expenses-shell';
import { expensesRoutes } from './expenses.routes';
import { tehranPersianMonthName } from './persian-month';

describe('ExpensesWebModule', () => {
  it('defines expensesRoutes with correct shell and children', () => {
    expect(expensesRoutes).toHaveLength(1);
    const root = expensesRoutes[0];
    expect(root.path).toBe('');
    expect(root.children).toHaveLength(3);
    const paths = root.children?.map((c) => c.path);
    expect(paths).toEqual(['', 'report', 'categories']);
  });

  it('exports component classes', () => {
    expect(ExpensesShell).toBeDefined();
    expect(ExpensesListPage).toBeDefined();
    expect(ExpensesReportPage).toBeDefined();
    expect(ExpensesCategoriesPage).toBeDefined();
    expect(ExpensesApi).toBeDefined();
  });
});

describe('tehranPersianMonthName and this_month range', () => {
  it('returns the Solar Hijri month name for a fixed date and Tehran month boundary', () => {
    expect(tehranPersianMonthName(new Date('2026-11-27T12:00:00Z'))).toBe(
      'آذر',
    );
    // 2026-11-21 23:59:59+03:30 (30 Aban) -> 2026-11-22 00:00:00+03:30 (1 Azar)
    expect(tehranPersianMonthName(new Date('2026-11-21T20:29:59Z'))).toBe(
      'آبان',
    );
    expect(tehranPersianMonthName(new Date('2026-11-21T20:30:00Z'))).toBe(
      'آذر',
    );
  });

  it('keeps the this_month date range unchanged from day 1 of the Persian month to today', () => {
    expect(
      resolveExpenseDateRange({ preset: 'this_month' }, '2026-11-27'),
    ).toEqual({
      from: '2026-11-22',
      to: '2026-11-27',
    });
    expect(
      resolveExpenseDateRange({ preset: 'this_month' }, '2026-11-21'),
    ).toEqual({
      from: '2026-10-23',
      to: '2026-11-21',
    });
  });
});

describe('Expenses month filter label', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.inject(AioLocale).setLanguage('fa');
  });

  it('labels this_month in ExpensesListPage for Persian and English and refreshes across month boundary', async () => {
    const listMock = vi.fn().mockResolvedValue([]);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ExpensesApi,
          useValue: {
            listCategories: vi.fn().mockResolvedValue([]),
            list: listMock,
          },
        },
      ],
    });

    const locale = TestBed.inject(AioLocale);
    locale.setLanguage('fa');
    const fixture = TestBed.createComponent(ExpensesListPage);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(listMock).toHaveBeenCalledWith({
        preset: 'this_month',
        categoryId: undefined,
        search: undefined,
      }),
    );

    expect(fixture.nativeElement.textContent).toContain('از اول آذر');
    expect(fixture.nativeElement.textContent).not.toContain('این ماه');

    locale.setLanguage('en');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Since 1 Azar');

    // Cross month boundary (30 Aban -> 1 Azar Tehran) while the page stays open
    locale.setLanguage('fa');
    vi.setSystemTime(new Date('2026-11-21T20:29:59Z'));
    fixture.componentInstance.setPreset('this_month');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('از اول آبان');

    vi.setSystemTime(new Date('2026-11-21T20:30:00Z'));
    fixture.componentInstance.setPreset('this_month');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('از اول آذر');
  });

  it('labels this_month in ExpensesReportPage for Persian and English and refreshes across month boundary', async () => {
    const getReportMock = vi.fn().mockResolvedValue({
      from: '2026-11-22',
      to: '2026-11-27',
      daysCount: 6,
      totalAmount: 0,
      dailyAverage: 0,
      todayAmount: 0,
      transactionCount: 0,
      topCategory: null,
      byCategory: [],
      dailySeries: [],
      biggestExpenses: [],
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ExpensesApi,
          useValue: {
            getReport: getReportMock,
          },
        },
      ],
    });

    const locale = TestBed.inject(AioLocale);
    locale.setLanguage('fa');
    const fixture = TestBed.createComponent(ExpensesReportPage);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(getReportMock).toHaveBeenCalledWith({ preset: 'this_month' });
    expect(fixture.nativeElement.textContent).toContain('از اول آذر');
    expect(fixture.nativeElement.textContent).not.toContain('این ماه');

    locale.setLanguage('en');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Since 1 Azar');

    locale.setLanguage('fa');
    vi.setSystemTime(new Date('2026-11-21T20:29:59Z'));
    fixture.componentInstance.setPreset('this_month');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('از اول آبان');

    vi.setSystemTime(new Date('2026-11-21T20:30:00Z'));
    fixture.componentInstance.setPreset('this_month');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('از اول آذر');
  });
});
