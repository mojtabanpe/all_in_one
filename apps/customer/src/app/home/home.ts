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
import { AioCardDirectives, AioIcon, provideIcons } from '@all-in-one/ui';
import {
  API_BASE_URL,
  AuthStore,
  faDate,
  faNumber,
} from '@all-in-one/web/shared';
import {
  lucideCalendarCheck,
  lucideDumbbell,
  lucideLanguages,
  lucideSalad,
} from '@ng-icons/lucide';

/** Today at a glance, one card per applet. */
@Component({
  selector: 'customer-home',
  imports: [AioCardDirectives, AioIcon, RouterLink],
  providers: [
    provideIcons({
      lucideCalendarCheck,
      lucideDumbbell,
      lucideLanguages,
      lucideSalad,
    }),
  ],
  template: `
    <div class="flex flex-col gap-4">
      <header>
        <h1 class="text-2xl font-bold">
          سلام{{ name() ? '، ' + name() : '' }} 👋
        </h1>
        <p class="text-muted-foreground text-sm">{{ todayLabel }}</p>
      </header>
      <div class="grid gap-3 sm:grid-cols-2">
        @for (card of cards(); track card.title) {
          <a
            [routerLink]="card.link"
            aioCard
            class="transition-transform active:scale-[0.98]"
          >
            <div aioCardHeader>
              <p aioCardDescription class="flex items-center gap-2">
                <aio-icon [name]="card.icon" size="sm" class="text-primary" />{{
                  card.title
                }}
              </p>
              <h2 aioCardTitle class="text-xl">{{ card.value }}</h2>
            </div>
            <div aioCardFooter>
              <span class="text-primary text-sm font-medium"
                >{{ card.action }} ←</span
              >
            </div>
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
        action: 'برنامه‌ریز',
      },
      {
        title: 'انگلیسی',
        icon: 'lucideLanguages',
        link: '/english',
        value: due ? `${faNumber(due)} واژه آماده مرور` : 'مروری باقی نمانده',
        action: 'مرور امروز',
      },
      {
        title: 'تغذیه',
        icon: 'lucideSalad',
        link: '/health/nutrition',
        value:
          avg === null ? 'وعده‌ای ثبت نشده' : `میانگین امتیاز ${faNumber(avg)}`,
        action: 'ثبت وعده',
      },
      {
        title: 'ورزش این هفته',
        icon: 'lucideDumbbell',
        link: '/health/fitness',
        value: `${faNumber(this.week.value()?.minutes ?? 0)} از ۱۵۰ دقیقه`,
        action: 'ثبت ورزش',
      },
    ];
  });
}
