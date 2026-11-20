import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { RedirectCommand, Router, type ResolveFn } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import type { Exercise } from '@all-in-one/applets/health/contracts';
import {
  LANDING_GOAL_COOKIE,
  LANDING_PATHS,
  resolveLandingGoal,
} from '@all-in-one/shared/schemas';
import { inject, PLATFORM_ID } from '@angular/core';
import { AioLocale } from '@all-in-one/ui';
import { GOAL_LANDINGS } from './pages/goal-landing-data';
import type { Route } from '@angular/router';
import {
  applySeo,
  faqStructuredData,
  pageSeo,
  SITE_STRUCTURED_DATA,
} from './seo';

/** The exercise of `exercises/:slug` with its title and SEO tags; an unknown slug gets the 404 page. */
const exerciseResolver: ResolveFn<Exercise | RedirectCommand> = async (
  route,
) => {
  const document = inject(DOCUMENT);
  const meta = inject(Meta);
  const title = inject(Title);
  const locale = inject(AioLocale);
  const router = inject(Router);
  const data = await import('./pages/exercise-data');
  const slug = route.paramMap.get('slug') ?? '';
  const exercise = data.EXERCISE_PAGES.find((e) => e.slug === slug);
  if (!exercise)
    return new RedirectCommand(router.parseUrl('/not-found'), {
      skipLocationChange: true,
    });
  title.setTitle(locale.text(data.exerciseTitle(exercise)));
  applySeo(
    document,
    meta,
    `/${data.exercisePath(slug)}`,
    data.exerciseDescription(exercise),
    data.exerciseTitle(exercise),
    data.exerciseStructuredData(exercise),
  );
  return exercise;
};

export const appRoutes: Route[] = [
  {
    path: '',
    canActivate: [
      (route) => {
        if (
          route.fragment === 'install' ||
          !isPlatformBrowser(inject(PLATFORM_ID))
        )
          return true;
        const document = inject(DOCUMENT);
        const remembered = document.cookie
          .split('; ')
          .find((c) => c.startsWith(`${LANDING_GOAL_COOKIE}=`))
          ?.split('=')[1];
        const goal = resolveLandingGoal(route.queryParamMap, remembered);
        return goal
          ? inject(Router).createUrlTree([LANDING_PATHS[goal]], {
              queryParams: route.queryParams,
            })
          : true;
      },
    ],
    title: 'Poshtetgarm (پشتت گرم) | برنامه‌ریزی روزانه، زبان و سلامت',
    resolve: {
      seo: pageSeo(
        '/',
        'Poshtetgarm (پشتت گرم) | برنامه‌ریزی روزانه، زبان و سلامت',
        'برنامه روزانه، مرور زبان انگلیسی و پیگیری سلامت را با Poshtetgarm (پشتت گرم) در یک جا دنبال کنید؛ روی موبایل و کامپیوتر.',
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
        'Poshtetgarm (پشتت گرم) ابزارهای برنامه‌ریزی روزانه، یادگیری انگلیسی و پیگیری سلامت را در یک فضای شخصی کنار هم می‌گذارد.',
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
  {
    path: 'weekly-plan-for-work',
    title: () =>
      inject(AioLocale).text(
        'نمونه برنامه هفتگی برای افراد شاغل؛ جدول شنبه تا جمعه',
      ),
    resolve: {
      seo: pageSeo(
        '/weekly-plan-for-work',
        'نمونه برنامه هفتگی برای افراد شاغل؛ جدول شنبه تا جمعه',
        'برای یک هفته کاری با دو جلسه زبان، خرید و وقت استراحت برنامه بچین و ببین اگر یک روز اضافه‌کاری پیش آمد چطور برنامه را تغییر بدهی.',
      ),
    },
    loadComponent: () =>
      import('./pages/weekly-plan').then((m) => m.WeeklyPlan),
  },
  {
    path: 'everyday-english-flashcards',
    title: () =>
      inject(AioLocale).text(
        'مرور لغات انگلیسی با فلش‌کارت؛ پنج کارت برای یک صبح معمولی',
      ),
    resolve: {
      seo: pageSeo(
        '/everyday-english-flashcards',
        'مرور لغات انگلیسی با فلش‌کارت؛ پنج کارت برای یک صبح معمولی',
        'پنج لغت انگلیسی را با تعریف و مثال مرور کن و همین پنج کارت را در حساب خودت نگه دار.',
      ),
    },
    loadComponent: () =>
      import('./pages/everyday-english-flashcards').then(
        (m) => m.EnglishSample,
      ),
  },
  {
    path: 'recurring-task-or-habit',
    title: () =>
      inject(AioLocale).text(
        'فرق کار تکرارشونده و عادت؛ قبض، کلاس زبان یا پیاده‌روی؟',
      ),
    resolve: {
      seo: pageSeo(
        '/recurring-task-or-habit',
        'فرق کار تکرارشونده و عادت؛ قبض، کلاس زبان یا پیاده‌روی؟',
        'با سه مثال تصمیم بگیر چه چیزی را به تقویم بسپاری و برای چه کاری سابقه روزانه نگه داری.',
      ),
    },
    loadComponent: () =>
      import('./pages/recurring-task-or-habit').then((m) => m.TaskOrHabit),
  },
  {
    path: 'exercises',
    title: () => inject(AioLocale).text('آموزش حرکات ورزشی با ویدیو'),
    resolve: {
      seo: pageSeo(
        '/exercises',
        'آموزش حرکات ورزشی با ویدیو | Poshtetgarm',
        'روش درست حرکات ورزشی در خانه، با TRX، دمبل و دستگاه؛ با ویدیو، اشتباه‌های رایج و حرکت‌های جایگزین.',
      ),
    },
    loadComponent: () =>
      import('./pages/exercises').then((m) => m.ExercisesPage),
  },
  {
    // One prerendered page per catalog exercise (app.routes.server.ts lists the slugs). The catalog is loaded
    // lazily so its text stays out of the main bundle.
    path: 'exercises/:slug',
    resolve: { exercise: exerciseResolver },
    loadComponent: () => import('./pages/exercise').then((m) => m.ExercisePage),
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found').then((m) => m.NotFound),
  },
];
