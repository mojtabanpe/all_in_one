import { describe, expect, it } from 'vitest';
import { expensesRoutes } from './expenses.routes';
import { ExpensesShell } from './expenses-shell';
import { ExpensesListPage } from './expenses-list-page';
import { ExpensesReportPage } from './expenses-report-page';
import { ExpensesCategoriesPage } from './expenses-categories-page';
import { ExpensesApi } from './expenses-api';

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
