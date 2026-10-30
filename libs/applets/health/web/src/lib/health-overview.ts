import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  BALANCED_RULES,
  type Diet,
  type FitnessWeek,
  type HealthProfile,
  type MealLog,
  type MealLogInput,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  type MealType,
} from '@all-in-one/applets/health/contracts';
import { toIsoDate } from '@all-in-one/shared/schemas';
import {
  AioButton,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioIcon,
  AioProgressDirectives,
  AioSkeleton,
  aioToast,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage, faNumber } from '@all-in-one/web/shared';
import {
  lucideApple,
  lucideChevronLeft,
  lucideCoffee,
  lucideDumbbell,
  lucidePlus,
  lucideSandwich,
  lucideSoup,
} from '@ng-icons/lucide';
import { HealthApi, scoreClass } from './health-api';
import { MealForm } from './meal-form';

const MEAL_ICONS: Record<MealType, string> = {
  BREAKFAST: 'lucideCoffee',
  LUNCH: 'lucideSandwich',
  DINNER: 'lucideSoup',
  SNACK: 'lucideApple',
};

/** Today at a glance (Gordool style): calories, meal score, weekly training, two-tap logging. */
@Component({
  selector: 'health-overview',
  imports: [
    AioButton,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioIcon,
    AioProgressDirectives,
    AioSkeleton,
    MealForm,
    RouterLink,
  ],
  providers: [
    provideIcons({
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
      <section
        class="glass flex flex-col gap-4 rounded-3xl p-5"
        aria-labelledby="calories-title"
      >
        @if (profile.isLoading() && !profile.hasValue()) {
          <div aioSkeleton class="h-24 rounded-2xl"></div>
        } @else if (target(); as t) {
          <div class="flex items-end justify-between gap-3">
            <div class="flex flex-col">
              <h2 id="calories-title" class="text-muted-foreground text-sm">
                {{ left() >= 0 ? 'کالری باقی‌مانده' : 'بیشتر از نیاز امروز' }}
              </h2>
              <p class="text-4xl font-bold">
                {{ fa(Math.abs(left())) }}
              </p>
            </div>
            <p class="text-muted-foreground text-end text-sm">
              {{ fa(eaten()) }} خورده‌ای<br />از {{ fa(t) }} کالری
            </p>
          </div>
          <div
            aioProgress
            class="h-3 rounded-full"
            [value]="Math.min((eaten() * 100) / t, 100)"
            aria-label="کالری خورده‌شده از نیاز روزانه"
          >
            <div aioProgressIndicator class="rounded-full"></div>
          </div>
        } @else {
          <div class="flex flex-col gap-3">
            <h2 id="calories-title" class="text-lg font-bold">
              بیا نیاز روزانه‌ات رو حساب کنیم
            </h2>
            <p class="text-muted-foreground text-sm">
              قد، وزن و سنت رو بگو تا بدونی هر روز چقدر کالری لازم داری.
            </p>
            <a aioBtn routerLink="profile" class="self-start">تکمیل مشخصات</a>
          </div>
        }

        <dl class="grid grid-cols-3 gap-2 text-center">
          @for (stat of stats(); track stat.label) {
            <div class="bg-background/60 flex flex-col gap-0.5 rounded-2xl p-3">
              <dt class="text-muted-foreground text-xs">{{ stat.label }}</dt>
              <dd class="text-lg font-bold">{{ stat.value }}</dd>
            </div>
          }
        </dl>
      </section>

      <section class="flex flex-col gap-2" aria-labelledby="meals-title">
        <h2 id="meals-title" class="px-1 text-lg font-bold">
          امروز چی خوردی؟
        </h2>
        <ul class="glass divide-border/60 flex flex-col divide-y rounded-2xl">
          @for (row of mealRows(); track row.type) {
            <li class="flex min-h-16 items-center gap-3 px-3">
              <span
                class="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl"
              >
                <aio-icon [name]="row.icon" size="sm" />
              </span>
              <div class="flex min-w-0 flex-1 flex-col py-2">
                <span class="font-semibold">{{ row.label }}</span>
                <span class="text-muted-foreground truncate text-sm">{{
                  row.summary
                }}</span>
              </div>
              @if (row.score !== null) {
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-bold"
                  [class]="scoreClass(row.score)"
                  [attr.aria-label]="'امتیاز ' + fa(row.score)"
                  >{{ fa(row.score) }}</span
                >
              }
              <button
                aioBtn
                size="icon"
                class="size-11 rounded-full"
                (click)="logFor.set(row.type)"
                [attr.aria-label]="'ثبت ' + row.label"
              >
                <aio-icon name="lucidePlus" />
              </button>
            </li>
          }
        </ul>
      </section>

      <a
        routerLink="fitness"
        class="glass flex items-center gap-3 rounded-2xl p-4"
        aria-label="ورزش این هفته، رفتن به ورزش"
      >
        <span
          class="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl"
        >
          <aio-icon name="lucideDumbbell" size="sm" />
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-1.5">
          <span class="flex items-center justify-between text-sm">
            <span class="font-semibold">ورزش این هفته</span>
            <span class="text-muted-foreground"
              >{{ fa(minutes()) }} از {{ fa(goal()) }} دقیقه</span
            >
          </span>
          <span
            aioProgress
            class="h-2 rounded-full"
            [value]="Math.min((minutes() * 100) / goal(), 100)"
            aria-label="دقیقه ورزش این هفته"
          >
            <span aioProgressIndicator class="rounded-full"></span>
          </span>
        </span>
        <aio-icon
          name="lucideChevronLeft"
          size="sm"
          class="text-muted-foreground"
        />
      </a>
    </div>

    <aio-dialog
      [open]="!!logFor()"
      (openChange)="$event || logFor.set(null)"
      [title]="'ثبت ' + (logFor() ? mealLabels[logFor()!] : 'وعده')"
      [description]="'امتیاز بر اساس ' + (diet()?.name ?? 'تغذیه متعادل')"
      contentClass="applet-health"
    >
      <ng-template aioDialogBody>
        <health-meal-form
          [date]="today"
          [mealType]="logFor()"
          [rules]="diet()?.rules ?? balanced"
          [calorieTarget]="target()"
          (saved)="saveMeal($event)"
        />
      </ng-template>
      <ng-template aioDialogActions>
        <button aioBtn variant="outline" (click)="logFor.set(null)">
          انصراف
        </button>
        <button aioBtn type="submit" form="meal-form" [disabled]="saving()">
          ثبت و سنجش
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class HealthOverview {
  private readonly api = inject(HealthApi);
  protected readonly today = toIsoDate(new Date());
  protected readonly Math = Math;
  protected readonly balanced = BALANCED_RULES;
  protected readonly mealLabels = MEAL_TYPE_LABELS;
  protected readonly scoreClass = scoreClass;
  protected readonly fa = (n: number) => faNumber(n);

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
    () => `${this.api.base}/meals?date=${this.today}`,
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
      { label: 'وعده', value: faNumber(meals.length) },
      { label: 'امتیاز تغذیه', value: score === null ? '–' : faNumber(score) },
      {
        label: 'جلسه ورزش',
        value: faNumber(this.week.value()?.sessions ?? 0),
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
            (calories ? `، ${faNumber(calories)} کالری` : '')
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
      this.meals.update((list) => [...(list ?? []), meal]);
      this.logFor.set(null);
      aioToast.success(
        `ثبت شد! امتیاز این وعده: ${faNumber(meal.score)}`,
        meal.feedback[0],
      );
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
