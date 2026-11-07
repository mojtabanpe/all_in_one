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
  type PlanMealSuggestion,
  MEAL_TYPE_LABELS,
} from '@all-in-one/applets/health/contracts';
import { toIsoDate, type AiStatus } from '@all-in-one/shared/schemas';
import {
  AioTranslate,
  AioAccordionContent,
  AioAccordionDirectives,
  AioAccordionTrigger,
  AioBadge,
  AioButton,
  AioSkeleton,
  AioCardDirectives,
  AioConfirm,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioIcon,
  AioItemDirectives,
  AioTextarea,
  provideIcons,
  AioFormField,
  AioEmptyState,
  AioCardHeading,
  AioSkeletonLines,
  AioSkeletonRows,
  AioLocale,
  AioNotifications,
  AioDatePipe,
} from '@all-in-one/ui';
import { apiErrorMessage } from '@all-in-one/web/shared';
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
    AioDatePipe,
    AioAccordionContent,
    AioAccordionDirectives,
    AioAccordionTrigger,
    AioBadge,
    AioButton,
    AioSkeleton,
    AioCardDirectives,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioIcon,
    AioItemDirectives,
    AioTextarea,
    DietChooser,
    MealForm,
    RouterLink,
    AioFormField,
    AioEmptyState,
    AioCardHeading,
    AioSkeletonLines,
    AioSkeletonRows,
    AioTranslate,
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
    <div class="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <section aioCard>
        <div aioCardHeader>
          <h2 aioCardTitle>{{ 'رژیم شما' | aioTranslate }}</h2>
          <p aioCardDescription class="min-h-6">
            @if (initialLoading()) {
              <span
                aioSkeleton
                class="block h-5 w-36 rounded-lg"
                aria-hidden="true"
              ></span>
            } @else {
              {{ modeLabel() | aioTranslate }}
            }
          </p>
        </div>
        <div
          aioCardContent
          class="flex min-h-36 flex-wrap items-center justify-between gap-3"
        >
          @if (initialLoading()) {
            <div
              class="flex w-full flex-col gap-3"
              role="status"
              [attr.aria-label]="'در حال دریافت رژیم' | aioTranslate"
              aioSkeletonLines
              [lines]="[
                'h-5 w-2/3 rounded-lg',
                'h-5 w-full rounded-lg',
                'h-11 w-40 rounded-xl',
              ]"
            ></div>
          } @else {
            <div class="text-sm">
              @if (diet(); as d) {
                <span class="font-semibold">{{ d.name | aioTranslate }}</span>
                <span class="text-muted-foreground">
                  {{
                    '، کربوهیدرات {0}٪، پروتئین {1}٪، چربی {2}٪'
                      | aioTranslate
                        : [fa(d.carbsPct), fa(d.proteinPct), fa(d.fatPct)]
                  }}</span
                >
              } @else {
                <span class="text-muted-foreground">{{
                  'وعده‌ها با الگوی تغذیه متعادل سنجیده می‌شوند.' | aioTranslate
                }}</span>
              }
              @if (profile.value()?.calorieTarget; as t) {
                <div class="text-muted-foreground mt-1">
                  {{ 'نیاز روزانه: {0} کالری' | aioTranslate: [fa(t)] }}
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
                (profile.value()?.dietMode === 'NONE'
                  ? 'رژیم خاصی دارید؟'
                  : 'تغییر رژیم'
                ) | aioTranslate
              }}
            </button>
            @if (hasActiveDiet()) {
              <button
                aioBtn
                type="button"
                variant="ghost"
                size="sm"
                [attr.aria-expanded]="browsingDiets()"
                aria-controls="diet-suggestions"
                (click)="browsingDiets.set(!browsingDiets())"
              >
                {{
                  (browsingDiets() ? 'بستن پیشنهادها' : 'بررسی رژیم‌های دیگر')
                    | aioTranslate
                }}
              </button>
            }
          }
        </div>
        <div
          aioCardFooter
          class="text-muted-foreground min-h-16 flex-col items-start gap-1 text-xs"
        >
          @if (initialLoading()) {
            <div
              aioSkeleton
              class="h-4 w-full rounded-lg"
              aria-hidden="true"
            ></div>
            <div
              aioSkeleton
              class="h-4 w-3/4 rounded-lg"
              aria-hidden="true"
            ></div>
          } @else if (diet(); as d) {
            <p>{{ 'بیشتر: {0}' | aioTranslate: [d.encourage.join('، ')] }}</p>
            <p>{{ 'کمتر: {0}' | aioTranslate: [d.limit.join('، ')] }}</p>
          } @else {
            <p>
              {{
                'با انتخاب رژیم، پیشنهادها بر اساس نیازت تنظیم می‌شوند.'
                  | aioTranslate
              }}
            </p>
          }
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">
            {{ 'وعده‌های امروز' | aioTranslate }}
          </h2>
          <button aioBtn size="sm" (click)="logging.set(true)">
            <aio-icon name="lucidePlus" size="sm" />
            {{ 'ثبت وعده' | aioTranslate }}
          </button>
        </div>
        @if (meals.isLoading() && !meals.hasValue()) {
          <div
            aioSkeletonRows
            class="contents"
            [count]="3"
            itemClass="h-24 rounded-2xl"
          ></div>
        } @else if ((meals.value() ?? []).length === 0) {
          <div
            class="glass rounded-3xl"
            aioEmptyState
            [title]="'هنوز وعده‌ای ثبت نشده' | aioTranslate"
            [description]="
              'هر وعده را ثبت کنید تا بر اساس رژیمتان امتیاز و پیشنهاد بگیرید.'
                | aioTranslate
            "
            [level]="3"
            icon="lucideSalad"
            iconClass=""
          ></div>
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
                    [attr.aria-label]="'امتیاز ' + m.score | aioTranslate"
                    >{{ fa(m.score) | aioTranslate }}</span
                  >
                </div>
                <div aioItemContent>
                  <div aioItemTitle>
                    {{ mealTypeLabels[m.mealType] }}: {{ m.description }}
                  </div>
                  @for (line of m.feedback; track line) {
                    <p aioItemDescription>{{ line | aioTranslate }}</p>
                  }
                </div>
                <div aioItemActions>
                  <button
                    aioBtn
                    variant="ghost"
                    size="icon"
                    (click)="removeMeal(m)"
                    [attr.aria-label]="'حذف' | aioTranslate"
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
          <h2 class="text-lg font-semibold">
            {{ 'برنامه غذایی' | aioTranslate }}
          </h2>
          <button
            aioBtn
            variant="outline"
            size="sm"
            [disabled]="planning()"
            (click)="makePlan()"
          >
            <aio-icon name="lucideCalendarDays" size="sm" />
            {{ (plan.value() ? 'چیدن دوباره' : 'برایم بچین') | aioTranslate }}
          </button>
        </div>
        @if (plan.isLoading() && !plan.hasValue()) {
          <div
            aioSkeleton
            class="h-5 w-3/4 rounded-lg"
            aria-hidden="true"
          ></div>
          <div
            aioSkeleton
            class="h-11 w-full rounded-xl"
            aria-hidden="true"
          ></div>
          <div
            aioSkeletonRows
            class="contents"
            [count]="3"
            itemClass="h-16 rounded-2xl"
          ></div>
        } @else if (plan.value(); as p) {
          <p class="text-muted-foreground text-sm">
            {{
              '{0} روز از {1}، هدف {2} کالری در روز'
                | aioTranslate
                  : [
                      fa(p.days.length),
                      p.startDate | aioDate,
                      fa(p.calorieTarget),
                    ]
            }}
          </p>
          <p class="text-muted-foreground text-sm">
            {{
              'مقدار هر غذا نسبت به یک سهم دستور پخت است؛ کالری‌ها برآوردی‌اند.'
                | aioTranslate
            }}
          </p>
          <button
            aioBtn
            variant="outline"
            [disabled]="shoppingBusy()"
            (click)="showShopping()"
          >
            {{
              (shoppingBusy() ? 'در حال دریافت…' : 'فهرست خرید این برنامه')
                | aioTranslate
            }}
          </button>
          <div aioAccordion type="single" class="glass rounded-3xl px-4">
            @for (day of p.days; track day.date) {
              <div aioAccordionItem>
                <aio-accordion-trigger>
                  <span class="min-w-0 flex-1">{{
                    day.date
                      | aioDate
                        : {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                          }
                  }}</span>
                  <bdi
                    class="text-muted-foreground text-xs font-normal"
                    [dir]="locale.direction()"
                    >{{
                      '{0} کالری'
                        | aioTranslate
                          : [
                              locale.number(dayCalories(p, day.meals), {
                                maximumFractionDigits: 0,
                              }),
                            ]
                    }}</bdi
                  >
                </aio-accordion-trigger>
                <aio-accordion-content>
                  <ul class="divide-border flex min-w-0 flex-col divide-y">
                    @for (meal of day.meals; track meal.mealType) {
                      @let r = p.recipes[meal.recipeSlug];
                      <li
                        class="flex min-w-0 flex-col gap-3 py-4 first:pt-0 last:pb-0"
                      >
                        <div
                          class="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                        >
                          <span>{{
                            mealTypeLabels[meal.mealType] | aioTranslate
                          }}</span>
                          <span>{{
                            '{0} سهم' | aioTranslate: [fa(meal.servings ?? 1)]
                          }}</span>
                        </div>
                        <div
                          class="min-w-0 text-sm leading-7 [overflow-wrap:anywhere]"
                        >
                          {{ r.title | aioTranslate }}
                        </div>
                        <div class="grid min-w-0 grid-cols-2 gap-2">
                          <button
                            aioBtn
                            type="button"
                            variant="outline"
                            class="h-11 min-w-0 w-full"
                            [attr.aria-label]="
                              'جایگزین کردن ' + r.title | aioTranslate
                            "
                            (click)="openSwap(day.date, meal.mealType)"
                          >
                            {{ 'جایگزین' | aioTranslate }}
                          </button>
                          <a
                            aioBtn
                            variant="outline"
                            class="h-11 min-w-0 w-full no-underline hover:no-underline"
                            [attr.aria-label]="
                              'دستور پخت ' + r.title | aioTranslate
                            "
                            [routerLink]="['recipes', r.slug]"
                            >{{ 'دستور پخت' | aioTranslate }}</a
                          >
                        </div>
                      </li>
                    }
                  </ul>
                </aio-accordion-content>
              </div>
            }
          </div>
        } @else {
          <p class="text-muted-foreground text-sm">
            {{
              'بر اساس رژیم و نیاز کالری شما، وعده‌های ۷ روز آینده را با دستور پخت می‌چینیم.'
                | aioTranslate
            }}
          </p>
        }
      </section>
      @if (showDietSuggestions()) {
        <section aioCard id="diet-suggestions">
          <div
            aioCardHeading
            [title]="'کدام رژیم به سلیقه شما نزدیک‌تر است؟' | aioTranslate"
            [level]="2"
            [description]="
              'پیشنهادهای اولیه برای مقایسه؛ انتخاب رژیم را خودتان انجام می‌دهید.'
                | aioTranslate
            "
          ></div>
          <div aioCardContent class="flex flex-col gap-3">
            @for (
              suggestion of suggestions.value()?.suggestions ?? [];
              track suggestion.slug
            ) {
              <div>
                <strong>{{ suggestion.name | aioTranslate }}</strong>
                <p class="text-muted-foreground text-sm">
                  {{ suggestion.reason | aioTranslate }}
                </p>
              </div>
            }
            <button aioBtn variant="outline" (click)="choosing.set(true)">
              {{ 'مقایسه و انتخاب رژیم' | aioTranslate }}
            </button>
            <a aioBtn variant="link" routerLink="../profile">{{
              'تنظیم مواد غذایی مستثنا' | aioTranslate
            }}</a>
          </div>
        </section>
      }
    </div>

    <aio-dialog [(open)]="shoppingOpen" [title]="'فهرست خرید' | aioTranslate">
      <ng-template aioDialogBody
        ><div class="flex flex-col gap-3">
          <p class="text-muted-foreground text-sm">
            {{
              'مقدار پایه هر ماده را در تعداد سهم ضرب کنید. واحدهای متفاوت با هم جمع نشده‌اند.'
                | aioTranslate
            }}
          </p>
          @for (item of shoppingItems(); track $index) {
            <p>
              <strong>{{ item.item | aioTranslate }}</strong
              >{{
                ': {0} × {1} سهم'
                  | aioTranslate: [item.amountPerServing, fa(item.servings)]
              }}
            </p>
          }
        </div></ng-template
      >
    </aio-dialog>
    <aio-dialog
      contentClass="applet-health health-calm sm:max-w-lg"
      [(open)]="swapOpen"
      [title]="'جایگزینی وعده' | aioTranslate"
      [description]="
        'فقط غذاهای سازگار با نوع وعده، رژیم برنامه و مواد مستثنا نمایش داده می‌شوند.'
          | aioTranslate
      "
    >
      <ng-template aioDialogBody
        ><div class="flex min-w-0 flex-col gap-5 pb-3">
          <section
            class="flex min-w-0 flex-col gap-3"
            [attr.aria-label]="'پیشنهاد هوش مصنوعی' | aioTranslate"
          >
            <h3 class="text-sm font-semibold">
              {{ 'با هوش مصنوعی انتخاب کن' | aioTranslate }}
            </h3>
            <p class="text-muted-foreground text-sm leading-6">
              {{
                'خواسته‌ات را بنویس تا از غذاهای سازگار پیشنهاد بگیری. جایگزینی با انتخاب خودت انجام می‌شود.'
                  | aioTranslate
              }}
            </p>
            @if (swapAiStatus.isLoading()) {
              <p role="status" class="text-muted-foreground text-sm">
                {{ 'در حال بررسی اتصال هوش مصنوعی…' | aioTranslate }}
              </p>
            } @else if (swapAiStatus.error()) {
              <p class="text-sm">
                {{ 'وضعیت هوش مصنوعی دریافت نشد.' | aioTranslate }}
              </p>
              <button aioBtn variant="outline" (click)="swapAiStatus.reload()">
                {{ 'بررسی دوباره' | aioTranslate }}
              </button>
            } @else if (!swapAiStatus.value()?.chat) {
              <p class="text-muted-foreground text-sm">
                {{
                  'پیشنهاد شخصی با هوش مصنوعی فعلاً در دسترس نیست.'
                    | aioTranslate
                }}
              </p>
            } @else {
              <aio-form-field
                class="min-w-0 gap-2"
                [label]="'چه غذایی دوست داری؟ (اختیاری)' | aioTranslate"
                controlId="swap-preference"
              >
                <textarea
                  aioTextarea
                  id="swap-preference"
                  rows="2"
                  maxlength="500"
                  class="min-w-0 resize-y"
                  [placeholder]="'مثلاً غذای سریع و بدون گوشت' | aioTranslate"
                  [disabled]="aiSuggesting() || swapping()"
                  [value]="swapPreference()"
                  (input)="
                    swapPreference.set($any($event.target).value);
                    aiMealSuggestions.set([])
                  "
                ></textarea>
              </aio-form-field>
              <button
                aioBtn
                type="button"
                class="min-h-11 w-full"
                [disabled]="aiSuggesting() || swapping()"
                (click)="suggestSwap()"
              >
                {{
                  (aiSuggesting()
                    ? 'در حال پیدا کردن پیشنهاد…'
                    : 'پیشنهاد با هوش مصنوعی'
                  ) | aioTranslate
                }}
              </button>
            }
            @if (aiSuggesting()) {
              <p role="status" class="text-muted-foreground text-sm">
                {{
                  'هوش مصنوعی در حال بررسی غذاهای سازگار است…' | aioTranslate
                }}
              </p>
            }
            @if (swapAiError()) {
              <p role="alert" class="text-destructive text-sm">
                {{ swapAiError() | aioTranslate }}
              </p>
            }
            @for (
              suggestion of aiMealSuggestions();
              track suggestion.recipe.slug
            ) {
              <div
                class="flex min-w-0 flex-col gap-2 rounded-2xl border border-border p-4"
              >
                <strong class="text-sm [overflow-wrap:anywhere]">{{
                  suggestion.recipe.title | aioTranslate
                }}</strong>
                <p class="text-muted-foreground text-xs">
                  {{
                    '{0} کالری در سهم پایه'
                      | aioTranslate: [fa(suggestion.recipe.calories)]
                  }}
                </p>
                <p class="text-sm leading-6 [overflow-wrap:anywhere]">
                  {{ suggestion.reason | aioTranslate }}
                </p>
                <button
                  aioBtn
                  variant="outline"
                  class="min-h-11 w-full"
                  [disabled]="swapping()"
                  (click)="swapRecipe(suggestion.recipe.slug)"
                >
                  {{ 'انتخاب این پیشنهاد' | aioTranslate }}
                </button>
              </div>
            }
          </section>
          <section
            class="flex min-w-0 flex-col gap-3 border-t border-border pt-4"
            [attr.aria-label]="'انتخاب از غذاها' | aioTranslate"
          >
            <h3 class="text-sm font-semibold">
              {{ 'یا خودت انتخاب کن' | aioTranslate }}
            </h3>
            @if (recipes.isLoading()) {
              <p role="status">{{ 'در حال دریافت غذاها…' | aioTranslate }}</p>
            }
            @if (recipes.error()) {
              <p role="alert">{{ 'دریافت غذاها ممکن نشد.' | aioTranslate }}</p>
              <button aioBtn variant="outline" (click)="recipes.reload()">
                {{ 'تلاش دوباره' | aioTranslate }}
              </button>
            }
            @for (recipe of swapOptions(); track recipe.slug) {
              <button
                aioBtn
                variant="outline"
                class="h-auto min-h-14 w-full min-w-0 flex-col items-start gap-1 whitespace-normal px-4 py-3 text-start"
                [disabled]="swapping()"
                (click)="swapRecipe(recipe.slug)"
              >
                <span class="text-sm leading-6 [overflow-wrap:anywhere]">{{
                  recipe.title | aioTranslate
                }}</span>
                <span class="text-muted-foreground text-xs">{{
                  '{0} کالری در سهم پایه' | aioTranslate: [fa(recipe.calories)]
                }}</span>
              </button>
            }
            @if (
              !recipes.isLoading() && !recipes.error() && !swapOptions().length
            ) {
              <p>{{ 'غذای جایگزین سازگار موجود نیست.' | aioTranslate }}</p>
            }
          </section>
        </div></ng-template
      >
    </aio-dialog>
    <aio-dialog
      contentClass="applet-health health-calm"
      [(open)]="choosing"
      [title]="'رژیم غذایی' | aioTranslate"
    >
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
      contentClass="applet-health health-calm"
      [(open)]="logging"
      [title]="'ثبت وعده' | aioTranslate"
      [description]="
        'امتیاز بر اساس ' + (diet()?.name ?? 'تغذیه متعادل') | aioTranslate
      "
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
          {{ 'انصراف' | aioTranslate }}
        </button>
        <button aioBtn type="submit" form="meal-form" [disabled]="saving()">
          {{ 'ثبت و سنجش' | aioTranslate }}
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class NutritionPage {
  protected readonly locale = inject(AioLocale);

  private readonly notifications = inject(AioNotifications);

  private readonly api = inject(HealthApi);
  private readonly confirm = inject(AioConfirm);
  protected readonly today = toIsoDate(new Date());
  protected readonly balanced = BALANCED_RULES;
  protected readonly mealTypeLabels = MEAL_TYPE_LABELS;
  protected readonly scoreClass = scoreClass;
  protected readonly fa = (n: number) => this.locale.number(n);

  protected readonly profile = httpResource<HealthProfile>(
    () => `${this.api.base}/profile`,
  );
  protected readonly browsingDiets = signal(false);
  protected readonly initialLoading = computed(
    () =>
      (this.profile.isLoading() && !this.profile.hasValue()) ||
      (this.diets.isLoading() && !this.diets.hasValue()),
  );
  protected readonly hasActiveDiet = computed(() => {
    const mode = this.profile.value()?.dietMode;
    return mode !== undefined && mode !== 'NONE';
  });
  protected readonly showDietSuggestions = computed(
    () =>
      this.profile.hasValue() &&
      (!this.hasActiveDiet() || this.browsingDiets()),
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
  }>(() =>
    this.showDietSuggestions()
      ? `${this.api.base}/diet-suggestions`
      : undefined,
  );
  protected readonly recipes = httpResource<Recipe[]>(() =>
    this.swapOpen() ? `${this.api.base}/recipes` : undefined,
  );
  protected readonly shoppingOpen = signal(false);
  protected readonly shoppingBusy = signal(false);
  protected readonly shoppingItems = signal<ShoppingItem[]>([]);
  protected readonly swapOpen = signal(false);
  protected readonly swapAiStatus = httpResource<AiStatus>(() =>
    this.swapOpen() ? this.api.aiStatusUrl : undefined,
  );
  protected readonly swapPreference = signal('');
  protected readonly aiSuggesting = signal(false);
  protected readonly aiMealSuggestions = signal<PlanMealSuggestion[]>([]);
  protected readonly swapAiError = signal('');
  private swapSuggestionRequest = 0;
  protected readonly swapping = signal(false);
  private readonly swapTarget = signal<{
    date: string;
    mealType: MealType;
  } | null>(null);
  protected readonly swapCurrentSlug = computed(() => {
    const target = this.swapTarget();
    return this.plan
      .value()
      ?.days.find((d) => d.date === target?.date)
      ?.meals.find((m) => m.mealType === target?.mealType)?.recipeSlug;
  });
  protected readonly swapOptions = computed(() =>
    (this.recipes.value() ?? []).filter(
      (r) =>
        r.slug !== this.swapCurrentSlug() &&
        r.mealType === this.swapTarget()?.mealType &&
        r.diets.includes(this.plan.value()?.dietSlug ?? '') &&
        recipeAllowed(r, this.profile.value()?.excludedIngredients ?? []),
    ),
  );
  protected openSwap(date: string, mealType: MealType) {
    this.swapSuggestionRequest++;
    this.aiSuggesting.set(false);
    this.aiMealSuggestions.set([]);
    this.swapAiError.set('');
    this.swapPreference.set('');
    this.swapTarget.set({ date, mealType });
    this.swapOpen.set(true);
  }
  protected async suggestSwap() {
    const target = this.swapTarget();
    if (
      !target ||
      this.aiSuggesting() ||
      this.swapping() ||
      !this.swapAiStatus.value()?.chat
    )
      return;
    const request = ++this.swapSuggestionRequest;
    this.aiSuggesting.set(true);
    this.swapAiError.set('');
    this.aiMealSuggestions.set([]);
    try {
      const suggestions = await this.api.suggestPlanMeal({
        ...target,
        preference: this.swapPreference().trim(),
      });
      if (request === this.swapSuggestionRequest && this.swapOpen())
        this.aiMealSuggestions.set(suggestions);
    } catch (error) {
      if (request === this.swapSuggestionRequest && this.swapOpen())
        this.swapAiError.set(apiErrorMessage(error));
    } finally {
      if (request === this.swapSuggestionRequest) this.aiSuggesting.set(false);
    }
  }
  protected async showShopping() {
    if (this.shoppingBusy()) return;
    this.shoppingBusy.set(true);
    try {
      this.shoppingItems.set(await this.api.shopping());
      this.shoppingOpen.set(true);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
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
      this.notifications.success('وعده جایگزین شد');
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
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
    this.browsingDiets.set(false);
    this.choosing.set(false);
    if (profile.dietMode === 'APP_PLAN') void this.makePlan();
  }

  protected async saveMeal(input: MealLogInput) {
    this.saving.set(true);
    try {
      const meal = await this.api.logMeal(input);
      this.meals.update((list) => [...(list ?? []), meal]);
      this.logging.set(false);
      this.notifications.success(
        `امتیاز این وعده: ${this.locale.number(meal.score)}`,
        meal.feedback[0],
      );
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
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
      this.notifications.error(apiErrorMessage(error));
    }
  }

  protected async makePlan() {
    this.planning.set(true);
    try {
      this.plan.set(
        await this.api.generatePlan({ startDate: this.today, days: 7 }),
      );
      this.notifications.success('برنامه ۷ روزه آماده شد');
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.planning.set(false);
    }
  }
}
