import { httpResource } from '@angular/common/http';
import { Component, computed, inject, output, signal } from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  max,
  min,
  required,
  submit,
} from '@angular/forms/signals';
import {
  type WeightPace,
  weightPlan,
  type WeightProgress,
} from '@all-in-one/applets/health/contracts';
import { addDays, toIsoDate } from '@all-in-one/shared/schemas';
import {
  AioButton,
  AioDateInput,
  AioConfirm,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioFieldDirectives,
  AioFieldError,
  AioIcon,
  AioInput,
  AioProgressDirectives,
  AioSkeleton,
  aioToast,
  AioToggleGroupDirectives,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage, faDate, faNumber } from '@all-in-one/web/shared';
import { lucideScale, lucideTrash2 } from '@ng-icons/lucide';
import { HealthApi } from './health-api';

const PACE_LABELS: Record<WeightPace, string> = {
  safe: 'سرعت مناسب',
  fast: 'پرتلاش ولی شدنی',
  'too-fast': 'خیلی سریع',
  done: 'به هدف رسیدی',
  overdue: 'تاریخ هدف گذشته',
};
const MONTHS = [1, 2, 3, 6] as const;

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toIsoDate(new Date(y, m - 1 + months, d));
}

/** Weight goal: current weight, target by a date, and the pace it asks for. */
@Component({
  selector: 'health-weight-card',
  host: { class: 'flex min-w-0' },
  imports: [
    AioButton,
    AioDateInput,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioFieldDirectives,
    AioFieldError,
    AioIcon,
    AioInput,
    AioProgressDirectives,
    AioSkeleton,
    AioToggleGroupDirectives,
    FormField,
    FormRoot,
  ],
  providers: [provideIcons({ lucideScale, lucideTrash2 })],
  template: `
    <section
      class="health-metric health-body-card flex-1"
      aria-labelledby="weight-title"
    >
      <div class="flex items-center justify-between gap-2">
        <h2 id="weight-title" class="health-metric-label">
          {{ goalSet() ? 'هدف وزن' : 'وزن' }}
        </h2>
        <span class="health-icon-disc text-[var(--health-purple)]"
          ><aio-icon name="lucideScale" size="sm"
        /></span>
      </div>
      @if (weight.isLoading() && !weight.hasValue()) {
        <div
          aioSkeleton
          class="h-24 rounded-2xl"
          aria-label="در حال دریافت"
        ></div>
      } @else if (weight.error()) {
        <p class="health-metric-label">وزن دریافت نشد.</p>
        <button aioBtn variant="link" (click)="weight.reload()">
          تلاش دوباره
        </button>
      } @else if (weight.value(); as w) {
        @if (w.currentKg === null) {
          <div class="flex flex-col gap-1">
            <p class="text-lg font-semibold">الان چند کیلویی؟</p>
            <p class="health-metric-label">
              وزنت را ثبت کن و بعد هدفت را بگذار؛ مثلاً ۸۵ کیلو تا دو ماه دیگر.
            </p>
          </div>
          <button aioBtn class="health-primary-action" (click)="openWeigh()">
            ثبت وزن
          </button>
        } @else {
          <div class="flex flex-col gap-1">
            <p class="health-number">
              {{ kg(w.currentKg) }}
              <span class="text-base font-normal">کیلوگرم</span>
            </p>
            <p class="health-metric-label">
              @if (w.targetKg !== null && w.targetDate) {
                هدف {{ kg(w.targetKg) }} کیلوگرم تا
                {{ dateLabel(w.targetDate) }}
              } @else if (w.entries[0]; as last) {
                وزن فعلی، ثبت‌شده در {{ dateLabel(last.date) }}
              }
            </p>
          </div>
          @if (w.plan; as plan) {
            <div
              aioProgress
              [value]="plan.progressPct"
              [attr.aria-label]="
                'پیشرفت تا هدف وزن: ' + fa(plan.progressPct) + ' درصد'
              "
            >
              <div aioProgressIndicator></div>
            </div>
            <p class="text-sm leading-7">
              @switch (plan.pace) {
                @case ('done') {
                  <strong>به هدفت رسیدی.</strong>
                  حالا می‌توانی هدف تازه‌ای بگذاری.
                }
                @case ('overdue') {
                  {{ kg(Math.abs(plan.remainingKg)) }} کیلوگرم مانده و تاریخ هدف
                  گذشته؛ تاریخ تازه‌ای بگذار.
                }
                @default {
                  {{ kg(Math.abs(plan.remainingKg)) }} کیلوگرم در
                  {{ fa(plan.daysLeft) }} روز؛ هفته‌ای
                  {{ kg(Math.abs(plan.weeklyKg)) }} کیلوگرم.
                }
              }
            </p>
            <span class="health-pace" [attr.data-pace]="plan.pace">{{
              paceLabels[plan.pace]
            }}</span>
          }
          <div class="flex flex-wrap gap-2">
            <button
              aioBtn
              class="health-primary-action flex-1"
              (click)="openWeigh()"
            >
              ثبت وزن امروز
            </button>
            <button
              aioBtn
              variant="ghost"
              class="health-soft-action"
              (click)="openGoal()"
            >
              {{ goalSet() ? 'ویرایش هدف' : 'تعیین هدف' }}
            </button>
          </div>
        }
      }
    </section>

    <aio-dialog
      [(open)]="weighOpen"
      title="ثبت وزن"
      description="هر روز یک وزن؛ ثبت دوباره، وزن همان روز را عوض می‌کند."
      contentClass="applet-health health-calm"
    >
      <ng-template aioDialogBody>
        <form
          id="weigh-form"
          class="flex flex-col gap-4"
          [formRoot]="weighForm"
          (submit)="$event.preventDefault(); saveWeight()"
        >
          <div class="grid grid-cols-2 gap-3">
            <div aioField>
              <label aioFieldLabel for="weigh-kg">وزن (کیلوگرم)</label>
              <input
                aioInput
                id="weigh-kg"
                type="number"
                inputmode="decimal"
                step="0.1"
                [formField]="weighForm.weightKg"
              />
              @for (e of weighForm.weightKg().errors(); track e.kind) {
                <aio-field-error [validator]="e.kind">{{
                  e.message
                }}</aio-field-error>
              }
            </div>
            <div aioField>
              <label aioFieldLabel for="weigh-date">روز</label>
              <aio-date-input
                contentClass="applet-health"
                inputId="weigh-date"
                [maxDate]="today"
                [formField]="weighForm.date"
              />
              <p aioFieldDescription>{{ dateLabel(weighModel().date) }}</p>
            </div>
          </div>
        </form>
        @if (weight.value()?.entries?.length) {
          <h3 class="mt-6 mb-2 font-semibold">وزن‌های اخیر</h3>
          <ul class="flex flex-col">
            @for (
              entry of weight.value()!.entries.slice(0, 10);
              track entry.id
            ) {
              <li
                class="flex items-center gap-3 border-b border-border py-2 last:border-0"
              >
                <span class="flex-1 text-sm">{{ dateLabel(entry.date) }}</span>
                <strong class="text-sm tabular-nums"
                  >{{ kg(entry.weightKg) }} کیلوگرم</strong
                >
                <button
                  aioBtn
                  variant="ghost"
                  size="icon"
                  class="size-11 shrink-0"
                  [attr.aria-label]="'حذف وزن ' + dateLabel(entry.date)"
                  (click)="removeWeight(entry.id, entry.date)"
                >
                  <aio-icon name="lucideTrash2" size="sm" />
                </button>
              </li>
            }
          </ul>
        }
      </ng-template>
      <ng-template aioDialogActions>
        <button aioBtn variant="outline" (click)="weighOpen.set(false)">
          انصراف
        </button>
        <button
          aioBtn
          type="submit"
          form="weigh-form"
          class="health-primary-action"
          [disabled]="busy()"
        >
          ثبت
        </button>
      </ng-template>
    </aio-dialog>

    <aio-dialog
      [(open)]="goalOpen"
      title="هدف وزن"
      description="به چه وزنی و تا کی می‌خواهی برسی؟"
      contentClass="applet-health health-calm"
    >
      <ng-template aioDialogBody>
        <form
          id="goal-form"
          class="flex flex-col gap-5"
          [formRoot]="goalForm"
          (submit)="$event.preventDefault(); saveGoal()"
        >
          <div class="grid grid-cols-2 gap-3">
            <div aioField>
              <label aioFieldLabel for="goal-current">وزن الان (کیلوگرم)</label>
              <input
                aioInput
                id="goal-current"
                type="number"
                inputmode="decimal"
                step="0.1"
                [formField]="goalForm.currentKg"
              />
              @for (e of goalForm.currentKg().errors(); track e.kind) {
                <aio-field-error [validator]="e.kind">{{
                  e.message
                }}</aio-field-error>
              }
            </div>
            <div aioField>
              <label aioFieldLabel for="goal-target">وزن هدف (کیلوگرم)</label>
              <input
                aioInput
                id="goal-target"
                type="number"
                inputmode="decimal"
                step="0.1"
                [formField]="goalForm.targetKg"
              />
              @for (e of goalForm.targetKg().errors(); track e.kind) {
                <aio-field-error [validator]="e.kind">{{
                  e.message
                }}</aio-field-error>
              }
            </div>
          </div>
          <div aioField>
            <span aioFieldLabel id="goal-months-label">تا کی؟</span>
            <div
              aioToggleGroup
              type="single"
              variant="outline"
              aria-labelledby="goal-months-label"
              [value]="selectedMonths()"
              (valueChange)="pickMonths($event)"
            >
              @for (m of months; track m) {
                <button
                  aioToggleGroupItem
                  type="button"
                  [value]="'' + m"
                  class="flex-1"
                >
                  {{ fa(m) }} ماه
                </button>
              }
            </div>
            <label aioFieldLabel for="goal-date" class="mt-2"
              >یا تاریخ دلخواه</label
            >
            <aio-date-input
              contentClass="applet-health"
              inputId="goal-date"
              [minDate]="minDate"
              [formField]="goalForm.targetDate"
            />
            <p aioFieldDescription>
              {{
                goalModel().targetDate
                  ? dateLabel(goalModel().targetDate) +
                    '، ' +
                    fa(daysLeft()) +
                    ' روز دیگر'
                  : 'تاریخ را انتخاب کن'
              }}
            </p>
            @for (e of goalForm.targetDate().errors(); track e.kind) {
              <aio-field-error [validator]="e.kind">{{
                e.message
              }}</aio-field-error>
            }
          </div>
          @if (preview(); as p) {
            <div
              class="health-goal-preview"
              [attr.data-pace]="p.pace"
              aria-live="polite"
            >
              <span class="health-pace" [attr.data-pace]="p.pace">{{
                paceLabels[p.pace]
              }}</span>
              <p class="text-sm leading-7">
                @if (p.pace === 'done') {
                  وزن هدف با وزن فعلی یکی است؛ یعنی حفظ وزن.
                } @else {
                  {{ p.weeklyKg > 0 ? 'کاهش' : 'افزایش' }} هفته‌ای
                  <strong>{{ kg(Math.abs(p.weeklyKg)) }} کیلوگرم</strong>؛
                  روزانه حدود
                  <strong>{{ fa(Math.abs(p.dailyCalories)) }} کالری</strong>
                  {{ p.dailyCalories < 0 ? 'کمتر' : 'بیشتر' }} از نیاز نگهداری.
                  هدف کالری روزانه‌ات با همین حساب می‌شود.
                }
              </p>
              @if (p.pace === 'too-fast') {
                <p class="text-sm leading-7">
                  این سرعت برای بدن سخت است و وزن کم‌شده معمولاً برمی‌گردد.
                  تاریخ را عقب‌تر ببر؛ کالری روزانه هم از حد امن کمتر نمی‌شود.
                </p>
              }
            </div>
          }
        </form>
      </ng-template>
      <ng-template aioDialogActions>
        @if (goalSet()) {
          <button
            aioBtn
            variant="ghost"
            class="text-destructive"
            [disabled]="busy()"
            (click)="clearGoal()"
          >
            حذف هدف
          </button>
        }
        <button aioBtn variant="outline" (click)="goalOpen.set(false)">
          انصراف
        </button>
        <button
          aioBtn
          type="submit"
          form="goal-form"
          class="health-primary-action"
          [disabled]="busy()"
        >
          ذخیره هدف
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class WeightCard {
  private readonly api = inject(HealthApi);
  private readonly confirm = inject(AioConfirm);
  /** Emitted after a change that moves the calorie target. */
  readonly changed = output<void>();

  protected readonly Math = Math;
  protected readonly months = MONTHS;
  protected readonly paceLabels = PACE_LABELS;
  protected readonly today = toIsoDate(new Date());
  protected readonly minDate = addDays(this.today, 7);
  protected readonly fa = (n: number) => faNumber(n);
  protected readonly kg = (n: number) =>
    faNumber(n, { maximumFractionDigits: 1 });
  protected readonly dateLabel = (iso: string) =>
    iso ? faDate(iso, { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  protected readonly weight = httpResource<WeightProgress>(
    () => `${this.api.base}/weight`,
  );
  protected readonly goalSet = computed(
    () => this.weight.value()?.targetKg != null,
  );
  protected readonly busy = signal(false);
  protected readonly weighOpen = signal(false);
  protected readonly goalOpen = signal(false);

  protected readonly weighModel = signal({ weightKg: 0, date: this.today });
  protected readonly weighForm = form(this.weighModel, (path) => {
    required(path.weightKg, { message: 'وزن را وارد کن' });
    min(path.weightKg, 30, { message: 'بین ۳۰ تا ۳۰۰' });
    max(path.weightKg, 300, { message: 'بین ۳۰ تا ۳۰۰' });
    required(path.date);
  });

  protected readonly goalModel = signal({
    currentKg: 0,
    targetKg: 0,
    targetDate: '',
  });
  protected readonly goalForm = form(this.goalModel, (path) => {
    required(path.currentKg, { message: 'وزن الانت را وارد کن' });
    min(path.currentKg, 30, { message: 'بین ۳۰ تا ۳۰۰' });
    max(path.currentKg, 300, { message: 'بین ۳۰ تا ۳۰۰' });
    required(path.targetKg, { message: 'وزن هدف را وارد کن' });
    min(path.targetKg, 30, { message: 'بین ۳۰ تا ۳۰۰' });
    max(path.targetKg, 300, { message: 'بین ۳۰ تا ۳۰۰' });
    required(path.targetDate, { message: 'تاریخ هدف را انتخاب کن' });
  });
  protected readonly selectedMonths = computed(() => {
    const date = this.goalModel().targetDate;
    const m = MONTHS.find((n) => addMonths(this.today, n) === date);
    return m ? `${m}` : '';
  });
  protected readonly daysLeft = computed(() => {
    const date = this.goalModel().targetDate;
    return date
      ? Math.round(
          (Date.parse(`${date}T00:00:00Z`) -
            Date.parse(`${this.today}T00:00:00Z`)) /
            86_400_000,
        )
      : 0;
  });
  /** The pace the form asks for, before saving. */
  protected readonly preview = computed(() => {
    const m = this.goalModel();
    if (
      m.currentKg < 30 ||
      m.targetKg < 30 ||
      !m.targetDate ||
      this.daysLeft() < 7
    )
      return null;
    return weightPlan({
      currentKg: m.currentKg,
      startKg: m.currentKg,
      targetKg: m.targetKg,
      today: this.today,
      targetDate: m.targetDate,
    });
  });

  protected openWeigh() {
    this.weighModel.set({
      weightKg: this.weight.value()?.currentKg ?? 0,
      date: this.today,
    });
    this.weighOpen.set(true);
  }

  protected openGoal() {
    const w = this.weight.value();
    this.goalModel.set({
      currentKg: w?.currentKg ?? 0,
      targetKg: w?.targetKg ?? 0,
      targetDate: w?.targetDate ?? addMonths(this.today, 2),
    });
    this.goalOpen.set(true);
  }

  protected pickMonths(value: unknown) {
    const n = Number(value);
    if (n)
      this.goalModel.update((m) => ({
        ...m,
        targetDate: addMonths(this.today, n),
      }));
  }

  protected saveWeight() {
    submit(this.weighForm, async () => {
      await this.run(async () => {
        const m = this.weighModel();
        this.weight.set(await this.api.logWeight(m));
        this.weighOpen.set(false);
        this.changed.emit();
        aioToast.success('وزن ثبت شد', `${this.kg(m.weightKg)} کیلوگرم`);
      });
    });
  }

  protected saveGoal() {
    submit(this.goalForm, async () => {
      if (this.daysLeft() < 7) {
        aioToast.error('تاریخ هدف باید دست‌کم یک هفته بعد باشد');
        return;
      }
      await this.run(async () => {
        const m = this.goalModel();
        if (m.currentKg !== this.weight.value()?.currentKg)
          await this.api.logWeight({ date: this.today, weightKg: m.currentKg });
        const saved = await this.api.setWeightGoal({
          targetWeightKg: m.targetKg,
          targetDate: m.targetDate,
        });
        this.weight.set(saved);
        this.goalOpen.set(false);
        this.changed.emit();
        aioToast.success(
          'هدفت ثبت شد',
          `${this.kg(m.targetKg)} کیلوگرم تا ${this.dateLabel(m.targetDate)}`,
        );
      });
    });
  }

  protected async clearGoal() {
    const ok = await this.confirm.ask({
      title: 'هدف وزن حذف شود؟',
      description: 'وزن‌های ثبت‌شده می‌مانند.',
      confirmText: 'حذف هدف',
      destructive: true,
    });
    if (!ok) return;
    await this.run(async () => {
      this.weight.set(
        await this.api.setWeightGoal({
          targetWeightKg: null,
          targetDate: null,
        }),
      );
      this.goalOpen.set(false);
      this.changed.emit();
    });
  }

  protected async removeWeight(id: string, date: string) {
    const ok = await this.confirm.ask({
      title: `وزن ${this.dateLabel(date)} حذف شود؟`,
      confirmText: 'حذف',
      destructive: true,
    });
    if (!ok) return;
    await this.run(async () => {
      this.weight.set(await this.api.removeWeight(id));
      this.changed.emit();
    });
  }

  private async run(work: () => Promise<void>) {
    this.busy.set(true);
    try {
      await work();
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
