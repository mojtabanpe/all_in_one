import { httpResource } from '@angular/common/http';
import { Component, effect, inject, signal } from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  max,
  min,
  submit,
} from '@angular/forms/signals';
import {
  ACTIVITY_LEVEL_LABELS,
  ACTIVITY_LEVELS,
  type ActivityLevel,
  HEALTH_GOAL_LABELS,
  HEALTH_GOALS,
  type HealthGoal,
  type HealthProfile,
} from '@all-in-one/applets/health/contracts';
import {
  AioButton,
  AioCardDirectives,
  AioFieldDirectives,
  AioFieldError,
  AioInput,
  AioNativeSelect,
  AioNativeSelectOption,
  aioToast,
  AioToggleGroupDirectives,
} from '@all-in-one/ui';
import { apiErrorMessage, faNumber } from '@all-in-one/web/shared';
import { HealthApi } from './health-api';

@Component({
  selector: 'health-profile-page',
  imports: [
    AioButton,
    AioCardDirectives,
    AioFieldDirectives,
    AioFieldError,
    AioInput,
    AioNativeSelect,
    AioNativeSelectOption,
    AioToggleGroupDirectives,
    FormField,
    FormRoot,
  ],
  template: `
    <section aioCard>
      <div aioCardHeader>
        <h2 aioCardTitle>مشخصات بدنی و هدف</h2>
        <p aioCardDescription>
          برای محاسبه کالری روزانه (فرمول Mifflin-St Jeor) و برآورد کالری ورزش.
        </p>
      </div>
      <form
        aioCardContent
        class="flex flex-col gap-4"
        [formRoot]="profileForm"
        (submit)="$event.preventDefault(); save()"
      >
        <div aioField>
          <span aioFieldLabel>جنسیت</span>
          <div
            aioToggleGroup
            type="single"
            variant="outline"
            [value]="model().sex"
            (valueChange)="set('sex', $event)"
          >
            <button
              aioToggleGroupItem
              type="button"
              value="FEMALE"
              class="flex-1"
            >
              زن
            </button>
            <button
              aioToggleGroupItem
              type="button"
              value="MALE"
              class="flex-1"
            >
              مرد
            </button>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div aioField>
            <label aioFieldLabel for="birthYear">سال تولد (میلادی)</label>
            <input
              aioInput
              id="birthYear"
              type="number"
              inputmode="numeric"
              [formField]="profileForm.birthYear"
            />
            @for (e of profileForm.birthYear().errors(); track e.kind) {
              <aio-field-error [validator]="e.kind">{{
                e.message
              }}</aio-field-error>
            }
          </div>
          <div aioField>
            <label aioFieldLabel for="height">قد (سانتی‌متر)</label>
            <input
              aioInput
              id="height"
              type="number"
              inputmode="numeric"
              [formField]="profileForm.heightCm"
            />
            @for (e of profileForm.heightCm().errors(); track e.kind) {
              <aio-field-error [validator]="e.kind">{{
                e.message
              }}</aio-field-error>
            }
          </div>
          <div aioField>
            <label aioFieldLabel for="weight">وزن (کیلوگرم)</label>
            <input
              aioInput
              id="weight"
              type="number"
              inputmode="decimal"
              step="0.1"
              [formField]="profileForm.weightKg"
            />
            @for (e of profileForm.weightKg().errors(); track e.kind) {
              <aio-field-error [validator]="e.kind">{{
                e.message
              }}</aio-field-error>
            }
          </div>
        </div>
        <div aioField>
          <label aioFieldLabel for="activity">میزان تحرک</label>
          <aio-native-select
            selectId="activity"
            [value]="model().activityLevel"
            (valueChange)="set('activityLevel', $event)"
          >
            @for (level of activityLevels; track level) {
              <option aioNativeSelectOption [value]="level">
                {{ activityLabels[level] }}
              </option>
            }
          </aio-native-select>
        </div>
        <div aioField>
          <span aioFieldLabel>هدف</span>
          <div
            aioToggleGroup
            type="single"
            variant="outline"
            [value]="model().goal"
            (valueChange)="set('goal', $event)"
          >
            @for (goal of goals; track goal) {
              <button
                aioToggleGroupItem
                type="button"
                [value]="goal"
                class="flex-1"
              >
                {{ goalLabels[goal] }}
              </button>
            }
          </div>
        </div>
        <div class="flex items-center justify-between gap-3">
          @if (profile.value()?.calorieTarget; as target) {
            <p class="text-sm">
              نیاز روزانه: <strong>{{ fa(target) }} کالری</strong>
            </p>
          } @else {
            <span></span>
          }
          <button aioBtn type="submit" [disabled]="saving()">ذخیره</button>
        </div>
      </form>
    </section>
  `,
})
export class ProfilePage {
  private readonly api = inject(HealthApi);
  protected readonly activityLevels = ACTIVITY_LEVELS;
  protected readonly activityLabels = ACTIVITY_LEVEL_LABELS;
  protected readonly goals = HEALTH_GOALS;
  protected readonly goalLabels = HEALTH_GOAL_LABELS;
  protected readonly fa = (n: number) => faNumber(n);
  protected readonly saving = signal(false);

