import type { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    title: 'همه در یک',
    loadComponent: () => import('./pages/home').then((m) => m.Home),
  },
  {
    path: 'applets',
    title: 'اپلت‌ها',
    loadComponent: () => import('./pages/applets').then((m) => m.Applets),
  },
  {
    path: 'about',
    title: 'درباره',
    loadComponent: () => import('./pages/about').then((m) => m.About),
  },
  { path: '**', redirectTo: '' },
];
