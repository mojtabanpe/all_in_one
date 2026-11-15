import type { Routes } from '@angular/router';

export const expensesRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./expenses-shell').then((m) => m.ExpensesShell),
    children: [
      {
        path: '',
        title: 'مدیریت مخارج',
        loadComponent: () =>
          import('./expenses-list-page').then((m) => m.ExpensesListPage),
      },
      {
        path: 'report',
        title: 'گزارش و تحلیل مخارج',
        loadComponent: () =>
          import('./expenses-report-page').then((m) => m.ExpensesReportPage),
      },
      {
        path: 'categories',
        title: 'دسته‌بندی‌های مخارج',
        loadComponent: () =>
          import('./expenses-categories-page').then(
            (m) => m.ExpensesCategoriesPage,
          ),
      },
    ],
  },
];
