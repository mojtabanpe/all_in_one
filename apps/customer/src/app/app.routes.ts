import type { Route } from '@angular/router';
import { authGuard, guestGuard, LoginPage } from '@all-in-one/web/shared';

export const appRoutes: Route[] = [
  {
    path: 'login',
    component: LoginPage,
    canActivate: [guestGuard],
    title: 'ورود',
    data: { appName: 'همه در یک', allowRegister: true },
  },
  {
    path: '',
    loadComponent: () => import('./layout').then((m) => m.Layout),
    canActivate: [authGuard()],
    children: [
      {
        path: '',
        loadComponent: () => import('./home/home').then((m) => m.Home),
        title: 'همه در یک',
      },
      {
        path: 'planner',
        loadChildren: () =>
          import('@all-in-one/applets/planner/web').then(
            (m) => m.plannerRoutes,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