  protected readonly profile = httpResource<HealthProfile>(
    () => `${this.api.base}/profile`,
  );
  // 0 / '' mean "not set" (Signal Forms models avoid null).
  protected readonly model = signal({
    sex: '' as '' | 'FEMALE' | 'MALE',
    birthYear: 0,
    heightCm: 0,
    weightKg: 0,
    activityLevel: 'LIGHT' as ActivityLevel,
    goal: 'MAINTAIN' as HealthGoal,
  });
  protected readonly profileForm = form(this.model, (path) => {
    min(path.birthYear, 1920, {
      message: 'سال را میلادی وارد کنید (مثلاً ۱۹۹۴).',
      when: ({ value }) => value() !== 0,
    });
    max(path.birthYear, 2020);
    min(path.heightCm, 100, {
      message: 'بین ۱۰۰ تا ۲۵۰',
      when: ({ value }) => value() !== 0,
    });
    max(path.heightCm, 250, { message: 'بین ۱۰۰ تا ۲۵۰' });
    min(path.weightKg, 30, {
      message: 'بین ۳۰ تا ۳۰۰',
      when: ({ value }) => value() !== 0,
    });
    max(path.weightKg, 300, { message: 'بین ۳۰ تا ۳۰۰' });
  });

  constructor() {
    effect(() => {
      const p = this.profile.value();
      if (!p) return;
      this.model.set({
        sex: p.sex ?? '',
        birthYear: p.birthYear ?? 0,
        heightCm: p.heightCm ?? 0,
        weightKg: p.weightKg ?? 0,
        activityLevel: p.activityLevel,
        goal: p.goal,
      });
    });
  }

  protected set(key: 'sex' | 'activityLevel' | 'goal', value: unknown) {
    if (typeof value === 'string')
      this.model.update((m) => ({ ...m, [key]: value }));
  }

  protected save() {
    submit(this.profileForm, async () => {
      this.saving.set(true);
      const m = this.model();
      try {
        const saved = await this.api.saveProfile({
          sex: m.sex || null,
          birthYear: m.birthYear || null,
          heightCm: m.heightCm || null,
          weightKg: m.weightKg || null,
          activityLevel: m.activityLevel,
          goal: m.goal,
        });
        this.profile.set(saved);
        aioToast.success(
          'ذخیره شد',
          saved.calorieTarget
            ? `نیاز روزانه: ${faNumber(saved.calorieTarget)} کالری`
            : undefined,
        );
      } catch (error) {
        aioToast.error(apiErrorMessage(error));
      } finally {
        this.saving.set(false);
      }
    });
  }
}
