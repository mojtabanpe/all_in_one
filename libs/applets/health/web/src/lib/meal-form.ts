import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  required,
  submit,
} from '@angular/forms/signals';
import {
  type DietRules,
  evaluateMeal,
  FOOD_GROUP_LABELS,
  FOOD_GROUPS,
  type FoodGroup,
  type MealEstimate,
  type Recipe,
  type MealLogInput,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  type MealType,
} from '@all-in-one/applets/health/contracts';
import {
  AioBadge,
  AioButton,
  AioIcon,
  AioInput,
  aioToast,
  AioToggleGroupDirectives,
  provideIcons,
  AioFormField,
  AioFormErrors,
  AioAsyncButton,
  AioNumberField,
} from '@all-in-one/ui';
import { apiErrorMessage, faNumber } from '@all-in-one/web/shared';
import { lucideMinus, lucidePlus, lucideSparkles } from '@ng-icons/lucide';
import { HealthApi, scoreClass } from './health-api';

/** Logs a meal by food-group servings, with a live score from the shared evaluator. */
@Component({
  selector: 'health-meal-form',
  imports: [
    AioBadge,
    AioButton,
    AioIcon,
    AioInput,
    AioToggleGroupDirectives,
    FormField,
    FormRoot,
    AioFormField,
    AioFormErrors,
    AioAsyncButton,
    AioNumberField,
  ],
  providers: [provideIcons({ lucideMinus, lucidePlus, lucideSparkles })],
  template: `
    <form
      id="meal-form"
      class="flex flex-col gap-4"
      [formRoot]="mealForm"
      (submit)="$event.preventDefault(); send()"
    >
      <div
        aioToggleGroup
        type="single"
        variant="outline"
        class="w-full"
        [value]="model().mealType"
        (valueChange)="setMealType($event)"
      >
        @for (t of mealTypes; track t) {
          <button aioToggleGroupItem type="button" [value]="t" class="flex-1">
            {{ mealTypeLabels[t] }}
          </button>
        }
      </div>
      <aio-form-field label="چه خوردید؟" controlId="meal-desc">
        <input
          aioInput
          id="meal-desc"
          placeholder="مثلاً: قزل‌آلا با سالاد و کمی برنج"
          [formField]="mealForm.description"
        />
        <aio-form-errors [errors]="mealForm.description().errors()" />
      </aio-form-field>
      <div class="-mt-2 flex flex-col gap-1">
        <button
          type="button"
          variant="outline"
          size="sm"
          class="self-start"
          [disabled]="estimating() || model().description.trim().length < 2"
          (click)="estimate()"
          aioAsyncButton
          [busy]="estimating()"
          label="تخمین کالری و گروه‌ها با هوش مصنوعی"
          icon="lucideSparkles"
          iconSize="xs"
        ></button>
        @if (macros(); as m) {
          <p class="text-muted-foreground text-xs" aria-live="polite">
            پروتئین {{ fa(m.proteinG) }}، کربوهیدرات {{ fa(m.carbsG) }}، چربی
            {{ fa(m.fatG) }} گرم
            @if (m.note) {
              ، {{ m.note }}
            }
          </p>
        }
      </div>
      <fieldset class="flex flex-col gap-1">
        <legend class="mb-1 text-sm font-medium">چند واحد از هر گروه؟</legend>
        @for (g of groups; track g) {
          <div
            class="flex items-center justify-between gap-2 rounded-xl px-1 py-1"
          >
            <div class="min-w-0">
              <div class="text-sm">{{ groupLabels[g].label }}</div>
              <div class="text-muted-foreground truncate text-xs">
                {{ groupLabels[g].hint }}
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button
                aioBtn
                type="button"
                variant="outline"
                size="icon-sm"
                (click)="step(g, -1)"
                [disabled]="!portions()[g]"
                [attr.aria-label]="'کم کردن ' + groupLabels[g].label"
              >
                <aio-icon name="lucideMinus" size="xs" />
              </button>
              <span class="w-6 text-center tabular-nums" aria-live="polite">{{
                fa(portions()[g] ?? 0)
              }}</span>
              <button
                aioBtn
                type="button"
                variant="outline"
                size="icon-sm"
                (click)="step(g, 1)"
                [attr.aria-label]="'افزودن ' + groupLabels[g].label"
              >
                <aio-icon name="lucidePlus" size="xs" />
              </button>
            </div>
          </div>
        }
      </fieldset>
      <aio-number-field
        label="کالری تقریبی (اختیاری)"
        controlId="meal-cal"
        [field]="mealForm.calories"
        inputMode="numeric"
      />
      <div
        class="glass flex flex-col gap-1.5 rounded-2xl p-3"
        aria-live="polite"
      >
        <div class="flex items-center gap-2 text-sm font-medium">
          پیش‌نمایش امتیاز
          <span aioBadge [class]="scoreClass(preview().score)">{{
            fa(preview().score)
          }}</span>
        </div>
        @for (line of preview().feedback; track line) {
          <p class="text-muted-foreground text-xs">{{ line }}</p>
        }
      </div>
    </form>
  `,
})
export class MealForm {
  readonly initialRecipe = input<Recipe | null>(null);
  readonly date = input.required<string>();
  readonly rules = input.required<DietRules>();
  readonly calorieTarget = input<number | null>(null);
  /** Preselected meal (e.g. from a "+" next to lunch); otherwise guessed from the time. */
  readonly mealType = input<MealType | null>(null);
  readonly saved = output<MealLogInput>();
  private readonly api = inject(HealthApi);

