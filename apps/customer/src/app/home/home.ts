import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { EnglishStats } from '@all-in-one/applets/english-learning/contracts';
import type {
  FitnessWeek,
  MealLog,
} from '@all-in-one/applets/health/contracts';
import type { PlannerTask } from '@all-in-one/applets/planner/contracts';
import { toIsoDate } from '@all-in-one/shared/schemas';
import {
  AioMetric,
  AioNavigationCard,
  AioButton,
  AioCardDirectives,
  AioIcon,
  provideIcons,
  AioSkeletonRows,
} from '@all-in-one/ui';
import {
  API_BASE_URL,
  AuthStore,
  faDate,
  faNumber,
} from '@all-in-one/web/shared';
import {
  lucideCalendarCheck,
  lucideChevronLeft,
  lucideDumbbell,
  lucideLanguages,
  lucideSalad,
} from '@ng-icons/lucide';

/** Today at a glance, one card per applet. */
@Component({
  selector: 'customer-home',
  imports: [
    AioNavigationCard,
    AioMetric,
    AioButton,
    AioCardDirectives,
    AioIcon,
    RouterLink,
    AioSkeletonRows,
  ],
  providers: [
    provideIcons({
      lucideCalendarCheck,
      lucideChevronLeft,
      lucideDumbbell,
      lucideLanguages,
      lucideSalad,
    }),
  ],
  template: `
    <div class="flex flex-col gap-8 md:gap-10">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="aio-eyebrow">{{ todayLabel }}</p>
          <h1 class="aio-page-title">
            سلام{{ name() ? '، ' + name() : '' }}. امروز از کجا شروع کنیم؟
          </h1>
        </div>
        <span class="text-muted-foreground text-sm"
          >فضای کوچکِ پیشرفت‌های بزرگ</span
        >
      </header>
      <section
        class="aio-hero grid items-center gap-8 md:grid-cols-[1.4fr_1fr]"
        aria-labelledby="today-heading"
      >
        <div class="flex flex-col items-start gap-4">
          <span class="aio-hero-caption">یک روز تازه، یک فرصت تازه</span>
          <h2
            id="today-heading"
            class="text-3xl leading-[1.6] font-bold md:text-4xl"
          >
            کمی تمرکز.<br />کمی یادگیری.<br /><span class="text-[#d9f0c7]"
              >کمی بیشتر برای خودت.</span
            >
          </h2>
          <p class="aio-hero-caption hidden max-w-md sm:block">
            لازم نیست همه‌چیز را یک‌باره انجام بدهی. قدم بعدی‌ات را انتخاب کن؛
            بقیه‌اش همین‌جاست.
          </p>
          <a aioBtn class="aio-hero-action mt-2" routerLink="/planner"
            ><aio-icon name="lucideCalendarCheck" size="sm" />برو به برنامه
            امروز<aio-icon name="lucideChevronLeft" size="sm"
          /></a>
        </div>
        <div
          class="grid grid-cols-3 gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-4 md:flex md:flex-col md:gap-0 md:px-5 md:py-2"
        >
          <div
            class="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center md:border-b md:border-white/10 md:py-5"
            aioMetric
            label="کارهای باقی‌مانده"
            [value]="tasks.error() ? '—' : fa(openTasks().length)"
            [loading]="tasks.isLoading() && !tasks.hasValue()"
            labelClass="aio-hero-stat-label"
            valueClass="min-h-9 min-w-[2ch] text-3xl tabular-nums"
          ></div>
          <div
            class="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center md:border-b md:border-white/10 md:py-5"
            aioMetric
            label="کارت‌های آماده مرور"
            [value]="english.error() ? '—' : fa(english.value()?.due ?? 0)"
            [loading]="english.isLoading() && !english.hasValue()"
            labelClass="aio-hero-stat-label"
            valueClass="min-h-9 min-w-[2ch] text-3xl tabular-nums"
          ></div>
          <div
            class="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center md:py-5"
            aioMetric
            label="دقیقه فعالیت این هفته"
            [value]="week.error() ? '—' : fa(week.value()?.minutes ?? 0)"
            [loading]="week.isLoading() && !week.hasValue()"
            labelClass="aio-hero-stat-label"
            valueClass="min-h-9 min-w-[2ch] text-3xl tabular-nums"
          ></div>
        </div>
      </section>
      <section aria-labelledby="spaces-heading" class="flex flex-col gap-4">
        <div class="flex items-end justify-between gap-3">
          <h2 id="spaces-heading" class="text-lg font-bold">
            هر بخش از روزت، سر جای خودش.
          </h2>
          <span class="text-muted-foreground hidden text-xs sm:block"
            >انتخاب کن و ادامه بده</span
          >
        </div>
        <div class="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          @for (card of cards(); track card.title) {
            <a
              aioNavigationCard
              [routerLink]="card.link"
              [class]="card.accent"
              [title]="card.title"
              [icon]="card.icon"
              [description]="card.value"
              [action]="card.action"
              [loading]="card.loading"
            ></a>
          }
        </div>
      </section>
      <section aioCard aria-labelledby="next-heading">
        <div
          aioCardHeader
          class="flex flex-row items-center justify-between gap-3"
        >
          <div>
            <h2 id="next-heading" aioCardTitle>قدم‌های بعدی امروز</h2>
            <p aioCardDescription>فقط همین قدم بعدی را بردار.</p>
          </div>
          <a aioBtn variant="ghost" routerLink="/planner"
            >همه کارها<aio-icon name="lucideChevronLeft" size="sm"
          /></a>
        </div>
        <div aioCardContent>
          @if (tasks.isLoading()) {
            <div
              class="flex flex-col gap-3 py-4"
              role="status"
              aria-label="در حال دریافت برنامه امروز"
            >
              <div
                aioSkeletonRows
                class="contents"
                [count]="4"
                itemClass="h-12 rounded-xl"
              ></div>
            </div>
          } @else if (tasks.error()) {
            <div class="flex flex-wrap items-center justify-between gap-3 py-4">
              <p role="alert">برنامه امروز دریافت نشد.</p>
              <button aioBtn variant="outline" (click)="tasks.reload()">
                تلاش دوباره
              </button>
            </div>
          } @else if (!openTasks().length) {
            <div class="flex flex-col items-start gap-3 py-5">
              <span class="aio-module-icon"
                ><aio-icon name="lucideCalendarCheck"
              /></span>
              <p class="font-semibold">امروز هنوز جای یک کار خوب دارد.</p>
              <p class="text-muted-foreground text-sm">
                یک کار کوچک اضافه کن؛ یا از این فرصت برای استراحت استفاده کن.
              </p>
              <a aioBtn variant="outline" routerLink="/planner"
                >برنامه‌ریزی امروز</a
              >
            </div>
          } @else {
            @for (task of openTasks().slice(0, 4); track task.id) {
              <a class="aio-task-row" routerLink="/planner"
                ><span
                  class="size-5 shrink-0 rounded-full border border-input"
                ></span
                ><span class="min-w-0 flex-1 break-words text-sm">{{
                  task.title
                }}</span
                ><aio-icon
                  name="lucideChevronLeft"
                  size="sm"
                  class="text-muted-foreground"
              /></a>
            }
          }
        </div>
      </section>
    </div>
  `,
})
export class Home {
  private readonly api = inject(API_BASE_URL);
  private readonly auth = inject(AuthStore);
  private readonly today = toIsoDate(new Date());
  protected readonly todayLabel = faDate(this.today, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  protected readonly name = computed(() => this.auth.user()?.name ?? '');

  protected readonly fa = faNumber;
  protected readonly tasks = httpResource<PlannerTask[]>(
    () => `${this.api}/planner/tasks?preset=today`,
  );
  protected readonly english = httpResource<EnglishStats>(
    () => `${this.api}/english/stats`,
  );
  private readonly meals = httpResource<MealLog[]>(
    () => `${this.api}/health/meals?date=${this.today}`,
  );
  protected readonly week = httpResource<FitnessWeek>(
    () => `${this.api}/health/workouts/week?date=${this.today}`,
  );

  protected readonly openTasks = computed(() =>
    (this.tasks.value() ?? []).filter((t) => !t.done),
  );

  protected readonly cards = computed(() => {
    const open = (this.tasks.value() ?? []).filter((t) => !t.done).length;
    const due = this.english.value()?.due ?? 0;
    const meals = this.meals.value() ?? [];
    const avg = meals.length
      ? Math.round(meals.reduce((s, m) => s + m.score, 0) / meals.length)
      : null;
    return [
      {
        title: 'برنامه‌ریز',
        loading: this.tasks.isLoading() && !this.tasks.hasValue(),
        action: 'روزت را بچین',
        icon: 'lucideCalendarCheck',
        link: '/planner',
        value: open ? `${faNumber(open)} کار باقی مانده` : 'کاری باقی نمانده',
        accent: 'applet-planner',
      },
      {
        title: 'یادگیری زبان',
        loading: this.english.isLoading() && !this.english.hasValue(),
        action: 'ادامه یادگیری',
        icon: 'lucideLanguages',
        link: '/english',
        value: due ? `${faNumber(due)} کارت آماده مرور` : 'مروری باقی نمانده',
        accent: 'applet-english',
      },
      {
        title: 'تغذیه',
        loading: this.meals.isLoading() && !this.meals.hasValue(),
        action: 'ثبت وعده غذایی',
        icon: 'lucideSalad',
        link: '/health/nutrition',
        value:
          avg === null ? 'وعده‌ای ثبت نشده' : `میانگین امتیاز ${faNumber(avg)}`,
        accent: 'applet-health',
      },
      {
        title: 'حرکت و تمرین',
        loading: this.week.isLoading() && !this.week.hasValue(),
        action: 'برنامه تمرین من',
        icon: 'lucideDumbbell',
        link: '/health/fitness',
        value: `${faNumber(this.week.value()?.minutes ?? 0)} از ۱۵۰ دقیقه`,
        accent: 'applet-health',
      },
    ];
  });
}
