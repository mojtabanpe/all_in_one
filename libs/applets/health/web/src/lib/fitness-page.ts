import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
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
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_LABELS,
  type ActivityCategory,
  type ActivityType,
  type FitnessWeek,
  type Intensity,
  INTENSITIES,
  INTENSITY_LABELS,
  type WorkoutLog,
  type WorkoutProgram,
} from '@all-in-one/applets/health/contracts';
import { addDays, toIsoDate } from '@all-in-one/shared/schemas';
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
  AioFieldDirectives,
  AioFieldError,
  AioIcon,
  AioInput,
  AioItemDirectives,
  AioNativeSelect,
  AioNativeSelectOption,
  AioProgressDirectives,
  AioTextarea,
  aioToast,
  AioToggleGroupDirectives,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage, faDate, faNumber } from '@all-in-one/web/shared';
import {
  lucideActivity,
  lucideBike,
  lucideDumbbell,
  lucideFlower2,
  lucideFootprints,
  lucideHouse,
  lucideMountain,
  lucidePlus,
  lucideStretchHorizontal,
  lucideTimer,
  lucideTrash2,
  lucideTrophy,
  lucideWaves,
  lucideZap,
} from '@ng-icons/lucide';
import { HealthApi } from './health-api';

type CategoryFilter = ActivityCategory | 'all';

