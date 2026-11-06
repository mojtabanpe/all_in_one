import { firstValueFrom } from 'rxjs';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { EnglishStats } from '@all-in-one/applets/english-learning/contracts';
import type {
  FitnessWeek,
  MealLog,
} from '@all-in-one/applets/health/contracts';
import type { PlannerTask } from '@all-in-one/applets/planner/contracts';
import {
  toIsoDate,
  type OnboardingState,
  type OnboardingGoal,
} from '@all-in-one/shared/schemas';
import {
  AioTranslate,
  AioMetric,
  AioNavigationCard,
  AioButton,
  AioCardDirectives,
  AioIcon,
  provideIcons,
  AioSkeletonRows,
  AioLocale,
} from '@all-in-one/ui';
import { API_BASE_URL, AuthStore } from '@all-in-one/web/shared';
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
    AioTranslate,
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
          <p class="aio-eyebrow">{{ todayLabel() | aioTranslate }}</p>
          <h1 class="aio-page-title">
            {{
              'سلام{0}. امروز از کجا شروع کنیم؟'
                | aioTranslate: [name() ? '، ' + name() : '']
            }}
          </h1>
        </div>
        <span class="text-muted-foreground text-sm">{{
          'فضای کوچکِ پیشرفت‌های بزرگ' | aioTranslate
        }}</span>
      </header>
      <section aioCard aria-labelledby="onboarding-heading">
        <div aioCardHeader>
          <h2 aioCardTitle id="onboarding-heading">
            {{ 'قدم اول را انتخاب کن' | aioTranslate }}
          </h2>
          <p aioCardDescription>
            {{
              'یک هدف کوچک برای شروع؛ هر سه بخش همیشه در دسترس‌اند.'
                | aioTranslate
            }}
          </p>
        </div>
        <div aioCardContent>
          @if (onboarding.hasValue()) {
            @if (
              editingGoal() ||
              (!onboarding.value().goal && !onboarding.value().skipped)
            ) {
              <div
                class="grid gap-3 md:grid-cols-3"
                [attr.aria-busy]="savingGoal()"
              >
                @for (goal of goals; track goal.id) {
                  <button
                    aioBtn
                    variant="outline"
                    type="button"
                    class="h-auto min-h-28 flex-col items-start gap-2 whitespace-normal p-4 text-start"
                    [disabled]="savingGoal()"
                    (click)="chooseGoal(goal.id)"
                  >
                    <span class="flex items-center gap-2"
                      ><aio-icon [name]="goal.icon" />{{
                        goal.title | aioTranslate
                      }}</span
                    >
                    <span
                      class="text-sm font-normal leading-6 text-muted-foreground"
                      >{{ goal.description | aioTranslate }}</span
                    >
                  </button>
                }
              </div>
              <button
                aioBtn
                variant="ghost"
                type="button"
                class="mt-3 min-h-11"
                [disabled]="savingGoal()"
                (click)="chooseGoal(null)"
              >
                {{ 'فعلاً بدون راهنما ادامه می‌دهم' | aioTranslate }}
              </button>
            } @else if (onboarding.value().completed) {
              <p class="leading-7">
                {{
                  'قدم اولت انجام شد. با یک قدم کوچک دیگر در روز بعد ادامه بده.'
                    | aioTranslate
                }}
              </p>
              <button
                aioBtn
                variant="ghost"
                type="button"
                class="mt-3 min-h-11"
                (click)="editingGoal.set(true)"
              >
                {{ 'انتخاب هدف تازه' | aioTranslate }}
              </button>
            } @else if (selectedGoal(); as goal) {
              <p class="font-semibold">{{ goal.title | aioTranslate }}</p>
              <p class="mt-2 text-sm leading-7 text-muted-foreground">
                {{ goal.description | aioTranslate }}
              </p>
              <div class="mt-4 flex flex-wrap gap-3">
                <a
                  aioBtn
                  [routerLink]="goal.link"
                  queryParamsHandling="preserve"
                  >{{ goal.action | aioTranslate }}</a
                >
                <button
                  aioBtn
                  variant="outline"
                  type="button"
                  [disabled]="savingGoal()"
                  (click)="editingGoal.set(true)"
                >
                  {{ 'تغییر هدف' | aioTranslate }}
                </button>
                <button
                  aioBtn
                  variant="ghost"
                  type="button"
                  [disabled]="savingGoal()"
                  (click)="chooseGoal(null)"
                >
                  {{ 'فعلاً بدون راهنما ادامه می‌دهم' | aioTranslate }}
                </button>
              </div>
            } @else {
              <button
                aioBtn
                variant="outline"
                type="button"
                (click)="editingGoal.set(true)"
              >
                {{ 'باز کردن راهنمای شروع' | aioTranslate }}
              </button>
            }
            @if (savingGoal()) {
              <p class="mt-3 text-sm" role="status">
                {{ 'در حال ذخیرهٔ هدف' | aioTranslate }}
              </p>
            }
            @if (goalError()) {
              <p class="mt-3 text-sm text-destructive" role="alert">
                {{ 'انتخابت ذخیره نشد. دوباره تلاش کن.' | aioTranslate }}
              </p>
            }
          } @else if (onboarding.error()) {
            <p role="alert">
              {{
                'راهنمای شروع دریافت نشد؛ می‌توانی از بخش‌های برنامه استفاده کنی.'
                  | aioTranslate
              }}
            </p>
            <button
              aioBtn
              variant="outline"
              type="button"
              class="mt-3"
              (click)="onboarding.reload()"
            >
              {{ 'تلاش دوباره' | aioTranslate }}
            </button>
          } @else {
            <div aioSkeletonRows [count]="1" itemClass="h-40 rounded-xl"></div>
          }
        </div>
      </section>
      <section
        class="aio-hero grid items-center gap-8 md:grid-cols-[1.4fr_1fr]"
        aria-labelledby="today-heading"
      >
        <div class="flex flex-col items-start gap-4">
          <span class="aio-hero-caption">{{
            'یک روز تازه، یک فرصت تازه' | aioTranslate
          }}</span>
          <h2
            id="today-heading"
            class="text-3xl leading-[1.6] font-bold md:text-4xl"
          >
            {{ 'کمی تمرکز.' | aioTranslate }}<br />{{
              'کمی یادگیری.' | aioTranslate
            }}<br /><span class="text-[#d9f0c7]">{{
              'کمی بیشتر برای خودت.' | aioTranslate
            }}</span>
          </h2>
          <p class="aio-hero-caption hidden max-w-md sm:block">
            {{
              'لازم نیست همه‌چیز را یک‌باره انجام بدهی. قدم بعدی‌ات را انتخاب کن؛ بقیه‌اش همین‌جاست.'
                | aioTranslate
            }}
          </p>
          <a aioBtn class="aio-hero-action mt-2" routerLink="/planner"
            ><aio-icon name="lucideCalendarCheck" size="sm" />{{
              'برو به برنامه امروز' | aioTranslate
            }}<aio-icon
              name="lucideChevronLeft"
              class="ltr:-scale-x-100"
              size="sm"
          /></a>
        </div>
        <div
          class="grid grid-cols-3 gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-4 md:flex md:flex-col md:gap-0 md:px-5 md:py-2"
        >
          <div
            class="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center md:border-b md:border-white/10 md:py-5"
            aioMetric
            [label]="'کارهای باقی‌مانده' | aioTranslate"
            [value]="tasks.error() ? '—' : fa(openTasks().length)"
            [loading]="tasks.isLoading() && !tasks.hasValue()"
            labelClass="aio-hero-stat-label"
            valueClass="min-h-9 min-w-[2ch] text-3xl tabular-nums"
          ></div>
          <div
            class="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center md:border-b md:border-white/10 md:py-5"
            aioMetric
            [label]="'کارت‌های آماده مرور' | aioTranslate"
            [value]="english.error() ? '—' : fa(english.value()?.due ?? 0)"
            [loading]="english.isLoading() && !english.hasValue()"
            labelClass="aio-hero-stat-label"
            valueClass="min-h-9 min-w-[2ch] text-3xl tabular-nums"
          ></div>
          <div
            class="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center md:py-5"
            aioMetric
            [label]="'دقیقه فعالیت این هفته' | aioTranslate"
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
            {{ 'هر بخش از روزت، سر جای خودش.' | aioTranslate }}
          </h2>
          <span class="text-muted-foreground hidden text-xs sm:block">{{
            'انتخاب کن و ادامه بده' | aioTranslate
          }}</span>
        </div>
        <div class="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          @for (card of cards(); track card.title) {
            <a
              aioNavigationCard
              [routerLink]="card.link"
              [class]="card.accent"
              [title]="card.title"
              [icon]="card.icon"
              [description]="card.value | aioTranslate"
              [action]="card.action | aioTranslate"
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
            <h2 id="next-heading" aioCardTitle>
              {{ 'قدم‌های بعدی امروز' | aioTranslate }}
            </h2>
            <p aioCardDescription>
              {{ 'فقط همین قدم بعدی را بردار.' | aioTranslate }}
            </p>
          </div>
          <a aioBtn variant="ghost" routerLink="/planner"
            >{{ 'همه کارها' | aioTranslate
            }}<aio-icon
              name="lucideChevronLeft"
              class="ltr:-scale-x-100"
              size="sm"
          /></a>
        </div>
        <div aioCardContent>
          @if (tasks.isLoading()) {
            <div
              class="flex flex-col gap-3 py-4"
              role="status"
              [attr.aria-label]="'در حال دریافت برنامه امروز' | aioTranslate"
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
              <p role="alert">
                {{ 'برنامه امروز دریافت نشد.' | aioTranslate }}
              </p>
              <button aioBtn variant="outline" (click)="tasks.reload()">
                {{ 'تلاش دوباره' | aioTranslate }}
              </button>
            </div>
          } @else if (!openTasks().length) {
            <div class="flex flex-col items-start gap-3 py-5">
              <span class="aio-module-icon"
                ><aio-icon name="lucideCalendarCheck"
              /></span>
              <p class="font-semibold">
                {{ 'امروز هنوز جای یک کار خوب دارد.' | aioTranslate }}
              </p>
              <p class="text-muted-foreground text-sm">
                {{
                  'یک کار کوچک اضافه کن؛ یا از این فرصت برای استراحت استفاده کن.'
                    | aioTranslate
                }}
              </p>
              <a aioBtn variant="outline" routerLink="/planner">{{
                'برنامه‌ریزی امروز' | aioTranslate
              }}</a>
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
                  class="text-muted-foreground ltr:-scale-x-100"
              /></a>
            }
          }
        </div>
      </section>
    </div>
  `,
})
export class Home {
  protected readonly locale = inject(AioLocale);

  private readonly api = inject(API_BASE_URL);
  private readonly auth = inject(AuthStore);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly onboarding = httpResource<OnboardingState>(
    () => `${this.api}/onboarding`,
  );
  protected readonly editingGoal = signal(false);
  protected readonly savingGoal = signal(false);
  protected readonly goalError = signal(false);
  protected readonly goals = [
    {
      id: 'planner',
      title: 'روز منظم‌تر',
      description: 'در برنامه‌ریز، یک کار کوچک برای امروز بنویس و ذخیره کن.',
      action: 'ساخت اولین کار',
      icon: 'lucideCalendarCheck',
      link: '/planner',
    },
    {
      id: 'english',
      title: 'تمرین روزانهٔ زبان',
      description:
        'یک مجموعهٔ آماده به کتابخانه اضافه کن، سپس اولین کارت را مرور کن.',
      action: 'رفتن به کتابخانهٔ زبان',
      icon: 'lucideLanguages',
      link: '/english',
    },
    {
      id: 'health',
      title: 'ثبت عادت‌های سلامت',
      description:
        'در بخش سلامت، یک وعده را با دکمهٔ ثبت کنار آن اضافه کن؛ ثبت یک ورزش هم قدم اول را کامل می‌کند.',
      action: 'ثبت اولین فعالیت سلامت',
      icon: 'lucideSalad',
      link: '/health',
    },
  ] as const;
  protected readonly selectedGoal = computed(() =>
    this.goals.find(
      (goal) =>
        this.onboarding.hasValue() && goal.id === this.onboarding.value().goal,
    ),
  );

  protected async chooseGoal(goal: OnboardingGoal | null): Promise<void> {
    if (this.savingGoal()) return;
    this.savingGoal.set(true);
    this.goalError.set(false);
    try {
      const state = await firstValueFrom(
        this.http.put<OnboardingState>(`${this.api}/onboarding`, { goal }),
      );
      this.onboarding.set(state);
      this.editingGoal.set(false);
    } catch {
      this.goalError.set(true);
      return;
    } finally {
      this.savingGoal.set(false);
    }
    const selected = this.goals.find((item) => item.id === goal);
    if (selected)
      await this.router.navigate([selected.link], {
        queryParamsHandling: 'preserve',
      });
  }
  private readonly today = toIsoDate(new Date());
  protected readonly todayLabel = computed(() =>
    this.locale.date(this.today, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  );
  protected readonly name = computed(() => this.auth.user()?.name ?? '');

  protected readonly fa = (value: number, options?: Intl.NumberFormatOptions) =>
    this.locale.number(value, options);
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
        value: open
          ? `${this.locale.number(open)} کار باقی مانده`
          : 'کاری باقی نمانده',
        accent: 'applet-planner',
      },
      {
        title: 'یادگیری زبان',
        loading: this.english.isLoading() && !this.english.hasValue(),
        action: 'ادامه یادگیری',
        icon: 'lucideLanguages',
        link: '/english',
        value: due
          ? `${this.locale.number(due)} کارت آماده مرور`
          : 'مروری باقی نمانده',
        accent: 'applet-english',
      },
      {
        title: 'تغذیه',
        loading: this.meals.isLoading() && !this.meals.hasValue(),
        action: 'ثبت وعده غذایی',
        icon: 'lucideSalad',
        link: '/health/nutrition',
        value:
          avg === null
            ? 'وعده‌ای ثبت نشده'
            : `میانگین امتیاز ${this.locale.number(avg)}`,
        accent: 'applet-health',
      },
      {
        title: 'حرکت و تمرین',
        loading: this.week.isLoading() && !this.week.hasValue(),
        action: 'برنامه تمرین من',
        icon: 'lucideDumbbell',
        link: '/health/fitness',
        value: `${this.locale.number(this.week.value()?.minutes ?? 0)} از ۱۵۰ دقیقه`,
        accent: 'applet-health',
      },
    ];
  });
}
