import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  BALANCED_RULES,
  type Diet,
  type FitnessWeek,
  type HealthProfile,
  type MealPlan,
  type Recipe,
  type MealLog,
  type MealLogInput,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  type MealType,
} from '@all-in-one/applets/health/contracts';
import { addDays, toIsoDate } from '@all-in-one/shared/schemas';
import {
  AioTranslate,
  AioMetric,
  AioCardDirectives,
  AioButton,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioIcon,
  AioProgressDirectives,
  AioSkeleton,
  provideIcons,
  AioSkeletonLines,
  AioLocale,
  AioNotifications,
} from '@all-in-one/ui';
import { apiErrorMessage } from '@all-in-one/web/shared';
import {
  lucideClock,
  lucideApple,
  lucideChevronLeft,
  lucideCoffee,
  lucideDumbbell,
  lucidePlus,
  lucideSandwich,
  lucideSoup,
} from '@ng-icons/lucide';
import { FastingCard } from './fasting-card';
import { HealthApi, scoreClass } from './health-api';
import { MealForm } from './meal-form';
import { WeightCard } from './weight-card';

const MEAL_ICONS: Record<MealType, string> = {
  BREAKFAST: 'lucideCoffee',
  LUNCH: 'lucideSandwich',
  DINNER: 'lucideSoup',
  SNACK: 'lucideApple',
};

