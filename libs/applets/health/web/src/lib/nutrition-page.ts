import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  recipeAllowed,
  type Recipe,
  type ShoppingItem,
  type DietSuggestion,
  type MealType,
  BALANCED_RULES,
  type Diet,
  DIET_MODE_LABELS,
  type HealthProfile,
  type MealLog,
  type MealLogInput,
  type MealPlan,
  MEAL_TYPE_LABELS,
} from '@all-in-one/applets/health/contracts';
import { toIsoDate } from '@all-in-one/shared/schemas';
import {
  AioAccordionContent,
  AioAccordionDirectives,
  AioAccordionTrigger,
  AioBadge,
  AioButton,
  AioCardDirectives,
  AioConfirm,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioEmptyDirectives,
  AioIcon,
  AioItemDirectives,
  aioToast,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage, faDate, faNumber } from '@all-in-one/web/shared';
import {
  lucideCalendarDays,
  lucideChefHat,
  lucidePlus,
  lucideSalad,
  lucideTrash2,
} from '@ng-icons/lucide';
import { DietChooser } from './diet-chooser';
import { HealthApi, scoreClass } from './health-api';
import { MealForm } from './meal-form';

@Component({
  selector: 'health-nutrition-page',
  imports: [
    AioAccordionContent,
    AioAccordionDirectives,
    AioAccordionTrigger,
    AioBadge,
    AioButton,
    AioCardDirectives,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioEmptyDirectives,
    AioIcon,
    AioItemDirectives,
    DietChooser,
    MealForm,
    RouterLink,
  ],
  providers: [
    provideIcons({
      lucideCalendarDays,
      lucideChefHat,
      lucidePlus,
      lucideSalad,
      lucideTrash2,
    }),
  ],
  template: `
    <div class="flex flex-col gap-5">
      <section aioCard>
        <div aioCardHeader>
          <h2 aioCardTitle>رژیم شما</h2>
          <p aioCardDescription>{{ modeLabel() }}</p>
        </div>
        <div
          aioCardContent
          class="flex flex-wrap items-center justify-between gap-3"
        >
          <div class="text-sm">
            @if (diet(); as d) {
              <span class="font-semibold">{{ d.name }}</span>
              <span class="text-muted-foreground">
                ، کربوهیدرات {{ fa(d.carbsPct) }}٪، پروتئین
                {{ fa(d.proteinPct) }}٪، چربی {{ fa(d.fatPct) }}٪</span
              >
            } @else {
              <span class="text-muted-foreground"
                >وعده‌ها با الگوی تغذیه متعادل سنجیده می‌شوند.</span
              >
            }
            @if (profile.value()?.calorieTarget; as t) {
              <div class="text-muted-foreground mt-1">
                نیاز روزانه: {{ fa(t) }} کالری
              </div>
            }
          </div>
          <button
            aioBtn
            variant="outline"
            size="sm"
            (click)="choosing.set(true)"
          >
            {{
              profile.value()?.dietMode === 'NONE'
                ? 'رژیم خاصی دارید؟'
                : 'تغییر رژیم'
            }}
          </button>
        </div>
        @if (diet(); as d) {
          <div
            aioCardFooter
            class="text-muted-foreground flex-col items-start gap-1 text-xs"
          >
            <p>بیشتر: {{ d.encourage.join('، ') }}</p>
            <p>کمتر: {{ d.limit.join('، ') }}</p>
          </div>
        }
      </section>

      <section aioCard>
        <div aioCardHeader>
          <h2 aioCardTitle>کدام رژیم به سلیقه شما نزدیک‌تر است؟</h2>
          <p aioCardDescription>
            پیشنهادهای اولیه برای مقایسه؛ انتخاب رژیم را خودتان انجام می‌دهید.
          </p>
        </div>
        <div aioCardContent class="flex flex-col gap-3">
          @for (
            suggestion of suggestions.value()?.suggestions ?? [];
            track suggestion.slug
          ) {
            <div>
              <strong>{{ suggestion.name }}</strong>
              <p class="text-muted-foreground text-sm">
                {{ suggestion.reason }}
              </p>
            </div>
          }
          <button aioBtn variant="outline" (click)="choosing.set(true)">
            مقایسه و انتخاب رژیم
          </button>
          <a aioBtn variant="link" routerLink="../profile"
            >تنظیم مواد غذایی مستثنا</a
          >
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">وعده‌های امروز</h2>
          <button aioBtn size="sm" (click)="logging.set(true)">
            <aio-icon name="lucidePlus" size="sm" />
            ثبت وعده
          </button>
        </div>
        @if ((meals.value() ?? []).length === 0) {
          <div aioEmpty class="glass rounded-3xl">
            <div aioEmptyHeader>
              <div aioEmptyMedia variant="icon">
                <aio-icon name="lucideSalad" />
              </div>
              <h3 aioEmptyTitle>هنوز وعده‌ای ثبت نشده</h3>
              <p aioEmptyDescription>
                هر وعده را ثبت کنید تا بر اساس رژیمتان امتیاز و پیشنهاد بگیرید.
              </p>
            </div>
          </div>
        } @else {
          <div aioItemGroup class="flex flex-col gap-2">
            @for (m of meals.value() ?? []; track m.id) {
              <div
                aioItem
                variant="outline"
                class="glass items-start rounded-2xl"
              >
                <div aioItemMedia>
                  <span
                    aioBadge
                    [class]="scoreClass(m.score)"
                    [attr.aria-label]="'امتیاز ' + m.score"
                    >{{ fa(m.score) }}</span
                  >
                </div>
                <div aioItemContent>
                  <div aioItemTitle>
                    {{ mealTypeLabels[m.mealType] }}: {{ m.description }}
                  </div>
                  @for (line of m.feedback; track line) {
                    <p aioItemDescription>{{ line }}</p>
                  }
                </div>
                <div aioItemActions>
                  <button
                    aioBtn
                    variant="ghost"
                    size="icon"
                    (click)="removeMeal(m)"
                    aria-label="حذف"
                  >
                    <aio-icon name="lucideTrash2" size="sm" />
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </section>

      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">برنامه غذایی</h2>
          <button
            aioBtn
            variant="outline"
            size="sm"
            [disabled]="planning()"
            (click)="makePlan()"
          >
            <aio-icon name="lucideCalendarDays" size="sm" />
            {{ plan.value() ? 'چیدن دوباره' : 'برایم بچین' }}
          </button>
        </div>
        @if (plan.value(); as p) {
          <p class="text-muted-foreground text-sm">
            {{ fa(p.days.length) }} روز از {{ faDate(p.startDate) }}، هدف
            {{ fa(p.calorieTarget) }} کالری در روز
          </p>
          <p class="text-muted-foreground text-sm">
            مقدار هر غذا نسبت به یک سهم دستور پخت است؛ کالری‌ها برآوردی‌اند.
          </p>
          <button
            aioBtn
            variant="outline"
            [disabled]="shoppingBusy()"
            (click)="showShopping()"
          >
            {{ shoppingBusy() ? 'در حال دریافت…' : 'فهرست خرید این برنامه' }}
          </button>
          <div aioAccordion type="single" class="glass rounded-3xl px-4">
            @for (day of p.days; track day.date) {
              <div aioAccordionItem>
                <aio-accordion-trigger>
                  {{
                    faDate(day.date, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })
                  }}
                  <span class="text-muted-foreground ms-2 text-xs"
                    >{{ fa(dayCalories(p, day.meals)) }} کالری</span
                  >
                </aio-accordion-trigger>
                <aio-accordion-content>
                  <ul class="flex flex-col gap-2">
                    @for (meal of day.meals; track meal.mealType) {
                      @let r = p.recipes[meal.recipeSlug];
                      <li class="flex items-center justify-between gap-2">
                        <span>
                          <span class="text-muted-foreground text-xs"
                            >{{ mealTypeLabels[meal.mealType] }}:</span
                          >
                          {{ r.title }}، {{ fa(meal.servings ?? 1) }} سهم
                        </span>
                        <button
                          aioBtn
                          variant="outline"
                          size="sm"
                          (click)="openSwap(day.date, meal.mealType)"
                        >
                          جایگزین
                        </button>
                        <a
                          aioBtn
                          variant="link"
                          size="sm"
                          [routerLink]="['recipes', r.slug]"
                          >دستور پخت</a
                        >
                      </li>
                    }
                  </ul>
                </aio-accordion-content>
              </div>
            }
          </div>
        } @else {
          <p class="text-muted-foreground text-sm">
            بر اساس رژیم و نیاز کالری شما، وعده‌های ۷ روز آینده را با دستور پخت
            می‌چینیم.
          </p>
        }
      </section>
    </div>

    <aio-dialog [(open)]="shoppingOpen" title="فهرست خرید">
      <ng-template aioDialogBody
        ><div class="flex flex-col gap-3">
          <p class="text-muted-foreground text-sm">
            مقدار پایه هر ماده را در تعداد سهم ضرب کنید. واحدهای متفاوت با هم
            جمع نشده‌اند.
          </p>
          @for (item of shoppingItems(); track $index) {
            <p>
              <strong>{{ item.item }}</strong
              >: {{ item.amountPerServing }} × {{ fa(item.servings) }} سهم
            </p>
          }
        </div></ng-template
      >
    </aio-dialog>
    <aio-dialog
      [(open)]="swapOpen"
      title="جایگزینی وعده"
      description="فقط غذاهای سازگار با نوع وعده، رژیم برنامه و مواد مستثنا نمایش داده می‌شوند."
    >
      <ng-template aioDialogBody
        ><div class="flex flex-col gap-3">
          @if (recipes.isLoading()) {
            <p role="status">در حال دریافت غذاها…</p>
          }
          @if (recipes.error()) {
            <p role="alert">دریافت غذاها ممکن نشد.</p>
            <button aioBtn variant="outline" (click)="recipes.reload()">
              تلاش دوباره
            </button>
          }
          @for (recipe of swapOptions(); track recipe.slug) {
            <button
              aioBtn
              variant="outline"
              [disabled]="swapping()"
              (click)="swapRecipe(recipe.slug)"
            >
              {{ recipe.title }}، {{ fa(recipe.calories) }} کالری در سهم پایه
            </button>
          }
          @if (
            !recipes.isLoading() && !recipes.error() && !swapOptions().length
          ) {
            <p>غذای جایگزین سازگار موجود نیست.</p>
          }
        </div></ng-template
      >
    </aio-dialog>
    <aio-dialog [(open)]="choosing" title="رژیم غذایی">
      <ng-template aioDialogBody>
        @if (profile.value(); as p) {
          <health-diet-chooser
            [profile]="p"
            [diets]="diets.value() ?? []"
            (saved)="onProfileSaved($event)"
          />
        }
      </ng-template>
    </aio-dialog>

    <aio-dialog
      [(open)]="logging"
      title="ثبت وعده"
      [description]="'امتیاز بر اساس ' + (diet()?.name ?? 'تغذیه متعادل')"
    >
      <ng-template aioDialogBody>
        <health-meal-form
          [date]="today"
          [rules]="diet()?.rules ?? balanced"
          [calorieTarget]="profile.value()?.calorieTarget ?? null"
          (saved)="saveMeal($event)"
        />
      </ng-template>
      <ng-template aioDialogActions>
        <button aioBtn variant="outline" (click)="logging.set(false)">
          انصراف
        </button>
        <button aioBtn type="submit" form="meal-form" [disabled]="saving()">
          ثبت و سنجش
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class NutritionPage {
  private readonly api = inject(HealthApi);
  private readonly confirm = inject(AioConfirm);
  protected readonly today = toIsoDate(new Date());
  protected readonly balanced = BALANCED_RULES;
  protected readonly mealTypeLabels = MEAL_TYPE_LABELS;
  protected readonly scoreClass = scoreClass;
  protected readonly faDate = faDate;
  protected readonly fa = (n: number) => faNumber(n);

  protected readonly profile = httpResource<HealthProfile>(
    () => `${this.api.base}/profile`,
  );
  protected readonly diets = httpResource<Diet[]>(
    () => `${this.api.base}/diets`,
  );
  protected readonly meals = httpResource<MealLog[]>(
    () => `${this.api.base}/meals?date=${this.today}`,
  );
  protected readonly plan = httpResource<MealPlan | null>(
    () => `${this.api.base}/meal-plans/current`,
  );

  protected readonly suggestions = httpResource<{
    suggestions: DietSuggestion[];
  }>(() => `${this.api.base}/diet-suggestions`);
  protected readonly recipes = httpResource<Recipe[]>(() =>
    this.swapOpen() ? `${this.api.base}/recipes` : undefined,
  );
  protected readonly shoppingOpen = signal(false);
  protected readonly shoppingBusy = signal(false);
  protected readonly shoppingItems = signal<ShoppingItem[]>([]);
  protected readonly swapOpen = signal(false);
  protected readonly swapping = signal(false);
  private readonly swapTarget = signal<{
    date: string;
    mealType: MealType;
  } | null>(null);
  protected readonly swapOptions = computed(() =>
    (this.recipes.value() ?? []).filter(
      (r) =>
        r.mealType === this.swapTarget()?.mealType &&
        r.diets.includes(this.plan.value()?.dietSlug ?? '') &&
        recipeAllowed(r, this.profile.value()?.excludedIngredients ?? []),
    ),
  );
  protected openSwap(date: string, mealType: MealType) {
    this.swapTarget.set({ date, mealType });
    this.swapOpen.set(true);
  }
  protected async showShopping() {
    if (this.shoppingBusy()) return;
    this.shoppingBusy.set(true);
    try {
      this.shoppingItems.set(await this.api.shopping());
      this.shoppingOpen.set(true);
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.shoppingBusy.set(false);
    }
  }
  protected async swapRecipe(recipeSlug: string) {
    const target = this.swapTarget();
    if (!target || this.swapping()) return;
    this.swapping.set(true);
    try {
      this.plan.set(await this.api.swapMeal({ ...target, recipeSlug }));
      this.swapOpen.set(false);
      aioToast.success('وعده جایگزین شد');
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.swapping.set(false);
    }
  }

  protected readonly choosing = signal(false);
  protected readonly logging = signal(false);
  protected readonly saving = signal(false);
  protected readonly planning = signal(false);

  /** The diet meals are scored against (same rule as the api). */
  protected readonly diet = computed(() => {
    const p = this.profile.value();
    if (!p || p.dietMode === 'NONE' || !p.dietSlug) return null;
    return this.diets.value()?.find((d) => d.slug === p.dietSlug) ?? null;
  });
  protected readonly modeLabel = computed(
    () => DIET_MODE_LABELS[this.profile.value()?.dietMode ?? 'NONE'],
  );

  protected dayCalories(
    plan: MealPlan,
    meals: { recipeSlug: string; servings?: number }[],
  ): number {
    return meals.reduce(
      (sum, m) =>
        sum + (plan.recipes[m.recipeSlug]?.calories ?? 0) * (m.servings ?? 1),
      0,
    );
  }

  protected onProfileSaved(profile: HealthProfile) {
    this.profile.set(profile);
    this.choosing.set(false);
    if (profile.dietMode === 'APP_PLAN') void this.makePlan();
  }

  protected async saveMeal(input: MealLogInput) {
    this.saving.set(true);
    try {
      const meal = await this.api.logMeal(input);
      this.meals.update((list) => [...(list ?? []), meal]);
      this.logging.set(false);
      aioToast.success(
        `امتیاز این وعده: ${faNumber(meal.score)}`,
        meal.feedback[0],
      );
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async removeMeal(meal: MealLog) {
    if (
      !(await this.confirm.ask({
        title: 'این وعده حذف شود؟',
        description: meal.description,
        confirmText: 'حذف',
        destructive: true,
      }))
    )
      return;
    try {
      await this.api.removeMeal(meal.id);
      this.meals.update((list) => (list ?? []).filter((m) => m.id !== meal.id));
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

  protected async makePlan() {
    this.planning.set(true);
    try {
      this.plan.set(
        await this.api.generatePlan({ startDate: this.today, days: 7 }),
      );
      aioToast.success('برنامه ۷ روزه آماده شد');
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.planning.set(false);
    }
  }
}
