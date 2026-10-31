import type { Route } from '@angular/router';
import {
  AccountPage,
  authGuard,
  ForgotPasswordPage,
  guestGuard,
  LoginPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from '@all-in-one/web/shared';

export const appRoutes: Route[] = [
  {
    path: 'login',
    component: LoginPage,
    canActivate: [guestGuard],
    title: 'ورود',
    data: { appName: 'پشتت گرم', allowRegister: true },
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordPage,
    canActivate: [guestGuard],
    title: 'بازیابی رمز',
  },
  { path: 'reset-password', component: ResetPasswordPage, title: 'رمز تازه' },
  { path: 'verify-email', component: VerifyEmailPage, title: 'تأیید ایمیل' },
  {
    path: '',
    loadComponent: () => import('./layout').then((m) => m.Layout),
    canActivate: [authGuard()],
    children: [
      { path: 'account', component: AccountPage, title: 'حساب کاربری' },
      {
        path: '',
        loadComponent: () => import('./home/home').then((m) => m.Home),
        title: 'پشتت گرم',
      },
      {
        path: 'planner',
        loadChildren: () =>
          import('@all-in-one/applets/planner/web').then(
            (m) => m.plannerRoutes,
          ),
      },
      {
        path: 'english',
        loadChildren: () =>
          import('@all-in-one/applets/english-learning/web').then(
            (m) => m.englishLearningRoutes,
          ),
      },
      {
        path: 'health',
        loadChildren: () =>
          import('@all-in-one/applets/health/web').then((m) => m.healthRoutes),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