/** Today at a glance (Gordool style): calories, meal score, fasting, weight goal, weekly training, two-tap logging. */
@Component({
  selector: 'health-overview',
  imports: [
    AioMetric,
    AioCardDirectives,
    AioButton,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioIcon,
    AioProgressDirectives,
    AioSkeleton,
    FastingCard,
    MealForm,
    RouterLink,
    WeightCard,
    AioSkeletonLines,
    AioTranslate,
  ],
  providers: [
    provideIcons({
      lucideClock,
      lucideApple,
      lucideChevronLeft,
      lucideCoffee,
      lucideDumbbell,
      lucidePlus,
      lucideSandwich,
      lucideSoup,
    }),
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="health-topline">
        <p class="text-muted-foreground text-sm">
          {{ (selectedDate() === today ? 'امروز' : 'گزارش روز') | aioTranslate
          }}{{ '،' | aioTranslate }}
          {{ dateLabel(selectedDate()) | aioTranslate }}
        </p>
        <a
          aioBtn
          variant="ghost"
          class="health-soft-action"
          routerLink="profile"
          >{{ 'مشخصات من' | aioTranslate }}</a
        >
      </div>
      <div
        class="health-day-strip"
        role="group"
        [attr.aria-label]="'انتخاب روز' | aioTranslate"
      >
        @for (day of days; track day.date) {
          <button
            aioBtn
            variant="ghost"
            [attr.aria-pressed]="selectedDate() === day.date"
            (click)="selectedDate.set(day.date)"
            [attr.aria-label]="dateLabel(day.date) | aioTranslate"
          >
            <span class="text-xs">{{ day.label | aioTranslate }}</span
            ><strong class="text-lg">{{ day.number | aioTranslate }}</strong>
          </button>
        }
      </div>
      <div class="health-overview-layout flex flex-col gap-6 lg:grid">
        <div class="flex min-w-0 flex-col gap-4">
          <div class="health-daily-grid">
            <section aioCard class="health-calorie-panel">
              <div aioCardHeader>
                <h2 aioCardTitle class="health-metric-label min-h-10">
                  {{
                    (left() >= 0 ? 'کالری باقی‌مانده' : 'بیشتر از هدف روزانه')
                      | aioTranslate
                  }}
                </h2>
              </div>
              <div aioCardContent class="flex flex-col gap-4">
                @if (
                  (profile.isLoading() && !profile.hasValue()) ||
                  (meals.isLoading() && !meals.hasValue())
                ) {
                  <div
                    class="flex min-h-40 flex-col gap-4"
                    role="status"
                    [attr.aria-label]="
                      'در حال دریافت هدف روزانه' | aioTranslate
                    "
                    aioSkeletonLines
                    [lines]="[
                      'h-14 w-24 rounded-2xl',
                      'h-5 w-3/4 rounded-lg',
                      'h-2 w-full rounded-full',
                    ]"
                  ></div>
                } @else if (profile.error() || meals.error()) {
                  <p class="health-number">—</p>
                  <button aioBtn variant="link" (click)="reloadNutrition()">
                    {{ 'تلاش دوباره' | aioTranslate }}
                  </button>
                } @else if (target(); as t) {
                  <div class="flex min-h-40 flex-col gap-4">
                    <p class="health-number">
                      {{ fa(Math.abs(left())) | aioTranslate }}
                    </p>
                    <p class="health-metric-label">
                      {{ 'از {0} کالری هدف روزانه' | aioTranslate: [fa(t)] }}
                    </p>
                    <div
                      aioProgress
                      [value]="Math.min((eaten() * 100) / t, 100)"
                      [attr.aria-label]="'سهم کالری ثبت‌شده' | aioTranslate"
                    >
                      <div aioProgressIndicator></div>
                    </div>
                  </div>
                } @else {
                  <div class="flex min-h-40 flex-col items-start gap-4">
                    <p class="text-lg font-semibold">
                      {{ 'از خودت بگو' | aioTranslate }}
                    </p>
                    <p class="health-metric-label">
                      {{
                        'برای محاسبه هدف روزانه، مشخصاتت را کامل کن.'
                          | aioTranslate
                      }}
                    </p>
                    <a aioBtn class="health-soft-action" routerLink="profile">{{
                      'تکمیل مشخصات' | aioTranslate
                    }}</a>
                  </div>
                }
                <span class="health-helper-art" aria-hidden="true"></span>
              </div>
            </section>
            <section
              class="health-metric"
              [attr.aria-label]="'کالری خورده‌شده' | aioTranslate"
            >
              <div class="flex items-center justify-between gap-2">
                <h2 class="health-metric-label">
                  {{ 'خورده‌شده' | aioTranslate }}
                </h2>
                <aio-icon
                  name="lucideApple"
                  size="sm"
                  class="text-[var(--health-orange)]"
                />
              </div>
              <p class="health-small-number">
                {{
                  (meals.isLoading() ? '…' : meals.error() ? '—' : fa(eaten()))
                    | aioTranslate
                }}
              </p>
              <span class="health-metric-label">{{
                'کالری ثبت‌شده' | aioTranslate
              }}</span>
            </section>
            <a class="health-metric" routerLink="fitness"
              ><div class="flex items-center justify-between gap-2">
                <h2 class="health-metric-label">
                  {{ 'فعالیت این هفته' | aioTranslate }}
                </h2>
                <aio-icon
                  name="lucideDumbbell"
                  size="sm"
                  class="text-[var(--health-purple)]"
                />
              </div>
              <p class="health-small-number">
                {{
                  (week.isLoading() ? '…' : week.error() ? '—' : fa(minutes()))
                    | aioTranslate
                }}
              </p>
              <span class="health-metric-label">{{
                'دقیقه از {0}' | aioTranslate: [fa(goal())]
              }}</span></a
            >
          </div>
          <div
            class="health-macro-strip"
            [attr.aria-label]="'درشت‌مغذی‌های ثبت‌شده' | aioTranslate"
          >
            @for (macro of macroCards(); track macro.label) {
              <div class="health-macro">
                <span class="health-icon-disc" [style.color]="macro.color"
                  ><aio-icon [name]="macro.icon" size="sm"
                /></span>
                <div class="flex min-w-0 flex-col items-center gap-1">
                  <p class="text-muted-foreground whitespace-nowrap text-xs">
                    {{ macro.label | aioTranslate }}
                  </p>
                  <strong
                    class="inline-flex items-baseline justify-center gap-1 whitespace-nowrap text-sm"
                    >{{ macro.value | aioTranslate
                    }}<span class="font-normal text-xs">{{
                      'گرم' | aioTranslate
                    }}</span></strong
                  >
                </div>
              </div>
            }
          </div>
          <p class="text-muted-foreground min-h-9 px-1 text-xs">
            {{
              (macros()
                ? 'جمع مقادیر وعده‌هایی که اطلاعات تغذیه‌ای دارند؛ تقریبی است.'
                : 'برای دیدن درشت‌مغذی‌ها، وعده‌ای با اطلاعات تغذیه‌ای ثبت کن.'
              ) | aioTranslate
            }}
          </p>
          <div class="health-body-grid">
            <health-fasting-card />
            <health-weight-card (changed)="profile.reload()" />
          </div>
        </div>
        <section
          class="flex min-w-0 flex-col gap-3"
          aria-labelledby="daily-plan-title"
        >
          <div class="health-topline">
            <h2 id="daily-plan-title" class="health-section-heading">
              {{ 'برنامه غذایی این روز' | aioTranslate }}
            </h2>
            <a aioBtn variant="link" routerLink="nutrition">{{
              'همه' | aioTranslate
            }}</a>
          </div>
          <div class="health-meal-list">
            @if (plan.isLoading()) {
              <div aioSkeleton class="my-5 h-24 rounded-2xl"></div>
            } @else if (plan.error()) {
              <p role="alert" class="py-6 text-sm">
                {{ 'برنامه غذایی دریافت نشد.' | aioTranslate }}
              </p>
              <button aioBtn variant="link" (click)="plan.reload()">
                {{ 'تلاش دوباره' | aioTranslate }}
              </button>
            } @else if (!plannedMeals().length) {
              <div class="flex flex-col items-start gap-4 py-7">
                <span class="health-meal-art"
                  ><aio-icon name="lucideSoup"
                /></span>
                <h3 class="font-semibold">
                  {{ 'برای وعده بعدی ایده بگیر.' | aioTranslate }}
                </h3>
                <p class="health-metric-label">
                  {{
                    'برای این روز برنامه‌ای نداری. بر اساس رژیمت برنامه بچین یا غذای خودت را ثبت کن.'
                      | aioTranslate
                  }}
                </p>
                <a aioBtn class="health-soft-action" routerLink="nutrition">{{
                  'چیدن برنامه غذایی' | aioTranslate
                }}</a>
              </div>
            } @else {
              @for (meal of plannedMeals(); track meal.mealType) {
                <button
                  class="health-meal-row"
                  (click)="selectedMeal.set(meal)"
                >
                  <span class="health-meal-art" [attr.data-meal]="meal.mealType"
                    ><aio-icon [name]="mealIcons[meal.mealType]" /></span
                  ><span class="flex min-w-0 flex-1 flex-col gap-1"
                    ><strong class="text-sm">{{
                      meal.recipe.title | aioTranslate
                    }}</strong
                    ><span class="health-metric-label">{{
                      '{0}، {1} کالری'
                        | aioTranslate
                          : [
                              mealLabels[meal.mealType],
                              fa(
                                Math.round(meal.recipe.calories * meal.servings)
                              ),
                            ]
                    }}</span></span
                  ><aio-icon
                    name="lucideChevronLeft"
                    size="sm"
                    class="text-muted-foreground ltr:-scale-x-100"
                  />
                </button>
              }
            }
          </div>
        </section>
        <section
          class="flex min-w-0 flex-col gap-3"
          aria-labelledby="meals-title"
        >
          <div class="health-topline">
            <h2 id="meals-title" class="health-section-heading">
              {{ 'چی خوردی؟' | aioTranslate }}
            </h2>
            <span class="text-muted-foreground text-xs">{{
              (selectedDate() === today ? 'امروز' : dateLabel(selectedDate()))
                | aioTranslate
            }}</span>
          </div>
          <ul class="health-meal-list">
            @if (meals.error()) {
              <li role="alert" class="py-5 text-sm">
                {{ 'وعده‌ها دریافت نشدند؛ دوباره تلاش کن.' | aioTranslate }}
              </li>
            } @else {
              @for (row of mealRows(); track row.type) {
                <li class="health-meal-row">
                  <span
                    class="health-icon-disc"
                    [style.color]="
                      row.type === 'BREAKFAST'
                        ? 'var(--health-orange)'
                        : 'var(--health-blue)'
                    "
                    ><aio-icon [name]="row.icon" size="sm"
                  /></span>
                  <div
                    class="flex min-w-0 flex-1 flex-col gap-1"
                    aioMetric
                    [label]="
                      (meals.isLoading() ? 'در حال دریافت…' : row.summary)
                        | aioTranslate
                    "
                    [value]="row.label"
                    labelClass="health-metric-label break-words"
                    valueClass="text-sm"
                    [labelFirst]="false"
                  ></div>
                  <button
                    aioBtn
                    variant="ghost"
                    size="icon"
                    class="health-soft-action"
                    (click)="initialRecipe.set(null); logFor.set(row.type)"
                    [attr.aria-label]="'ثبت ' + row.label | aioTranslate"
                  >
                    <aio-icon name="lucidePlus" size="sm" />
                  </button>
                </li>
              }
            }
          </ul>
        </section>
        <section class="health-workout-banner">
          <div class="flex min-w-0 flex-col items-start gap-3">
            <span class="health-metric-label">{{
              'کمی حرکت، برای حال بهتر' | aioTranslate
            }}</span>
            <h2 class="health-section-heading">
              {{ 'تمرین بعدی‌ات همین‌جاست.' | aioTranslate }}
            </h2>
            <p class="health-metric-label">
              {{
                'خانه، TRX یا باشگاه؛ با زمان و تجهیزات خودت.' | aioTranslate
              }}
            </p>
            <a aioBtn class="health-primary-action" routerLink="fitness"
              ><aio-icon name="lucideDumbbell" size="sm" />{{
                'رفتن به تمرین' | aioTranslate
              }}</a
            >
          </div>
          <span class="health-helper-art shrink-0" aria-hidden="true"></span>
        </section>
      </div>
    </div>
    <aio-dialog
      [open]="selectedMeal() !== null"
      (openChange)="!$event && selectedMeal.set(null)"
      [title]="selectedMeal()?.recipe?.title ?? 'جزئیات وعده' | aioTranslate"
      contentClass="applet-health health-calm"
    >
      <ng-template aioDialogBody>
        @if (selectedMeal(); as meal) {
          <div class="flex flex-col gap-6">
            <div class="flex flex-col items-center gap-3 pt-2">
              <span
                class="health-meal-art size-24"
                [attr.data-meal]="meal.mealType"
                ><aio-icon [name]="mealIcons[meal.mealType]" size="lg"
              /></span>
              <p class="health-metric-label">
                {{
                  '{0}، {1} سهم از دستور پخت'
                    | aioTranslate
                      : [mealLabels[meal.mealType], fa(meal.servings)]
                }}
              </p>
            </div>
            <div class="grid grid-cols-3 gap-3 border-y border-border py-5">
              <div
                class="health-sheet-stat"
                aioMetric
                [label]="'کالری' | aioTranslate"
                [value]="fa(Math.round(meal.recipe.calories * meal.servings))"
                labelClass="health-metric-label"
                valueClass="health-small-number"
                [labelFirst]="false"
                icon="lucideApple"
                iconClass="text-[var(--health-orange)]"
              ></div>
              <div
                class="health-sheet-stat"
                aioMetric
                [label]="'دقیقه آماده‌سازی' | aioTranslate"
                [value]="fa(meal.recipe.prepMinutes)"
                labelClass="health-metric-label"
                valueClass="health-small-number"
                [labelFirst]="false"
                icon="lucideClock"
                iconClass="text-[var(--health-green)]"
              ></div>
              <div
                class="health-sheet-stat"
                aioMetric
                [label]="'ماده اولیه' | aioTranslate"
                [value]="fa(meal.recipe.ingredients.length)"
                labelClass="health-metric-label"
                valueClass="health-small-number"
                [labelFirst]="false"
                icon="lucideSoup"
                iconClass="text-[var(--health-blue)]"
              ></div>
            </div>
            <div class="grid grid-cols-3 gap-3 text-center">
              <div
                aioMetric
                [label]="'پروتئین' | aioTranslate"
                [value]="
                  fa(Math.round(meal.recipe.proteinG * meal.servings)) + ' گرم'
                "
                labelClass="health-metric-label"
                valueClass=""
              ></div>
              <div
                aioMetric
                [label]="'کربوهیدرات' | aioTranslate"
                [value]="
                  fa(Math.round(meal.recipe.carbsG * meal.servings)) + ' گرم'
                "
                labelClass="health-metric-label"
                valueClass=""
              ></div>
              <div
                aioMetric
                [label]="'چربی' | aioTranslate"
                [value]="
                  fa(Math.round(meal.recipe.fatG * meal.servings)) + ' گرم'
                "
                labelClass="health-metric-label"
                valueClass=""
              ></div>
            </div>
            <div>
              <h3 class="mb-3 font-semibold">
                {{ 'مواد لازم برای هر سهم پایه' | aioTranslate }}
              </h3>
              @for (ingredient of meal.recipe.ingredients; track $index) {
                <p class="health-topline border-b border-border py-3 text-sm">
                  <span>{{ ingredient.item | aioTranslate }}</span
                  ><span class="text-muted-foreground">{{
                    ingredient.amount | aioTranslate
                  }}</span>
                </p>
              }
            </div>
            <div>
              <h3 class="mb-3 font-semibold">
                {{ 'طرز تهیه' | aioTranslate }}
              </h3>
              <ol
                class="flex list-inside [list-style-type:persian] flex-col gap-3 text-sm leading-7"
              >
                @for (step of meal.recipe.steps; track $index) {
                  <li>{{ step | aioTranslate }}</li>
                }
              </ol>
            </div>
          </div>
        }
      </ng-template>
      <ng-template aioDialogActions
        ><a
          aioBtn
          variant="outline"
          routerLink="nutrition"
          (click)="selectedMeal.set(null)"
          >{{ 'دیدن جایگزین‌ها' | aioTranslate }}</a
        ><button
          aioBtn
          class="health-primary-action"
          (click)="logPlannedMeal()"
        >
          {{ 'ثبت این وعده' | aioTranslate }}
        </button></ng-template
      >
    </aio-dialog>

    <aio-dialog
      [open]="!!logFor()"
      (openChange)="$event || logFor.set(null)"
      [title]="
        'ثبت ' + (logFor() ? mealLabels[logFor()!] : 'وعده') | aioTranslate
      "
      [description]="
        'امتیاز بر اساس ' + (diet()?.name ?? 'تغذیه متعادل') | aioTranslate
      "
      contentClass="applet-health health-calm"
    >
      <ng-template aioDialogBody>
        <health-meal-form
          [date]="selectedDate()"
          [mealType]="logFor()"
          [initialRecipe]="initialRecipe()"
          [rules]="diet()?.rules ?? balanced"
          [calorieTarget]="target()"
          (saved)="saveMeal($event)"
        />
      </ng-template>
      <ng-template aioDialogActions>
        <button aioBtn variant="outline" (click)="logFor.set(null)">
          {{ 'انصراف' | aioTranslate }}
        </button>
        <button aioBtn type="submit" form="meal-form" [disabled]="saving()">
          {{ 'ثبت و سنجش' | aioTranslate }}
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class HealthOverview {
  protected readonly locale = inject(AioLocale);

  private readonly notifications = inject(AioNotifications);

  private readonly api = inject(HealthApi);
  protected readonly today = toIsoDate(new Date());
  protected readonly selectedDate = signal(this.today);
  protected readonly dateLabel = (date: string) =>
    this.locale.date(date, { day: 'numeric', month: 'long' });
  private readonly weekStart = addDays(
    this.today,
    -((new Date(`${this.today}T12:00:00Z`).getUTCDay() + 1) % 7),
  );
  protected readonly days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(this.weekStart, i);
    return {
      date,
      label: this.locale.date(date, { weekday: 'short' }),
      number: this.locale.date(date, { day: 'numeric' }),
    };
  });
  protected readonly mealIcons = MEAL_ICONS;
  protected readonly initialRecipe = signal<Recipe | null>(null);
  protected readonly selectedMeal = signal<{
    recipe: Recipe;
    mealType: MealType;
    servings: number;
  } | null>(null);
  protected readonly plan = httpResource<MealPlan | null>(
    () => `${this.api.base}/meal-plans/current`,
  );
  protected readonly plannedMeals = computed(() => {
    const p = this.plan.value();
    return (
      p?.days.find((d) => d.date === this.selectedDate())?.meals ?? []
    ).flatMap((m) =>
      p?.recipes[m.recipeSlug]
        ? [
            {
              recipe: p.recipes[m.recipeSlug],
              mealType: m.mealType,
              servings: m.servings ?? 1,
            },
          ]
        : [],
    );
  });
  protected readonly macroCards = computed(() => {
    const m = this.macros();
    const known = !this.meals.isLoading() && !this.meals.error();
    return [
      {
        label: 'پروتئین',
        value: known && m ? this.locale.number(m.protein) : '—',
        icon: 'lucideDumbbell',
        color: 'var(--health-green)',
      },
      {
        label: 'کربوهیدرات',
        value: known && m ? this.locale.number(m.carbs) : '—',
        icon: 'lucideSandwich',
        color: 'var(--health-orange)',
      },
      {
        label: 'چربی',
        value: known && m ? this.locale.number(m.fat) : '—',
        icon: 'lucideCoffee',
        color: 'var(--health-blue)',
      },
    ];
  });
  protected reloadNutrition() {
    this.profile.reload();
    this.meals.reload();
  }
  protected logPlannedMeal() {
    const meal = this.selectedMeal();
    if (!meal) return;
    this.initialRecipe.set({
      ...meal.recipe,
      calories: Math.round(meal.recipe.calories * meal.servings),
      proteinG: Math.round(meal.recipe.proteinG * meal.servings),
      carbsG: Math.round(meal.recipe.carbsG * meal.servings),
      fatG: Math.round(meal.recipe.fatG * meal.servings),
    });
    this.selectedMeal.set(null);
    this.logFor.set(meal.mealType);
  }
  protected readonly Math = Math;
  protected readonly balanced = BALANCED_RULES;
  protected readonly mealLabels = MEAL_TYPE_LABELS;
  protected readonly scoreClass = scoreClass;
  protected readonly fa = (n: number) => this.locale.number(n);

  protected readonly profile = httpResource<HealthProfile>(
    () => `${this.api.base}/profile`,
  );
  protected readonly diets = httpResource<Diet[]>(
    () => `${this.api.base}/diets`,
  );
  protected readonly week = httpResource<FitnessWeek>(
    () => `${this.api.base}/workouts/week?date=${this.today}`,
  );
  protected readonly meals = httpResource<MealLog[]>(
    () => `${this.api.base}/meals?date=${this.selectedDate()}`,
  );

  protected readonly logFor = signal<MealType | null>(null);
  protected readonly saving = signal(false);

  /** The diet meals are scored against (same rule as the api). */
  protected readonly diet = computed(() => {
    const p = this.profile.value();
    if (!p || p.dietMode === 'NONE' || !p.dietSlug) return null;
    return this.diets.value()?.find((d) => d.slug === p.dietSlug) ?? null;
  });
  protected readonly target = computed(
    () => this.profile.value()?.calorieTarget ?? null,
  );
  private readonly todayMeals = computed(() => this.meals.value() ?? []);
  protected readonly eaten = computed(() =>
    this.todayMeals().reduce((sum, m) => sum + (m.calories ?? 0), 0),
  );
  /** Macro totals of today's meals that have them (AI estimates or the assistant). */
  protected readonly macros = computed(() => {
    const meals = this.todayMeals().filter(
      (m) => m.proteinG !== null || m.carbsG !== null || m.fatG !== null,
    );
    if (!meals.length) return null;
    const sum = (pick: (m: (typeof meals)[number]) => number | null) =>
      meals.reduce((total, m) => total + (pick(m) ?? 0), 0);
    return {
      protein: sum((m) => m.proteinG),
      carbs: sum((m) => m.carbsG),
      fat: sum((m) => m.fatG),
    };
  });
  protected readonly left = computed(() => (this.target() ?? 0) - this.eaten());
  protected readonly minutes = computed(() => this.week.value()?.minutes ?? 0);
  protected readonly goal = computed(
    () => this.week.value()?.goalMinutes || 150,
  );

  protected readonly stats = computed(() => {
    const meals = this.todayMeals();
    const score = meals.length
      ? Math.round(meals.reduce((s, m) => s + m.score, 0) / meals.length)
      : null;
    return [
      { label: 'وعده', value: this.locale.number(meals.length) },
      {
        label: 'امتیاز تغذیه',
        value: score === null ? '–' : this.locale.number(score),
      },
      {
        label: 'جلسه ورزش',
        value: this.locale.number(this.week.value()?.sessions ?? 0),
      },
    ];
  });

  protected readonly mealRows = computed(() =>
    MEAL_TYPES.map((type) => {
      const logged = this.todayMeals().filter((m) => m.mealType === type);
      const calories = logged.reduce((s, m) => s + (m.calories ?? 0), 0);
      return {
        type,
        label: MEAL_TYPE_LABELS[type],
        icon: MEAL_ICONS[type],
        summary: logged.length
          ? logged.map((m) => m.description).join('، ') +
            (calories ? `، ${this.locale.number(calories)} کالری` : '')
          : 'هنوز ثبت نشده',
        score: logged.length
          ? Math.round(logged.reduce((s, m) => s + m.score, 0) / logged.length)
          : null,
      };
    }),
  );

  protected async saveMeal(input: MealLogInput) {
    this.saving.set(true);
    try {
      const meal = await this.api.logMeal(input);
      if (input.date === this.selectedDate()) {
        this.meals.update((list) => [...(list ?? []), meal]);
      }
      this.logFor.set(null);
      this.notifications.success(
        `ثبت شد! امتیاز این وعده: ${this.locale.number(meal.score)}`,
        meal.feedback[0],
      );
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
