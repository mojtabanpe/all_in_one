import type { Routes } from '@angular/router';

/**
 * English applet (Recall). Mount anywhere, e.g. `{ path: 'english', loadChildren: … }`.
 * Needs `provideHttpClient()`, `withComponentInputBinding()` and `API_BASE_URL`.
 * The three tabs share a shell; deck, study and reader are focused pages.
 */
export const englishLearningRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./english-shell').then((m) => m.EnglishShell),
    children: [
      {
        path: '',
        title: 'انگلیسی',
        loadComponent: () =>
          import('./library-page').then((m) => m.LibraryPage),
      },
      {
        path: 'texts',
        title: 'خواندن',
        loadComponent: () => import('./texts-page').then((m) => m.TextsPage),
      },
      {
        path: 'practice',
        title: 'تمرین مکالمه',
        loadComponent: () =>
          import('./practice-page').then((m) => m.PracticePage),
      },
    ],
  },
  {
    path: 'deck/:id',
    title: 'دسته',
    loadComponent: () => import('./deck-page').then((m) => m.DeckPage),
  },
  {
    path: 'deck/:id/study',
    title: 'مرور',
    loadComponent: () => import('./study-page').then((m) => m.StudyPage),
  },
  {
    path: 'read/:id',
    title: 'خواندن',
    loadComponent: () => import('./reader-page').then((m) => m.ReaderPage),
  },
];
