import type { Route } from '@angular/router';
import { pageSeo } from './seo';

export const appRoutes: Route[] = [
  {
    path: '',
    title: 'Poshtetgarm | برنامه‌ریزی روزانه، زبان و سلامت',
    resolve: {
      seo: pageSeo(
        '/',
        'Poshtetgarm | برنامه‌ریزی روزانه، زبان و سلامت',
        'برنامه روزانه، مرور زبان انگلیسی و پیگیری سلامت را با Poshtetgarm در یک جا دنبال کنید؛ روی موبایل و کامپیوتر.',
      ),
    },
    loadComponent: () => import('./pages/home').then((m) => m.Home),
  },
  {
    path: 'applets',
    title: 'امکانات Poshtetgarm | برنامه‌ریز، زبان و سلامت',
    resolve: {
      seo: pageSeo(
        '/applets',
        'امکانات Poshtetgarm | برنامه‌ریز، زبان و سلامت',
        'با امکانات برنامه‌ریز، فلش‌کارت و مرور انگلیسی، تمرین و تغذیه در Poshtetgarm آشنا شوید.',
      ),
    },
    loadComponent: () => import('./pages/applets').then((m) => m.Applets),
  },
  {
    path: 'about',
    title: 'درباره Poshtetgarm',
    resolve: {
      seo: pageSeo(
        '/about',
        'درباره Poshtetgarm',
        'Poshtetgarm ابزارهای برنامه‌ریزی روزانه، یادگیری انگلیسی و پیگیری سلامت را در یک فضای شخصی کنار هم می‌گذارد.',
      ),
    },
    loadComponent: () => import('./pages/about').then((m) => m.About),
  },
  {
    path: 'privacy',
    title: 'حریم خصوصی و داده‌ها | Poshtetgarm',
    resolve: {
      seo: pageSeo(
        '/privacy',
        'حریم خصوصی و داده‌ها | Poshtetgarm',
        'اطلاعات حساب، آمار استفاده، ذخیره‌سازی مرورگر و سرویس‌های بیرونی در Poshtetgarm چگونه پردازش می‌شوند.',
      ),
    },
    loadComponent: () => import('./pages/privacy').then((m) => m.Privacy),
  },
  { path: '**', redirectTo: '' },
];
