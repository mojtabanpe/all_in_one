import type { Route } from '@angular/router';
import { authGuard, guestGuard, LoginPage } from '@all-in-one/web/shared';

export const appRoutes: Route[] = [
  {
    path: 'login',
    component: LoginPage,
    canActivate: [guestGuard],
    title: 'ورود مدیر',
    data: { appName: 'پنل مدیریت', allowRegister: false },
  },
  {
    path: '',
    loadComponent: () => import('./layout').then((m) => m.Layout),
    canActivate: [authGuard('ADMIN')],
    children: [
      {
        path: '',
        title: 'داشبورد',
        loadComponent: () =>
          import('./pages/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'users',
        title: 'کاربران',
        loadComponent: () => import('./pages/users').then((m) => m.Users),
      },
      {
        path: 'content',
        title: 'محتوا',
        loadComponent: () => import('./pages/content').then((m) => m.Content),
      },
      {
        path: 'design',
        title: 'سیستم طراحی',
        loadComponent: () =>
          import('./pages/design-system').then((m) => m.DesignSystem),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
