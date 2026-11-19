import type { Route } from '@angular/router';
import {
  AccountPage,
  appletGuard,
  authGuard,
  ForgotPasswordPage,
  guestGuard,
  LoginPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from '@all-in-one/web/shared';
import { welcomeGuard } from './welcome/welcome-gate';

export const appRoutes: Route[] = [
  {
    path: 'login',
    component: LoginPage,
    canActivate: [guestGuard],
    title: 'ورود',
    data: { appName: 'Poshtetgarm', allowRegister: true },
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
    path: 'welcome',
    loadComponent: () => import('./welcome/welcome').then((m) => m.Welcome),
    canActivate: [authGuard()],
    title: 'شروع',
  },
  {
    path: '',
    loadComponent: () => import('./layout').then((m) => m.Layout),
    canActivate: [authGuard()],
    children: [
      {
        path: 'saved-sample-cards',
        loadComponent: () =>
          import('./saved-sample-cards').then((m) => m.SavedSampleCards),
      },
      {
        path: 'account',
        component: AccountPage,
        title: 'حساب کاربری',
        data: { billing: true },
      },
      {
        path: 'billing',
        loadComponent: () => import('./billing/billing').then((m) => m.Billing),
        title: 'اشتراک',
      },
      {
        path: '',
        canActivate: [welcomeGuard],
        loadComponent: () => import('./home/home').then((m) => m.Home),
        title: 'Poshtetgarm',
      },
      {
        path: 'planner',
        canActivate: [welcomeGuard],
        loadChildren: () =>
          import('@all-in-one/applets/planner/web').then(
            (m) => m.plannerRoutes,
          ),
      },
      {
        path: 'english',
        canActivate: [welcomeGuard],
        loadChildren: () =>
          import('@all-in-one/applets/english-learning/web').then(
            (m) => m.englishLearningRoutes,
          ),
      },
      {
        path: 'health',
        canActivate: [welcomeGuard],
        loadChildren: () =>
          import('@all-in-one/applets/health/web').then((m) => m.healthRoutes),
      },
      {
        path: 'expenses',
        canActivate: [appletGuard('expenses')],
        loadChildren: () =>
          import('@all-in-one/applets/expenses/web').then(
            (m) => m.expensesRoutes,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
