import type { Routes } from '@angular/router';

/**
 * Planner applet (TickTick parity). Mount anywhere, e.g.
 * `{ path: 'planner', children: plannerRoutes }`. Needs `provideHttpClient()`;
 * the api base comes from `API_BASE_URL`.
 */
export const plannerRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./planner-shell').then((m) => m.PlannerShell),
    children: [
      {
        path: '',
        title: 'برنامه‌ریز',
        loadComponent: () => import('./tasks-page').then((m) => m.TasksPage),
      },
      {
        path: 'calendar',
        title: 'تقویم',
        loadComponent: () =>
          import('./calendar-page').then((m) => m.CalendarPage),
      },
      {
        path: 'habits',
        title: 'عادت‌ها',
        loadComponent: () => import('./habits-page').then((m) => m.HabitsPage),
      },
      {
        path: 'focus',
        title: 'تمرکز',
        loadComponent: () => import('./focus-page').then((m) => m.FocusPage),
      },
      {
        path: 'countdowns',
        title: 'روزشمار',
        loadComponent: () =>
          import('./countdowns-page').then((m) => m.CountdownsPage),
      },
    ],
  },
];
