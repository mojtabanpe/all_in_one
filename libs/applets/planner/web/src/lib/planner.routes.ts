import type { Routes } from '@angular/router';

/**
 * Planner applet. Mount anywhere, e.g. `{ path: 'planner', children: plannerRoutes }`.
 * Needs `provideHttpClient()`; the api base comes from `API_BASE_URL`.
 */
export const plannerRoutes: Routes = [
  {
    path: '',
    title: 'برنامه‌ریز',
    loadComponent: () => import('./planner-page').then((m) => m.PlannerPage),
  },
];