@Component({
  selector: 'health-fitness-page',
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
    AioFieldDirectives,
    AioFieldError,
    AioIcon,
    AioInput,
    AioItemDirectives,
    AioNativeSelect,
    AioNativeSelectOption,
    AioProgressDirectives,
    AioTextarea,
    AioToggleGroupDirectives,
    FormField,
    FormRoot,
  ],
  providers: [
    provideIcons({
      lucideActivity,
      lucideBike,
      lucideDumbbell,
      lucideFlower2,
      lucideFootprints,
      lucideHouse,
      lucideMountain,
      lucidePlus,
      lucideStretchHorizontal,
      lucideTimer,
      lucideTrash2,
      lucideTrophy,
      lucideWaves,
      lucideZap,
    }),
  ],
  template: `
    <div class="flex flex-col gap-5">
      <section aioCard>
        <div aioCardHeader>
          <h2 aioCardTitle>این هفته</h2>
          <p aioCardDescription>
            {{ fa(week.value()?.minutes ?? 0) }} از ۱۵۰ دقیقه فعالیت پیشنهادی
          </p>
        </div>
        <div aioCardContent class="flex flex-col gap-2">
          <div
            aioProgress
            [value]="Math.min(week.value()?.minutes ?? 0, 150)"
            [max]="150"
            aria-label="دقیقه فعالیت هفته"
          >
            <div aioProgressIndicator></div>
          </div>
          <p class="text-muted-foreground text-sm">
            {{ fa(week.value()?.sessions ?? 0) }} جلسه · حدود
            {{ fa(week.value()?.calories ?? 0) }} کالری
          </p>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">چه ورزشی کردید؟</h2>
        <div
          aioToggleGroup
          type="single"
          variant="outline"
          size="sm"
          class="flex flex-wrap"
          [value]="category()"
          (valueChange)="setCategory($event)"
        >
          <button aioToggleGroupItem value="all">همه</button>
          @for (c of categories; track c) {
            <button aioToggleGroupItem [value]="c">
              {{ categoryLabels[c] }}
            </button>
          }
        </div>
        <div class="grid grid-cols-3 gap-2 sm:grid-cols-5">
          @for (a of visibleActivities(); track a.slug) {
            <button
              aioBtn
              variant="outline"
              class="glass h-auto flex-col gap-1.5 rounded-2xl py-3"
              (click)="openLog(a.slug)"
            >
              <aio-icon [name]="a.icon" class="text-primary" />
              <span class="text-xs">{{ a.name }}</span>
            </button>
          }
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">ورزش‌های اخیر</h2>
        @if ((workouts.value() ?? []).length === 0) {
          <p class="text-muted-foreground text-sm">
            در دو هفته اخیر ورزشی ثبت نشده است.
          </p>
        } @else {
          <div aioItemGroup class="flex flex-col gap-2">
            @for (w of workouts.value() ?? []; track w.id) {
              <div aioItem variant="outline" class="glass rounded-2xl">
                <div aioItemContent>
                  <div aioItemTitle>
                    {{ w.activityName }} · {{ fa(w.durationMin) }} دقیقه
                  </div>
                  <div aioItemDescription class="flex flex-wrap gap-1.5">
                    <span>{{
                      faDate(w.date, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })
                    }}</span>
                    <span aioBadge variant="secondary">{{
                      intensityLabels[w.intensity]
                    }}</span>
                    @if (w.calories) {
                      <span aioBadge variant="outline"
                        >{{ fa(w.calories) }} کالری</span
                      >
                    }
                    @if (w.distanceKm) {
                      <span aioBadge variant="outline"
                        >{{ fa(w.distanceKm) }} کیلومتر</span
                      >
                    }
                  </div>
                </div>
                <div aioItemActions>
                  <button
                    aioBtn
                    variant="ghost"
                    size="icon"
                    (click)="removeWorkout(w)"
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
        <h2 class="text-lg font-semibold">برنامه‌های تمرینی</h2>
        <div aioAccordion type="single" class="glass rounded-3xl px-4">
          @for (p of programs.value() ?? []; track p.slug) {
            <div aioAccordionItem>
              <aio-accordion-trigger>
                <span class="flex flex-col items-start gap-0.5 text-start">
                  <span>{{ p.title }}</span>
                  <span class="text-muted-foreground text-xs">
                    هفته‌ای {{ fa(p.sessionsPerWeek) }} جلسه ·
                    {{ fa(p.minutes) }} دقیقه
                  </span>
                </span>
              </aio-accordion-trigger>
              <aio-accordion-content>
                <p class="text-muted-foreground mb-3 text-sm">
                  {{ p.description }}
                </p>
                <ol
                  class="mb-3 flex [list-style-type:persian] flex-col gap-1 ps-5 text-sm"
                >
                  @for (e of p.exercises; track e.name) {
                    <li>
                      {{ e.name }}
                      <span class="text-muted-foreground">{{
                        exerciseDetail(e)
                      }}</span>
                    </li>
                  }
                </ol>
                <button aioBtn size="sm" (click)="openLog(p.activitySlug, p)">
                  ثبت این جلسه
                </button>
              </aio-accordion-content>
            </div>
          }
        </div>
      </section>
    </div>

    <aio-dialog
      [(open)]="logging"
      title="ثبت ورزش"
      description="کالری با وزن شما در مشخصات برآورد می‌شود."
    >
      <ng-template aioDialogBody>
        <form
          id="workout-form"
          class="flex flex-col gap-4"
          [formRoot]="logForm"
          (submit)="$event.preventDefault(); save()"
        >
          <div aioField>
            <label aioFieldLabel for="w-activity">نوع ورزش</label>
            <aio-native-select
              selectId="w-activity"
              [value]="model().activitySlug"
              (valueChange)="patch({ activitySlug: $event })"
            >
              @for (a of activities.value() ?? []; track a.slug) {
                <option aioNativeSelectOption [value]="a.slug">
                  {{ a.name }}
                </option>
              }
            </aio-native-select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div aioField>
              <label aioFieldLabel for="w-date">تاریخ</label>
              <input
                aioInput
                id="w-date"
                type="date"
                [formField]="logForm.date"
              />
            </div>
            <div aioField>
              <label aioFieldLabel for="w-min">مدت (دقیقه)</label>
              <input
                aioInput
                id="w-min"
                type="number"
                inputmode="numeric"
                [formField]="logForm.durationMin"
              />
              @for (e of logForm.durationMin().errors(); track e.kind) {
                <aio-field-error [validator]="e.kind">{{
                  e.message
                }}</aio-field-error>
              }
            </div>
          </div>
          <div aioField>
            <span aioFieldLabel>شدت</span>
            <div
              aioToggleGroup
              type="single"
              variant="outline"
              [value]="model().intensity"
              (valueChange)="setIntensity($event)"
            >
              @for (i of intensities; track i) {
                <button
                  aioToggleGroupItem
                  type="button"
                  [value]="i"
                  class="flex-1"
                >
                  {{ intensityLabels[i] }}
                </button>
              }
            </div>
          </div>
          @if (isCardio()) {
            <div class="grid grid-cols-2 gap-3">
              <div aioField>
                <label aioFieldLabel for="w-km">مسافت (کیلومتر)</label>
                <input
                  aioInput
                  id="w-km"
                  type="number"
                  inputmode="decimal"
                  step="0.1"
                  [formField]="logForm.distanceKm"
                />
              </div>
              <div aioField>
                <label aioFieldLabel for="w-steps">تعداد قدم</label>
                <input
                  aioInput
                  id="w-steps"
                  type="number"
                  inputmode="numeric"
                  [formField]="logForm.steps"
                />
              </div>
            </div>
          }
          <div aioField>
            <label aioFieldLabel for="w-notes">یادداشت (اختیاری)</label>
            <textarea
              aioTextarea
              id="w-notes"
              rows="2"
              [formField]="logForm.notes"
            ></textarea>
          </div>
        </form>
      </ng-template>
      <ng-template aioDialogActions>
        <button aioBtn variant="outline" (click)="logging.set(false)">
          انصراف
        </button>
        <button aioBtn type="submit" form="workout-form" [disabled]="saving()">
          ثبت
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class FitnessPage {
  private readonly api = inject(HealthApi);
  private readonly confirm = inject(AioConfirm);
  private readonly today = toIsoDate(new Date());
  protected readonly Math = Math;
  protected readonly faDate = faDate;
  protected readonly fa = (n: number) => faNumber(n);
  protected readonly categories = ACTIVITY_CATEGORIES;
  protected readonly categoryLabels = ACTIVITY_CATEGORY_LABELS;
  protected readonly intensities = INTENSITIES;
  protected readonly intensityLabels = INTENSITY_LABELS;

  protected readonly activities = httpResource<ActivityType[]>(
    () => `${this.api.base}/activities`,
  );
  protected readonly programs = httpResource<WorkoutProgram[]>(
    () => `${this.api.base}/programs`,
  );
  protected readonly week = httpResource<FitnessWeek>(
    () => `${this.api.base}/workouts/week?date=${this.today}`,
  );
  protected readonly workouts = httpResource<WorkoutLog[]>(
    () =>
      `${this.api.base}/workouts?from=${addDays(this.today, -13)}&to=${this.today}`,
  );

  protected readonly category = signal<CategoryFilter>('all');
  protected readonly visibleActivities = computed(() =>
    (this.activities.value() ?? []).filter(
      (a) => this.category() === 'all' || a.category === this.category(),
    ),
  );

  protected readonly logging = signal(false);
  protected readonly saving = signal(false);
  protected readonly model = signal({
    activitySlug: 'walking',
    programSlug: '',
    date: this.today,
    durationMin: 30,
    intensity: 'MODERATE' as Intensity,
    distanceKm: 0,
    steps: 0,
    notes: '',
  });
  protected readonly logForm = form(this.model, (path) => {
    required(path.date);
    min(path.durationMin, 1, { message: 'حداقل ۱ دقیقه' });
    max(path.durationMin, 600, { message: 'حداکثر ۶۰۰ دقیقه' });
    min(path.distanceKm, 0);
    min(path.steps, 0);
  });
  protected readonly isCardio = computed(
    () =>
      this.activities.value()?.find((a) => a.slug === this.model().activitySlug)
        ?.category === 'cardio',
  );

  protected setCategory(value: unknown) {
    if (typeof value === 'string') this.category.set(value as CategoryFilter);
  }

  protected setIntensity(value: unknown) {
    if (typeof value === 'string')
      this.patch({ intensity: value as Intensity });
  }

  protected patch(change: Partial<ReturnType<typeof this.model>>) {
    this.model.update((m) => ({ ...m, ...change }));
  }

  protected openLog(activitySlug: string, program?: WorkoutProgram) {
    this.model.set({
      activitySlug,
      programSlug: program?.slug ?? '',
      date: this.today,
      durationMin: program?.minutes ?? 30,
      intensity: 'MODERATE',
      distanceKm: 0,
      steps: 0,
      notes: '',
    });
    this.logging.set(true);
  }

  protected exerciseDetail(e: WorkoutProgram['exercises'][number]): string {
    const parts: string[] = [];
    if (e.sets && e.reps) parts.push(`${faNumber(e.sets)}×${faNumber(e.reps)}`);
    else if (e.reps) parts.push(`${faNumber(e.reps)} تکرار`);
    if (e.seconds)
      parts.push(
        e.seconds >= 120
          ? `${faNumber(Math.round(e.seconds / 60))} دقیقه`
          : `${faNumber(e.seconds)} ثانیه`,
      );
    if (e.note) parts.push(e.note);
    return parts.length ? `(${parts.join('، ')})` : '';
  }

  protected save() {
    submit(this.logForm, async () => {
      this.saving.set(true);
      const m = this.model();
      try {
        await this.api.logWorkout({
          activitySlug: m.activitySlug,
          programSlug: m.programSlug || undefined,
          date: m.date,
          durationMin: m.durationMin,
          intensity: m.intensity,
          distanceKm: m.distanceKm || undefined,
          steps: m.steps || undefined,
          notes: m.notes.trim() || undefined,
        });
        this.logging.set(false);
        aioToast.success('ورزش ثبت شد');
        this.workouts.reload();
        this.week.reload();
      } catch (error) {
        aioToast.error(apiErrorMessage(error));
      } finally {
        this.saving.set(false);
      }
    });
  }

  protected async removeWorkout(w: WorkoutLog) {
    if (
      !(await this.confirm.ask({
        title: 'این ورزش حذف شود؟',
        description: w.activityName,
        confirmText: 'حذف',
        destructive: true,
      }))
    )
      return;
    try {
      await this.api.removeWorkout(w.id);
      this.workouts.reload();
      this.week.reload();
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }
}
