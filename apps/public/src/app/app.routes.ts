import { inject } from '@angular/core';
import { AioLocale } from '@all-in-one/ui';
import { GOAL_LANDINGS } from './pages/goal-landing-data';
import type { Route } from '@angular/router';
import { faqStructuredData, pageSeo, SITE_STRUCTURED_DATA } from './seo';

export const appRoutes: Route[] = [
  {
    path: '',
    title: 'Poshtetgarm | برنامه‌ریزی روزانه، زبان و سلامت',
    resolve: {
      seo: pageSeo(
        '/',
        'Poshtetgarm | برنامه‌ریزی روزانه، زبان و سلامت',
        'برنامه روزانه، مرور زبان انگلیسی و پیگیری سلامت را با Poshtetgarm در یک جا دنبال کنید؛ روی موبایل و کامپیوتر.',
        SITE_STRUCTURED_DATA,
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
  ...GOAL_LANDINGS.map((guide) => ({
    path: guide.slug,
    title: () => inject(AioLocale).text(guide.seoTitle),
    data: { guide },
    resolve: {
      seo: pageSeo(
        `/${guide.slug}`,
        guide.seoTitle,
        guide.description,
        faqStructuredData(guide.questions),
      ),
    },
    loadComponent: () =>
      import('./pages/goal-landing').then((m) => m.GoalLanding),
  })),
  { path: '**', redirectTo: '' },
];
