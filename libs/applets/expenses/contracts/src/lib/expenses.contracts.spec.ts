import { describe, expect, it } from 'vitest';
import {
  computeExpenseReport,
  DEFAULT_EXPENSE_CATEGORIES,
  matchExpenseCategoryByKeywords,
  resolveExpenseDateRange,
  type ExpenseCategory,
  type ExpenseItem,
} from './expenses.contracts';

describe('expenses contracts', () => {
  const categories: ExpenseCategory[] = DEFAULT_EXPENSE_CATEGORIES.map(
    (seed, index) => ({
      id: `00000000-0000-7000-8000-00000000000${index + 1}`,
      name: seed.name,
      slug: seed.slug,
      color: seed.color,
      icon: seed.icon,
      keywords: seed.keywords,
      monthlyBudget: seed.slug === 'food' ? 5_000_000 : null,
      sortOrder: seed.sortOrder,
    }),
  );

  it('matches Persian and English expense titles to categories by keywords', () => {
    const snapp = matchExpenseCategoryByKeywords('اسنپ به فرودگاه', categories);
    expect(snapp?.categoryId).toBe(categories[1].id); // transport

    const coffee = matchExpenseCategoryByKeywords(
      'خرید قهوه و کیک از کافه',
      categories,
    );
    expect(coffee?.categoryId).toBe(categories[0].id); // food

    const bill = matchExpenseCategoryByKeywords('پرداخت قبض برق', categories);
    expect(bill?.categoryId).toBe(categories[2].id); // bills

    const pharmacy = matchExpenseCategoryByKeywords(
      'داروخانه و ویتامین',
      categories,
    );
    expect(pharmacy?.categoryId).toBe(categories[4].id); // health
  });

  it('computes expense report totals, percentages, budgets and daily series', () => {
    const items: ExpenseItem[] = [
      {
        id: '1',
        categoryId: categories[0].id,
        categoryName: categories[0].name,
        categoryColor: categories[0].color,
        categoryIcon: categories[0].icon,
        title: 'ناهار رستوران',
        amount: 600_000,
        date: '2026-11-14',
        note: null,
        decidedBy: 'local',
        createdAt: '2026-11-14T10:00:00.000Z',
      },
      {
        id: '2',
        categoryId: categories[1].id,
        categoryName: categories[1].name,
        categoryColor: categories[1].color,
        categoryIcon: categories[1].icon,
        title: 'اسنپ',
        amount: 200_000,
        date: '2026-11-15',
        note: null,
        decidedBy: 'user',
        createdAt: '2026-11-15T08:00:00.000Z',
      },
    ];

    const report = computeExpenseReport(
      items,
      categories,
      '2026-11-14',
      '2026-11-15',
      200_000,
    );

    expect(report.totalAmount).toBe(800_000);
    expect(report.daysCount).toBe(2);
    expect(report.dailyAverage).toBe(400_000);
    expect(report.todayAmount).toBe(200_000);
    expect(report.topCategory?.categoryId).toBe(categories[0].id);
    expect(report.topCategory?.percentage).toBe(75);
    expect(report.byCategory[0].budgetUsedPercent).toBe(12);
    expect(report.dailySeries).toHaveLength(2);
  });

  it('resolves preset date ranges around Tehran today', () => {
    const week = resolveExpenseDateRange({ preset: 'last7day' }, '2026-11-15');
    expect(week).toEqual({ from: '2026-11-09', to: '2026-11-15' });
  });
});
