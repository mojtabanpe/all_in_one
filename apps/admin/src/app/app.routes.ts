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
    title: 'ورود مدیر',
    data: { appName: 'پنل مدیریت', allowRegister: false },
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
    canActivate: [authGuard('ADMIN')],
    children: [
      { path: 'account', component: AccountPage, title: 'حساب کاربری' },
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
