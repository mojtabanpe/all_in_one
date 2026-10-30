import { Component, computed, input, output, signal } from '@angular/core';
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
  type MealLogInput,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  type MealType,
} from '@all-in-one/applets/health/contracts';
import {
  AioBadge,
  AioButton,
  AioFieldDirectives,
  AioFieldError,
  AioIcon,
  AioInput,
  AioToggleGroupDirectives,
  provideIcons,
} from '@all-in-one/ui';
import { faNumber } from '@all-in-one/web/shared';
import { lucideMinus, lucidePlus } from '@ng-icons/lucide';
import { scoreClass } from './health-api';

/** Logs a meal by food-group servings, with a live score from the shared evaluator. */
@Component({
  selector: 'health-meal-form',
  imports: [
    AioBadge,
    AioButton,
    AioFieldDirectives,
    AioFieldError,
    AioIcon,
    AioInput,
    AioToggleGroupDirectives,
    FormField,
    FormRoot,
  ],
  providers: [provideIcons({ lucideMinus, lucidePlus })],
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
      <div aioField>
        <label aioFieldLabel for="meal-desc">چه خوردید؟</label>
        <input
          aioInput
          id="meal-desc"
          placeholder="مثلاً: قزل‌آلا با سالاد و کمی برنج"
          [formField]="mealForm.description"
        />
        @for (e of mealForm.description().errors(); track e.kind) {
          <aio-field-error [validator]="e.kind">{{
            e.message
          }}</aio-field-error>
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
      <div aioField>
        <label aioFieldLabel for="meal-cal">کالری تقریبی (اختیاری)</label>
        <input
          aioInput
          id="meal-cal"
          type="number"
          inputmode="numeric"
          [formField]="mealForm.calories"
        />
      </div>
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
  readonly date = input.required<string>();
  readonly rules = input.required<DietRules>();
  readonly calorieTarget = input<number | null>(null);
  /** Preselected meal (e.g. from a "+" next to lunch); otherwise guessed from the time. */
  readonly mealType = input<MealType | null>(null);
  readonly saved = output<MealLogInput>();

  protected readonly mealTypes = MEAL_TYPES;
  protected readonly mealTypeLabels = MEAL_TYPE_LABELS;
  protected readonly groups = FOOD_GROUPS;
  protected readonly groupLabels = FOOD_GROUP_LABELS;
  protected readonly scoreClass = scoreClass;
  protected readonly fa = (n: number) => faNumber(n);

  protected readonly portions = signal<Partial<Record<FoodGroup, number>>>({});
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

  send() {
    submit(this.mealForm, async () => {
      const m = this.model();
      const portions = Object.fromEntries(
        Object.entries(this.portions()).filter(([, n]) => n && n > 0),
      );
      this.saved.emit({
        date: this.date(),
        mealType: m.mealType,
        description: m.description.trim(),
        portions,
        calories: m.calories || undefined,
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