  protected readonly mealTypes = MEAL_TYPES;
  protected readonly mealTypeLabels = MEAL_TYPE_LABELS;
  protected readonly groups = FOOD_GROUPS;
  protected readonly groupLabels = FOOD_GROUP_LABELS;
  protected readonly scoreClass = scoreClass;
  protected readonly fa = (n: number) => faNumber(n);

  protected readonly portions = signal<Partial<Record<FoodGroup, number>>>({});
  protected readonly estimating = signal(false);
  /** Macros from the last AI estimate, saved with the meal. */
  protected readonly macros = signal<MealEstimate | null>(null);
  protected readonly model = signal({
    mealType: defaultMealType(),
    description: '',
    calories: 0,
  });
  protected readonly mealForm = form(this.model, (path) => {
    required(path.description, { message: 'بنویسید چه خوردید.' });
  });
  protected readonly preview = computed(() =>
    evaluateMeal(
      {
        mealType: this.model().mealType,
        portions: this.portions(),
        calories: this.model().calories || null,
      },
      this.rules(),
      this.calorieTarget(),
    ),
  );

  constructor() {
    queueMicrotask(() => {
      const recipe = this.initialRecipe();
      if (recipe) {
        this.model.update((m) => ({
          ...m,
          description: recipe.title,
          calories: recipe.calories,
        }));
        this.macros.set({
          calories: recipe.calories,
          proteinG: recipe.proteinG,
          carbsG: recipe.carbsG,
          fatG: recipe.fatG,
          portions: {},
          note: 'بر اساس دستور پخت انتخاب‌شده',
        });
      }
      const preset = this.mealType();
      if (preset) this.model.update((m) => ({ ...m, mealType: preset }));
    });
  }

  protected setMealType(value: unknown) {
    if (typeof value === 'string')
      this.model.update((m) => ({ ...m, mealType: value as MealType }));
  }

  protected step(group: FoodGroup, delta: number) {
    this.portions.update((p) => ({
      ...p,
      [group]: Math.min(10, Math.max(0, (p[group] ?? 0) + delta)),
    }));
  }

  /** Fills calories and food groups from the user's AI (they stay editable). */
  protected async estimate() {
    this.estimating.set(true);
    try {
      const e = await this.api.estimateMeal(this.model().description.trim());
      this.portions.set(e.portions);
      this.model.update((m) => ({ ...m, calories: e.calories }));
      this.macros.set(e);
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.estimating.set(false);
    }
  }

  send() {
    submit(this.mealForm, async () => {
      const m = this.model();
      const portions = Object.fromEntries(
        Object.entries(this.portions()).filter(([, n]) => n && n > 0),
      );
      this.saved.emit({
        date: this.date(),
        ...(this.initialRecipe()?.title === m.description.trim()
          ? { recipeSlug: this.initialRecipe()?.slug }
          : {}),
        mealType: m.mealType,
        description: m.description.trim(),
        portions,
        calories: m.calories || undefined,
        ...(this.macros()
          ? {
              proteinG: this.macros()?.proteinG,
              carbsG: this.macros()?.carbsG,
              fatG: this.macros()?.fatG,
            }
          : {}),
      });
    });
  }
}

/** Guess the meal from the time of day. */
function defaultMealType(): MealType {
  const hour = new Date().getHours();
  if (hour < 11) return 'BREAKFAST';
  if (hour < 16) return 'LUNCH';
  if (hour < 19) return 'SNACK';
  return 'DINNER';
}
