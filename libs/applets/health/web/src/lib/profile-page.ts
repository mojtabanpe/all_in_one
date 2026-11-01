import { persianBirthYear, gregorianBirthYear } from './birth-year';
import { httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
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
  AioDialog,
  AioDialogBody,
  AioIcon,
  provideIcons,
  AioButton,
  AioSkeleton,
  AioCardDirectives,
  AioFieldDirectives,
  AioInput,
  aioToast,
  AioToggleGroupDirectives,
  AioFormField,
  AioCardHeading,
  AioNumberField,
  AioSelectField,
} from '@all-in-one/ui';
import { apiErrorMessage, faNumber } from '@all-in-one/web/shared';
import { HealthApi } from './health-api';
import {
  lucideUserRound,
  lucideRuler,
  lucideScale,
  lucideFlag,
  lucideActivity,
  lucideChevronLeft,
  lucideApple,
} from '@ng-icons/lucide';

@Component({
  selector: 'health-profile-page',
  imports: [
    AioDialog,
    AioDialogBody,
    AioIcon,
    AioButton,
    AioSkeleton,
    AioCardDirectives,
    AioFieldDirectives,
    AioInput,
    AioToggleGroupDirectives,
    FormField,
    FormRoot,
    AioFormField,
    AioCardHeading,
    AioNumberField,
    AioSelectField,
  ],
  providers: [
    provideIcons({
      lucideUserRound,
      lucideRuler,
      lucideScale,
      lucideFlag,
      lucideActivity,
      lucideChevronLeft,
      lucideApple,
    }),
  ],
  template: `
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-5">
      @if (profile.isLoading()) {
        <p role="status" class="sr-only">در حال دریافت مشخصات…</p>
      }
      @if (profile.error()) {
        <p role="alert">مشخصات دریافت نشد.</p>
        <button aioBtn variant="outline" (click)="profile.reload()">
          تلاش دوباره
        </button>
      }
      <section aioCard>
        <div
          aioCardHeading
          title="هر تغییر کوچک، از همین‌جا."
          [level]="2"
          description="برنامه، بر اساس خودت"
        ></div>
        <div aioCardContent>
          <p class="health-metric-label">
            مشخصات و هدفت را به‌روز نگه دار تا برآوردهای برنامه به تو نزدیک‌تر
            باشند.
          </p>
        </div>
      </section>
      @for (group of settingGroups(); track group.title) {
        <section aioCard>
          <div
            aioCardHeading
            [title]="group.title"
            [level]="2"
            titleClass="health-section-heading"
          ></div>
          <div aioCardContent>
            @for (row of group.rows; track row.label) {
              <button
                aioBtn
                variant="ghost"
                class="health-settings-row"
                [disabled]="!profile.hasValue()"
                (click)="editing.set(true)"
              >
                <aio-icon [name]="row.icon" [style.color]="row.color" /><span
                  class="min-w-0 flex-1 text-start"
                  >{{ row.label }}</span
                ><span
                  class="health-metric-label max-w-[45%] whitespace-normal text-end"
                >
                  @if (profile.isLoading() && !profile.hasValue()) {
                    <span
                      aioSkeleton
                      class="inline-block h-5 w-20 rounded-lg align-middle"
                      aria-hidden="true"
                    ></span>
                  } @else {
                    {{ row.value }}
                  }</span
                ><aio-icon
                  name="lucideChevronLeft"
                  size="sm"
                  class="text-muted-foreground"
                />
              </button>
            }
          </div>
        </section>
      }
    </div>
    <aio-dialog
      [(open)]="editing"
      title="ویرایش مشخصات و هدف"
      contentClass="applet-health health-calm"
    >
      <ng-template aioDialogBody>
        <form
          class="flex flex-col gap-4"
          [formRoot]="profileForm"
          (submit)="$event.preventDefault(); save()"
        >
          <aio-form-field label="جنسیت">
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
          </aio-form-field>
          <div class="grid grid-cols-3 gap-3">
            <aio-number-field
              label="سال تولد (شمسی)"
              controlId="birthYear"
              [field]="profileForm.birthYear"
              inputMode="numeric"
              [showErrors]="true"
            />
            <aio-number-field
              label="قد (سانتی‌متر)"
              controlId="height"
              [field]="profileForm.heightCm"
              inputMode="numeric"
              [showErrors]="true"
            />
            <aio-number-field
              label="وزن (کیلوگرم)"
              controlId="weight"
              [field]="profileForm.weightKg"
              inputMode="decimal"
              step="0.1"
              [showErrors]="true"
            />
          </div>
          <aio-select-field
            label="میزان تحرک"
            controlId="activity"
            [value]="model().activityLevel"
            [options]="activityLevels"
            [optionLabels]="activityLabels"
            (valueChange)="set('activityLevel', $event)"
          />
          <aio-form-field label="هدف">
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
          </aio-form-field>
          <aio-form-field
            label="مواد غذایی که نمی‌خواهید در برنامه باشند"
            controlId="excluded-foods"
          >
            <input
              aioInput
              id="excluded-foods"
              [formField]="profileForm.excludedIngredients"
              placeholder="مثلاً: گردو، شیر"
            />
            <p aioFieldDescription>
              با ویرگول جدا کنید. این فیلتر نام مواد است؛ ترکیبات جایگزین یا
              آلودگی متقاطع را تشخیص نمی‌دهد.
            </p>
          </aio-form-field>
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
      </ng-template>
    </aio-dialog>
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
  protected readonly editing = signal(false);
  protected readonly settingGroups = computed(() => {
    const p = this.profile.value();
    const value = (n: number | null | undefined, unit = '') =>
      n == null ? 'تکمیل نشده' : `${faNumber(n)} ${unit}`;
    return [
      {
        title: 'بدن من',
        rows: [
          {
            label: 'جنسیت',
            value:
              p?.sex === 'MALE'
                ? 'مرد'
                : p?.sex === 'FEMALE'
                  ? 'زن'
                  : 'تکمیل نشده',
            icon: 'lucideUserRound',
            color: 'var(--health-blue)',
          },
          {
            label: 'سال تولد',
            value: p?.birthYear
              ? `${faNumber(persianBirthYear(p.birthYear), { useGrouping: false })} شمسی`
              : 'تکمیل نشده',
            icon: 'lucideUserRound',
            color: 'var(--health-orange)',
          },
          {
            label: 'قد',
            value: value(p?.heightCm, 'سانتی‌متر'),
            icon: 'lucideRuler',
            color: 'var(--health-green)',
          },
          {
            label: 'وزن فعلی',
            value: value(p?.weightKg, 'کیلوگرم'),
            icon: 'lucideScale',
            color: 'var(--health-purple)',
          },
        ],
      },
      {
        title: 'مسیر من',
        rows: [
          {
            label: 'هدف اصلی',
            value: p ? HEALTH_GOAL_LABELS[p.goal] : 'تکمیل نشده',
            icon: 'lucideFlag',
            color: 'var(--health-blue)',
          },
          {
            label: 'میزان تحرک',
            value: p ? ACTIVITY_LEVEL_LABELS[p.activityLevel] : 'تکمیل نشده',
            icon: 'lucideActivity',
            color: 'var(--health-green)',
          },
          {
            label: 'هدف کالری روزانه',
            value: value(p?.calorieTarget, 'کالری'),
            icon: 'lucideApple',
            color: 'var(--health-orange)',
          },
        ],
      },
      {
        title: 'انتخاب‌های غذایی من',
        rows: [
          {
            label: 'مواد غذایی مستثنا',
            value: p
              ? (p.excludedIngredients ?? []).join('، ') ||
                'بدون محدودیت ثبت‌شده'
              : 'تکمیل نشده',
            icon: 'lucideApple',
            color: 'var(--health-purple)',
          },
        ],
      },
    ];
  });

  protected readonly profile = httpResource<HealthProfile>(
    () => `${this.api.base}/profile`,
  );
  // 0 / '' mean "not set" (Signal Forms models avoid null).
  protected readonly model = signal({
    excludedIngredients: '',
    sex: '' as '' | 'FEMALE' | 'MALE',
    birthYear: 0,
    heightCm: 0,
    weightKg: 0,
    activityLevel: 'LIGHT' as ActivityLevel,
    goal: 'MAINTAIN' as HealthGoal,
  });
  protected readonly profileForm = form(this.model, (path) => {
    min(path.birthYear, 1299, {
      message: 'سال را شمسی وارد کنید (مثلاً ۱۳۷۳).',
      when: ({ value }) => value() !== 0,
    });
    max(path.birthYear, 1399, {
      message: 'سال تولد باید بین ۱۲۹۹ و ۱۳۹۹ باشد.',
    });
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
        excludedIngredients: (p.excludedIngredients ?? []).join('، '),
        sex: p.sex ?? '',
        birthYear: persianBirthYear(p.birthYear),
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
          excludedIngredients: m.excludedIngredients
            .split(/[,،]/)
            .map((s) => s.trim())
            .filter(Boolean),
          sex: m.sex || null,
          birthYear: gregorianBirthYear(m.birthYear),
          heightCm: m.heightCm || null,
          weightKg: m.weightKg || null,
          activityLevel: m.activityLevel,
          goal: m.goal,
        });
        this.profile.set(saved);
        this.editing.set(false);
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
