import type { Routes } from '@angular/router';

/**
 * English-learning applet. Mount anywhere, e.g. `{ path: 'english', children: englishLearningRoutes }`.
 * Needs `provideHttpClient()`; the api base comes from `API_BASE_URL`.
 */
export const englishLearningRoutes: Routes = [
  {
    path: '',
    title: 'یادگیری انگلیسی',
    loadComponent: () => import('./english-home').then((m) => m.EnglishHome),
  },
  {
    path: 'review',
    title: 'مرور واژه‌ها',
    loadComponent: () => import('./review-page').then((m) => m.ReviewPage),
  },
];
