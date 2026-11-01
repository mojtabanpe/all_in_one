import type { Routes } from '@angular/router';

/**
 * Health applet (fitness + nutrition). Mount anywhere, e.g.
 * `{ path: 'health', children: healthRoutes }`. Needs `provideHttpClient()` and
 * `withComponentInputBinding()` (recipe slug); the api base comes from `API_BASE_URL`.
 */
export const healthRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./health-shell').then((m) => m.HealthShell),
    children: [
      {
        path: '',
        title: 'سلامت',
        loadComponent: () =>
          import('./health-overview').then((m) => m.HealthOverview),
      },
      {
        path: 'fitness',
        title: 'ورزش',
        loadComponent: () =>
          import('./fitness-page').then((m) => m.FitnessPage),
      },
      {
        path: 'fitness/:routineId/:dayIndex',
        title: 'جلسه تمرین',
        loadComponent: () =>
          import('./training-session-page').then((m) => m.TrainingSessionPage),
        canDeactivate: [
          (component: import('./training-session-page').TrainingSessionPage) =>
            component.canLeave(),
        ],
      },
      {
        path: 'nutrition',
        title: 'تغذیه',
        loadComponent: () =>
          import('./nutrition-page').then((m) => m.NutritionPage),
      },
      {
        path: 'nutrition/recipes/:slug',
        title: 'دستور پخت',
        loadComponent: () => import('./recipe-page').then((m) => m.RecipePage),
      },
      {
        path: 'profile',
        title: 'مشخصات',
        loadComponent: () =>
          import('./profile-page').then((m) => m.ProfilePage),
      },
    ],
  },
];
