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
import { AioIcon, provideIcons } from '@all-in-one/ui';
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
  imports: [AioIcon, RouterLink],
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
    <div class="flex flex-col gap-5">
      <header class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold">
          سلام{{ name() ? '، ' + name() : '' }} 👋
        </h1>
        <p class="text-muted-foreground text-sm">{{ todayLabel }}</p>
      </header>
      <div class="grid gap-3 sm:grid-cols-2">
        @for (card of cards(); track card.title) {
          <a
            [routerLink]="card.link"
            class="glass flex items-center gap-4 rounded-2xl p-4 transition-transform active:scale-[0.98]"
            [class]="card.accent"
          >
            <span
              class="bg-primary text-primary-foreground flex size-12 shrink-0 items-center justify-center rounded-2xl"
            >
              <aio-icon [name]="card.icon" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="text-muted-foreground text-sm">{{
                card.title
              }}</span>
              <span class="text-lg font-bold">{{ card.value }}</span>
            </span>
            <aio-icon
              name="lucideChevronLeft"
              size="sm"
              class="text-muted-foreground"
            />
          </a>
        }
      </div>
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

  private readonly tasks = httpResource<PlannerTask[]>(
    () => `${this.api}/planner/tasks?from=${this.today}&to=${this.today}`,
  );
  private readonly english = httpResource<EnglishStats>(
    () => `${this.api}/english/stats`,
  );
  private readonly meals = httpResource<MealLog[]>(
    () => `${this.api}/health/meals?date=${this.today}`,
  );
  private readonly week = httpResource<FitnessWeek>(
    () => `${this.api}/health/workouts/week?date=${this.today}`,
  );

  protected readonly cards = computed(() => {
    const open = (this.tasks.value() ?? []).filter((t) => !t.done).length;
    const due = this.english.value()?.dueNow ?? 0;
    const meals = this.meals.value() ?? [];
    const avg = meals.length
      ? Math.round(meals.reduce((s, m) => s + m.score, 0) / meals.length)
      : null;
    return [
      {
        title: 'برنامه امروز',
        icon: 'lucideCalendarCheck',
        link: '/planner',
        value: open ? `${faNumber(open)} کار باقی مانده` : 'کاری باقی نمانده',
        accent: 'applet-planner',
      },
      {
        title: 'انگلیسی',
        icon: 'lucideLanguages',
        link: '/english',
        value: due ? `${faNumber(due)} واژه آماده مرور` : 'مروری باقی نمانده',
        accent: 'applet-english',
      },
      {
        title: 'تغذیه',
        icon: 'lucideSalad',
        link: '/health',
        value:
          avg === null ? 'وعده‌ای ثبت نشده' : `میانگین امتیاز ${faNumber(avg)}`,
        accent: 'applet-health',
      },
      {
        title: 'ورزش این هفته',
        icon: 'lucideDumbbell',
        link: '/health/fitness',
        value: `${faNumber(this.week.value()?.minutes ?? 0)} از ۱۵۰ دقیقه`,
        accent: 'applet-health',
      },
    ];
  });
}
