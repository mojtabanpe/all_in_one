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
  EQUIPMENT,
  EQUIPMENT_LABELS,
  MUSCLE_LABELS,
  TRAINING_GOALS,
  TRAINING_GOAL_LABELS,
  TRAINING_LEVELS,
  generateRoutineSchema,
  saveRoutineSchema,
  logSessionSchema,
  type GenerateRoutineInput,
  type SaveRoutineInput,
  type Equipment,
  type TrainingGoal,
  type Exercise,
  type WorkoutRoutine,
  type TrainingProgress,
  type CompletedSet,
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
  AioDateInput,
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
    AioDateInput,
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
    <div class="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
      <section class="health-workout-banner lg:col-span-2">
        <div class="flex min-w-0 flex-col items-start gap-3">
          <p class="health-metric-label">با ریتم خودت حرکت کن</p>
          @if (routines.value()?.[0]; as routine) {
            <h2 class="text-2xl font-bold">{{ routine.title }}</h2>
            <p class="health-metric-label">
              {{ fa(routine.minutes) }} دقیقه،
              {{ fa(routine.days[0]?.exercises?.length ?? 0) }} حرکت در جلسه اول
            </p>
            <button
              aioBtn
              class="health-primary-action"
              (click)="startSession(routine, 0)"
            >
              باز کردن جلسه اول
            </button>
            <p class="text-muted-foreground text-xs">
              پس از انجام تمرین، تعداد و وزنه واقعی ست‌ها را ثبت کن.
            </p>
          } @else {
            <h2 class="text-2xl font-bold">یک برنامه، مخصوص خودت.</h2>
            <p class="health-metric-label">
              خانه، TRX یا باشگاه؛ متناسب با سطح و زمانی که داری.
            </p>
            <button
              aioBtn
              class="health-primary-action"
              (click)="trainingError.set(''); creatorOpen.set(true)"
            >
              ساخت برنامه شخصی
            </button>
          }
        </div>
        <span class="health-helper-art shrink-0" aria-hidden="true"></span>
      </section>
      <section aioCard class="lg:col-span-2">
        <div aioCardContent class="health-topline flex-wrap pt-6">
          <div>
            <p class="health-metric-label">فعالیت این هفته</p>
            <p class="health-small-number">
              {{
                week.isLoading()
                  ? '…'
                  : week.error()
                    ? '—'
                    : fa(week.value()?.minutes ?? 0)
              }}
              <span class="text-sm font-normal text-muted-foreground"
                >دقیقه از ۱۵۰</span
              >
            </p>
          </div>
          <div>
            <p class="health-metric-label">جلسه ثبت‌شده</p>
            <p class="health-small-number">
              {{
                week.isLoading()
                  ? '…'
                  : week.error()
                    ? '—'
                    : fa(week.value()?.sessions ?? 0)
              }}
            </p>
          </div>
          <button
            aioBtn
            class="health-soft-action"
            (click)="openLog('walking')"
          >
            ثبت فعالیت
          </button>
        </div>
      </section>

      <section
        class="flex flex-col gap-3 lg:col-span-2"
        aria-label="برنامه‌های شخصی"
      >
        @if (routines.isLoading()) {
          <p role="status">در حال دریافت برنامه‌ها…</p>
        }
        @if (routines.error()) {
          <p role="alert">دریافت برنامه‌ها ممکن نشد.</p>
          <button aioBtn variant="outline" (click)="routines.reload()">
            تلاش دوباره
          </button>
        }
        @for (routine of routines.value() ?? []; track routine.id) {
          <section aioCard>
            <div aioCardHeader>
              <h3 aioCardTitle>{{ routine.title }}</h3>
              <p aioCardDescription>
                {{ fa(routine.weeks) }} هفته، {{ fa(routine.daysPerWeek) }} جلسه
                در هفته، {{ trainingGoalLabels[routine.goal] }}
              </p>
            </div>
            <div aioCardContent class="flex flex-col gap-3">
              <h4 class="font-semibold">گرم کردن</h4>
              @for (line of routine.warmup; track line) {
                <p class="text-sm">{{ line }}</p>
              }
              <div aioAccordion type="single">
                @for (
                  session of routine.days;
                  track $index;
                  let dayIndex = $index
                ) {
                  <div aioAccordionItem>
                    <aio-accordion-trigger>{{
                      session.title
                    }}</aio-accordion-trigger
                    ><aio-accordion-content>
                      <div class="flex flex-col gap-3">
                        @for (item of session.exercises; track $index) {
                          <div
                            class="flex flex-wrap items-center justify-between gap-2"
                          >
                            <button
                              aioBtn
                              variant="link"
                              (click)="showExercise(item.exerciseSlug)"
                            >
                              {{ exerciseName(item.exerciseSlug) }}
                            </button>
                            <span class="text-sm"
                              >{{ fa(item.sets) }} ست،
                              {{
                                item.seconds
                                  ? fa(item.seconds) + ' ثانیه'
                                  : fa(item.reps) + ' تکرار'
                              }}، {{ fa(item.restSeconds) }} ثانیه استراحت</span
                            >
                          </div>
                        }
                        <button
                          aioBtn
                          variant="outline"
                          (click)="startSession(routine, dayIndex)"
                        >
                          ثبت ست‌های انجام‌شده این جلسه
                        </button>
                      </div>
                    </aio-accordion-content>
                  </div>
                }
              </div>
              <h4 class="font-semibold">سرد کردن و پیشرفت</h4>
              @for (line of routine.cooldown; track line) {
                <p class="text-sm">{{ line }}</p>
              }
              @for (line of routine.progression; track line) {
                <p class="text-muted-foreground text-sm">{{ line }}</p>
              }
            </div>
            <div aioCardFooter class="gap-2">
              <button aioBtn variant="outline" (click)="editRoutine(routine)">
                ویرایش حرکات و ست‌ها</button
              ><button
                aioBtn
                variant="ghost"
                (click)="removeRoutine(routine)"
                [disabled]="trainingBusy()"
              >
                حذف برنامه
              </button>
            </div>
          </section>
        }
      </section>

      <section aioCard>
        <div aioCardHeader>
          <h2 aioCardTitle>پیشرفت تمرین در ۴ هفته اخیر</h2>
          <p aioCardDescription>
            فقط ست‌های واقعاً ثبت‌شده؛ حجم بار، وزن بدن را حساب نمی‌کند.
          </p>
        </div>
        <div aioCardContent class="flex flex-col gap-3">
          @if (progress.isLoading()) {
            <p role="status">در حال دریافت…</p>
          }
          @if (progress.error()) {
            <p role="alert">گزارش دریافت نشد.</p>
            <button aioBtn variant="outline" (click)="progress.reload()">
              تلاش دوباره
            </button>
          }
          @if (progress.value(); as p) {
            <p>
              {{ fa(p.sessions) }} جلسه، {{ fa(p.totalSets) }} ست،
              {{ fa(p.volumeKg) }} کیلوگرم مجموع وزنه × تکرار
            </p>
            <div class="flex flex-wrap gap-2">
              @for (m of p.muscles; track m.muscle) {
                <span aioBadge variant="secondary"
                  >{{ muscleLabels[m.muscle] }}: {{ fa(m.sets) }} ست</span
                >
              }
            </div>
            @for (entry of p.exercises; track entry.exerciseSlug) {
              <p class="text-sm">
                {{ exerciseName(entry.exerciseSlug) }}: {{ fa(entry.sets) }} ست،
                بیشترین وزنه {{ fa(entry.bestWeightKg) }} کیلوگرم
              </p>
            }
          }
        </div>
      </section>

      <section aioCard>
        <div aioCardHeader>
          <h2 aioCardTitle>بانک حرکت‌ها</h2>
          <p aioCardDescription>
            اجرای مرحله‌به‌مرحله، اشتباهات رایج و حرکت جایگزین؛ ویدئوها به‌مرور
            اضافه می‌شوند.
          </p>
        </div>
        <div aioCardContent class="flex flex-col gap-3">
          <div aioField>
            <label aioFieldLabel for="exercise-search">جست‌وجوی حرکت</label
            ><input
              aioInput
              id="exercise-search"
              [formField]="exerciseSearchForm.search"
            />
          </div>
          <div aioField>
            <label aioFieldLabel for="exercise-equipment">تجهیزات</label
            ><aio-native-select
              selectId="exercise-equipment"
              [value]="exerciseSearch().equipment"
              (valueChange)="setExerciseEquipment($event)"
              ><option aioNativeSelectOption value="">همه</option>
              @for (eq of equipment; track eq) {
                <option aioNativeSelectOption [value]="eq">
                  {{ equipmentLabels[eq] }}
                </option>
              }
            </aio-native-select>
          </div>
          @if (exerciseCatalog.isLoading()) {
            <p role="status">در حال دریافت حرکت‌ها…</p>
          }
          @if (exerciseCatalog.error()) {
            <p role="alert">بانک حرکت‌ها دریافت نشد.</p>
            <button aioBtn variant="outline" (click)="exerciseCatalog.reload()">
              تلاش دوباره
            </button>
          }
          @for (exercise of displayedExercises(); track exercise.slug) {
            <button
              aioBtn
              variant="outline"
              class="min-h-11 justify-between"
              (click)="selectedExercise.set(exercise)"
            >
              <span>{{ exercise.name }}</span
              ><span class="text-muted-foreground text-xs"
                >{{ equipmentLabels[exercise.equipment] }}،
                {{ muscleLabels[exercise.muscle] }}</span
              >
            </button>
          }
          @if (displayedExercises().length < filteredExercises().length) {
            <button
              aioBtn
              variant="outline"
              (click)="exerciseLimit.update(moreExercises)"
            >
              نمایش حرکت‌های بیشتر ({{
                fa(filteredExercises().length - displayedExercises().length)
              }})
            </button>
          }
          @if (
            !exerciseCatalog.isLoading() &&
            !exerciseCatalog.error() &&
            !filteredExercises().length
          ) {
            <p class="text-muted-foreground">حرکتی با این مشخصات موجود نیست.</p>
          }
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">چه ورزشی کردید؟</h2>
        <div
          aioToggleGroup
          type="single"
          spacing="2"
          class="-mx-4 w-auto flex-nowrap overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0"
          [value]="category()"
          (valueChange)="setCategory($event)"
        >
          <button
            aioToggleGroupItem
            value="all"
            class="glass data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 rounded-full px-4"
          >
            همه
          </button>
          @for (c of categories; track c) {
            <button
              aioToggleGroupItem
              [value]="c"
              class="glass data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 rounded-full px-4"
            >
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
                    {{ w.activityName }}، {{ fa(w.durationMin) }} دقیقه
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

      <section class="flex flex-col gap-4 lg:col-span-2">
        <div>
          <h2 class="health-section-heading">تمرین‌های آماده</h2>
          <p class="health-metric-label mt-1">
            از یک جلسه ساده شروع کن؛ لازم نیست از روز اول سخت بگیری.
          </p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          @for (program of programs.value() ?? []; track program.slug) {
            <section aioCard>
              <div aioCardHeader>
                <span class="health-icon-disc mb-2 text-[var(--health-blue)]"
                  ><aio-icon name="lucideDumbbell"
                /></span>
                <h3 aioCardTitle class="text-base leading-7">
                  {{ program.title }}
                </h3>
                <p aioCardDescription>
                  {{ fa(program.minutes) }} دقیقه،
                  {{ fa(program.exercises.length) }} حرکت
                </p>
              </div>
              <div aioCardFooter>
                <button
                  aioBtn
                  class="health-soft-action w-full"
                  (click)="selectedProgram.set(program)"
                >
                  دیدن برنامه
                </button>
              </div>
            </section>
          }
        </div>
      </section>
    </div>

    <aio-dialog
      [open]="selectedProgram() !== null"
      (openChange)="!$event && selectedProgram.set(null)"
      [title]="selectedProgram()?.title ?? 'برنامه تمرین'"
      contentClass="applet-health health-calm"
    >
      <ng-template aioDialogBody>
        @if (selectedProgram(); as program) {
          <div class="flex flex-col gap-5">
            <p class="health-metric-label">{{ program.description }}</p>
            <ol class="flex flex-col gap-3">
              @for (exercise of program.exercises; track $index) {
                <li class="flex gap-3 border-b border-border py-3">
                  <span class="health-icon-disc text-[var(--health-purple)]">{{
                    fa($index + 1)
                  }}</span>
                  <div>
                    <h3 class="font-semibold">{{ exercise.name }}</h3>
                    <p class="health-metric-label">
                      {{ exerciseDetail(exercise) }}
                    </p>
                  </div>
                </li>
              }
            </ol>
            <p class="text-muted-foreground text-xs">
              این برنامه پیشنهادی است؛ فقط تمرینی را که انجام داده‌ای ثبت کن.
            </p>
          </div>
        }
      </ng-template>
      <ng-template aioDialogActions
        ><button
          aioBtn
          class="health-primary-action"
          (click)="logSelectedProgram()"
        >
          این جلسه را انجام دادم؛ ثبت
        </button></ng-template
      >
    </aio-dialog>
    <aio-dialog
      contentClass="applet-health health-calm"
      [(open)]="creatorOpen"
      title="ساخت برنامه شخصی"
      description="تجهیزات، هدف و زمان تمرین را انتخاب کنید."
    >
      <ng-template aioDialogBody>
        <form
          id="routine-create-form"
          class="flex flex-col gap-4"
          [formRoot]="routineForm"
          (submit)="$event.preventDefault(); generateRoutine()"
        >
          <div aioField>
            <label aioFieldLabel for="routine-title">نام برنامه</label
            ><input
              aioInput
              id="routine-title"
              [formField]="routineForm.title"
            />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div aioField>
              <label aioFieldLabel for="routine-goal">هدف تمرین</label
              ><aio-native-select
                selectId="routine-goal"
                [value]="routineModel().goal"
                (valueChange)="setRoutineGoal($event)"
              >
                @for (goal of trainingGoals; track goal) {
                  <option aioNativeSelectOption [value]="goal">
                    {{ trainingGoalLabels[goal] }}
                  </option>
                }
              </aio-native-select>
            </div>
            <div aioField>
              <label aioFieldLabel for="routine-level">سطح</label
              ><aio-native-select
                selectId="routine-level"
                [value]="routineModel().level"
                (valueChange)="setRoutineLevel($event)"
              >
                @for (level of trainingLevels; track level) {
                  <option aioNativeSelectOption [value]="level">
                    {{ levelLabels[level] }}
                  </option>
                }
              </aio-native-select>
            </div>
          </div>
          <div aioField>
            <span aioFieldLabel>تجهیزات در دسترس</span>
            <div
              aioToggleGroup
              type="multiple"
              variant="outline"
              class="flex-wrap"
              [value]="routineModel().equipment"
              (valueChange)="setRoutineEquipment($event)"
            >
              @for (eq of equipment; track eq) {
                <button
                  aioToggleGroupItem
                  type="button"
                  [value]="eq"
                  class="min-h-11"
                >
                  {{ equipmentLabels[eq] }}
                </button>
              }
            </div>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div aioField>
              <label aioFieldLabel for="routine-days">جلسه در هفته</label
              ><input
                aioInput
                id="routine-days"
                type="number"
                [formField]="routineForm.daysPerWeek"
              />
            </div>
            <div aioField>
              <label aioFieldLabel for="routine-weeks">تعداد هفته</label
              ><input
                aioInput
                id="routine-weeks"
                type="number"
                [formField]="routineForm.weeks"
              />
            </div>
            <div aioField>
              <label aioFieldLabel for="routine-minutes">دقیقه هر جلسه</label
              ><input
                aioInput
                id="routine-minutes"
                type="number"
                [formField]="routineForm.minutes"
              />
            </div>
          </div>
          @if (trainingError()) {
            <p role="alert" class="text-destructive text-sm">
              {{ trainingError() }}
            </p>
          }
          <button aioBtn type="submit" [disabled]="trainingBusy()">
            {{ trainingBusy() ? 'در حال ذخیره…' : 'ساخت و ذخیره برنامه' }}
          </button>
          <p class="text-muted-foreground text-sm">
            جلسات عضلات مشترک را با فاصله حداقل ۴۸ ساعت بچینید. تعداد جلسه،
            زمان‌بندی تقویمی نیست.
          </p>
        </form>
      </ng-template>
    </aio-dialog>
    <aio-dialog
      contentClass="applet-health health-calm"
      [open]="selectedExercise() !== null"
      (openChange)="!$event && selectedExercise.set(null)"
      [title]="selectedExercise()?.name ?? 'آموزش حرکت'"
    >
      <ng-template aioDialogBody>
        @if (selectedExercise(); as e) {
          <div class="flex flex-col gap-4">
            <p>
              {{ equipmentLabels[e.equipment] }}، {{ muscleLabels[e.muscle] }}،
              {{ levelLabels[e.level] }}
            </p>
            @if (e.secondaryMuscles.length) {
              <p class="text-muted-foreground text-sm">
                عضلات کمکی:
                @for (m of e.secondaryMuscles; track m) {
                  <span>{{ muscleLabels[m] }} </span>
                }
              </p>
            }
            <h3 class="font-semibold">روش اجرا</h3>
            <ol class="list-inside list-decimal">
              @for (step of e.instructions; track step) {
                <li class="mb-2">{{ step }}</li>
              }
            </ol>
            <h3 class="font-semibold">اشتباهات رایج</h3>
            @for (mistake of e.mistakes; track mistake) {
              <p class="text-sm">{{ mistake }}</p>
            }
            @if (e.videoUrl) {
              @let site = videoSite(e.videoUrl);
              <a
                aioBtn
                [href]="e.videoUrl"
                target="_blank"
                rel="noopener noreferrer"
                >دیدن ویدئوی آموزش{{ site ? ' در ' + site : '' }}</a
              >
              @if (site === 'یوتیوب') {
                <p class="text-muted-foreground text-sm">
                  یوتیوب در ایران فقط با فیلترشکن باز می‌شود.
                </p>
              }
            } @else {
              <p class="text-muted-foreground text-sm">
                ویدئو هنوز اضافه نشده؛ می‌توانید با مراحل بالا حرکت را بشناسید.
              </p>
            }
            <h3 class="font-semibold">حرکت‌های جایگزین</h3>
            <div class="flex flex-wrap gap-2">
              @for (slug of e.alternatives; track slug) {
                <button aioBtn variant="outline" (click)="showExercise(slug)">
                  {{ exerciseName(slug) }}
                </button>
              }
            </div>
          </div>
        }
      </ng-template>
    </aio-dialog>
    <aio-dialog
      contentClass="applet-health health-calm"
      [(open)]="sessionOpen"
      title="جلسه تمرین شما"
      description="فقط ست‌هایی را نگه دارید که انجام داده‌اید؛ تکرار، زمان و وزنه واقعی را وارد کنید."
    >
      <ng-template aioDialogBody>
        <form
          id="training-session-form"
          [formRoot]="sessionForm"
          (submit)="$event.preventDefault(); saveSession()"
          class="flex flex-col gap-4"
        >
          <div class="grid grid-cols-2 gap-3">
            <div aioField>
              <label aioFieldLabel for="session-date">تاریخ</label
              ><aio-date-input
                inputId="session-date"
                [formField]="sessionForm.date"
              />
            </div>
            <div aioField>
              <label aioFieldLabel for="session-duration">مدت (دقیقه)</label
              ><input
                aioInput
                id="session-duration"
                type="number"
                [formField]="sessionForm.durationMin"
              />
            </div>
          </div>
          @for (set of sessionModel().sets; track $index; let i = $index) {
            <div class="flex flex-col gap-2">
              <h3 class="font-semibold">
                {{ exerciseName(set.exerciseSlug) }}، ست {{ fa(i + 1) }}
              </h3>
              <div class="grid grid-cols-3 gap-2">
                <div aioField>
                  <label aioFieldLabel [for]="'set-reps-' + i">تکرار</label
                  ><input
                    aioInput
                    [id]="'set-reps-' + i"
                    type="number"
                    [formField]="sessionForm.sets[i].reps"
                  />
                </div>
                <div aioField>
                  <label aioFieldLabel [for]="'set-weight-' + i"
                    >وزنه (کیلو)</label
                  ><input
                    aioInput
                    [id]="'set-weight-' + i"
                    type="number"
                    step="0.5"
                    [formField]="sessionForm.sets[i].weightKg"
                  />
                </div>
                <div aioField>
                  <label aioFieldLabel [for]="'set-time-' + i"
                    >زمان (ثانیه)</label
                  ><input
                    aioInput
                    [id]="'set-time-' + i"
                    type="number"
                    [formField]="sessionForm.sets[i].seconds"
                  />
                </div>
              </div>
              <button
                aioBtn
                variant="ghost"
                type="button"
                (click)="removeSet(i)"
              >
                این ست انجام نشد؛ حذف
              </button>
            </div>
          }
          <div aioField>
            <label aioFieldLabel for="session-notes">یادداشت</label
            ><textarea
              aioTextarea
              id="session-notes"
              [formField]="sessionForm.notes"
            ></textarea>
          </div>
          @if (trainingError()) {
            <p role="alert" class="text-destructive">{{ trainingError() }}</p>
          }
        </form>
      </ng-template>
      <ng-template aioDialogActions
        ><button aioBtn variant="outline" (click)="sessionOpen.set(false)">
          انصراف</button
        ><button
          aioBtn
          type="submit"
          form="training-session-form"
          [disabled]="trainingBusy()"
        >
          ثبت ست‌های واقعی
        </button></ng-template
      >
    </aio-dialog>
    <aio-dialog
      contentClass="applet-health health-calm"
      [(open)]="editorOpen"
      title="ویرایش برنامه"
    >
      <ng-template aioDialogBody>
        <form
          id="routine-editor-form"
          [formRoot]="editorForm"
          (submit)="$event.preventDefault(); saveRoutine()"
          class="flex flex-col gap-4"
        >
          <div aioField>
            <label aioFieldLabel for="edit-routine-title">نام برنامه</label
            ><input
              aioInput
              id="edit-routine-title"
              [formField]="editorForm.title"
            />
          </div>
          @for (day of editorModel().days; track $index; let di = $index) {
            <h3 class="font-semibold">{{ day.title }}</h3>
            @for (item of day.exercises; track $index; let ei = $index) {
              <div class="flex flex-col gap-2">
                <div aioField>
                  <label aioFieldLabel [for]="'edit-ex-' + di + '-' + ei"
                    >حرکت</label
                  ><aio-native-select
                    [selectId]="'edit-ex-' + di + '-' + ei"
                    [value]="item.exerciseSlug"
                    (valueChange)="changeRoutineExercise(di, ei, $event)"
                  >
                    @for (exercise of editorExercises(); track exercise.slug) {
                      <option aioNativeSelectOption [value]="exercise.slug">
                        {{ exercise.name }}
                      </option>
                    }
                  </aio-native-select>
                </div>
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div aioField>
                    <label aioFieldLabel [for]="'edit-sets-' + di + '-' + ei"
                      >ست</label
                    ><input
                      aioInput
                      [id]="'edit-sets-' + di + '-' + ei"
                      type="number"
                      [formField]="editorForm.days[di].exercises[ei].sets"
                    />
                  </div>
                  <div aioField>
                    <label aioFieldLabel [for]="'edit-reps-' + di + '-' + ei"
                      >تکرار</label
                    ><input
                      aioInput
                      [id]="'edit-reps-' + di + '-' + ei"
                      type="number"
                      [formField]="editorForm.days[di].exercises[ei].reps"
                    />
                  </div>
                  <div aioField>
                    <label aioFieldLabel [for]="'edit-time-' + di + '-' + ei"
                      >ثانیه</label
                    ><input
                      aioInput
                      [id]="'edit-time-' + di + '-' + ei"
                      type="number"
                      [formField]="editorForm.days[di].exercises[ei].seconds"
                    />
                  </div>
                  <div aioField>
                    <label aioFieldLabel [for]="'edit-rest-' + di + '-' + ei"
                      >استراحت</label
                    ><input
                      aioInput
                      [id]="'edit-rest-' + di + '-' + ei"
                      type="number"
                      [formField]="
                        editorForm.days[di].exercises[ei].restSeconds
                      "
                    />
                  </div>
                </div>
              </div>
            }
          }
          @if (trainingError()) {
            <p role="alert" class="text-destructive">{{ trainingError() }}</p>
          }
        </form> </ng-template
      ><ng-template aioDialogActions
        ><button aioBtn variant="outline" (click)="editorOpen.set(false)">
          انصراف</button
        ><button
          aioBtn
          type="submit"
          form="routine-editor-form"
          [disabled]="trainingBusy()"
        >
          ذخیره تغییرات
        </button></ng-template
      >
    </aio-dialog>

    <aio-dialog
      contentClass="applet-health health-calm"
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
              <aio-date-input inputId="w-date" [formField]="logForm.date" />
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

  protected readonly selectedProgram = signal<WorkoutProgram | null>(null);
  protected logSelectedProgram() {
    const program = this.selectedProgram();
    if (!program) return;
    this.selectedProgram.set(null);
    this.openLog(program.activitySlug, program);
  }
  protected readonly creatorOpen = signal(false);
  protected readonly exerciseLimit = signal(6);
  protected readonly moreExercises = (count: number) => count + 6;
  protected readonly displayedExercises = computed(() =>
    this.filteredExercises().slice(0, this.exerciseLimit()),
  );
  protected readonly equipment = EQUIPMENT;
  protected readonly equipmentLabels = EQUIPMENT_LABELS;
  protected readonly muscleLabels = MUSCLE_LABELS;
  protected readonly trainingGoals = TRAINING_GOALS;
  protected readonly trainingGoalLabels = TRAINING_GOAL_LABELS;
  protected readonly trainingLevels = TRAINING_LEVELS;
  protected readonly levelLabels = {
    beginner: 'مبتدی',
    intermediate: 'متوسط',
    advanced: 'پیشرفته',
  };
  protected readonly trainingBusy = signal(false);
  protected readonly trainingError = signal('');
  protected readonly exerciseCatalog = httpResource<Exercise[]>(
    () => `${this.api.base}/exercises`,
  );
  protected readonly routines = httpResource<WorkoutRoutine[]>(
    () => `${this.api.base}/routines`,
  );
  protected readonly progress = httpResource<TrainingProgress>(
    () =>
      `${this.api.base}/training-progress?from=${addDays(this.today, -27)}&to=${this.today}`,
  );
  protected readonly selectedExercise = signal<Exercise | null>(null);
  protected readonly exerciseSearch = signal({ search: '', equipment: '' });
  protected readonly exerciseSearchForm = form(this.exerciseSearch);
  protected readonly filteredExercises = computed(() =>
    (this.exerciseCatalog.value() ?? []).filter(
      (e) =>
        (!this.exerciseSearch().equipment ||
          e.equipment === this.exerciseSearch().equipment) &&
        (e.name.includes(this.exerciseSearch().search.trim()) ||
          e.slug.includes(this.exerciseSearch().search.trim().toLowerCase())),
    ),
  );
  protected readonly routineModel = signal<GenerateRoutineInput>({
    title: 'برنامه من',
    goal: 'fitness',
    level: 'beginner',
    equipment: ['bodyweight'],
    daysPerWeek: 3,
    weeks: 4,
    minutes: 30,
  });
  protected readonly routineForm = form(this.routineModel, (path) => {
    required(path.title);
    min(path.daysPerWeek, 1);
    max(path.daysPerWeek, 7);
    min(path.weeks, 1);
    min(path.minutes, 1);
  });
  protected readonly sessionOpen = signal(false);
  protected readonly sessionModel = signal({
    routineId: '',
    dayIndex: 0,
    date: this.today,
    durationMin: 30,
    notes: '',
    sets: [] as CompletedSet[],
  });
  protected readonly sessionForm = form(this.sessionModel);
  protected readonly editorOpen = signal(false);
  private editingRoutineId = '';
  protected readonly editorModel = signal<SaveRoutineInput>({
    ...this.routineModel(),
    days: [],
  });
  protected readonly editorForm = form(this.editorModel);
  protected readonly editorExercises = computed(() =>
    (this.exerciseCatalog.value() ?? []).filter((e) =>
      this.editorModel().equipment.includes(e.equipment),
    ),
  );
  protected setExerciseEquipment(value: unknown) {
    if (typeof value === 'string')
      this.exerciseSearch.update((m) => ({ ...m, equipment: value }));
  }
  protected setRoutineGoal(value: unknown) {
    if (TRAINING_GOALS.includes(value as TrainingGoal))
      this.routineModel.update((m) => ({ ...m, goal: value as TrainingGoal }));
  }
  protected setRoutineLevel(value: unknown) {
    if (TRAINING_LEVELS.includes(value as GenerateRoutineInput['level']))
      this.routineModel.update((m) => ({
        ...m,
        level: value as GenerateRoutineInput['level'],
      }));
  }
  protected setRoutineEquipment(value: unknown) {
    if (Array.isArray(value))
      this.routineModel.update((m) => ({
        ...m,
        equipment: value.filter((e): e is Equipment => EQUIPMENT.includes(e)),
      }));
  }
  /** YouTube needs a VPN in Iran, so the button names where the video plays. */
  protected videoSite(url: string): 'آپارات' | 'یوتیوب' | null {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host === 'aparat.com') return 'آپارات';
    if (host === 'youtube.com' || host === 'youtu.be') return 'یوتیوب';
    return null;
  }
  protected exerciseName(slug: string) {
    return (
      this.exerciseCatalog.value()?.find((e) => e.slug === slug)?.name ?? slug
    );
  }
  protected showExercise(slug: string) {
    const exercise = this.exerciseCatalog.value()?.find((e) => e.slug === slug);
    if (exercise) this.selectedExercise.set(exercise);
  }
  protected async generateRoutine() {
    if (this.trainingBusy()) return;
    const parsed = generateRoutineSchema.safeParse(this.routineModel());
    if (!parsed.success) {
      this.trainingError.set(
        'نام و تجهیزات را بررسی کنید؛ جلسه‌ها ۱ تا ۷ در هفته‌اند و هفته و دقیقه باید دست‌کم ۱ باشند.',
      );
      return;
    }
    this.trainingBusy.set(true);
    this.trainingError.set('');
    try {
      await this.api.generateRoutine(parsed.data);
      this.routines.reload();
      this.creatorOpen.set(false);
      aioToast.success('برنامه ذخیره شد');
    } catch (error) {
      this.trainingError.set(apiErrorMessage(error));
    } finally {
      this.trainingBusy.set(false);
    }
  }
  protected startSession(routine: WorkoutRoutine, dayIndex: number) {
    this.trainingError.set('');
    this.sessionModel.set({
      routineId: routine.id,
      dayIndex,
      date: this.today,
      durationMin: routine.minutes,
      notes: '',
      sets: routine.days[dayIndex].exercises.flatMap((e) =>
        Array.from({ length: e.sets }, () => ({
          exerciseSlug: e.exerciseSlug,
          reps: 0,
          weightKg: 0,
          seconds: 0,
        })),
      ),
    });
    this.sessionOpen.set(true);
  }
  protected removeSet(index: number) {
    this.sessionModel.update((m) => ({
      ...m,
      sets: m.sets.filter((_, i) => i !== index),
    }));
  }
  protected async saveSession() {
    if (this.trainingBusy()) return;
    const parsed = logSessionSchema.safeParse(this.sessionModel());
    if (!parsed.success) {
      this.trainingError.set(
        'برای هر ست تکرار یا زمان واقعی را وارد کنید؛ ست‌های انجام‌نشده را حذف کنید. تاریخ، مدت و وزنه هم باید معتبر باشند.',
      );
      return;
    }
    this.trainingBusy.set(true);
    this.trainingError.set('');
    try {
      await this.api.logSession(parsed.data);
      this.sessionOpen.set(false);
      this.progress.reload();
      this.workouts.reload();
      this.week.reload();
      aioToast.success('ست‌های تمرین ثبت شد');
    } catch (error) {
      this.trainingError.set(apiErrorMessage(error));
    } finally {
      this.trainingBusy.set(false);
    }
  }
  protected editRoutine(routine: WorkoutRoutine) {
    this.editingRoutineId = routine.id;
    this.trainingError.set('');
    this.editorModel.set({
      title: routine.title,
      goal: routine.goal,
      level: routine.level,
      equipment: [...routine.equipment],
      daysPerWeek: routine.daysPerWeek,
      weeks: routine.weeks,
      minutes: routine.minutes,
      days: structuredClone(routine.days),
    });
    this.editorOpen.set(true);
  }
  protected changeRoutineExercise(
    dayIndex: number,
    exerciseIndex: number,
    value: unknown,
  ) {
    if (typeof value !== 'string') return;
    this.editorModel.update((m) => {
      const days = structuredClone(m.days);
      const exercise = this.exerciseCatalog
        .value()
        ?.find((e) => e.slug === value);
      if (exercise)
        days[dayIndex].exercises[exerciseIndex] = {
          ...days[dayIndex].exercises[exerciseIndex],
          exerciseSlug: value,
          seconds: exercise.timed ? 25 : 0,
        };
      return { ...m, days };
    });
  }
  protected async saveRoutine() {
    if (this.trainingBusy()) return;
    const parsed = saveRoutineSchema.safeParse(this.editorModel());
    if (!parsed.success) {
      this.trainingError.set(
        'نام و مقادیر حرکت‌ها را بررسی کنید؛ ست ۱ تا ۸، تکرار ۱ تا ۵۰ و استراحت ۱۵ تا ۳۰۰ ثانیه.',
      );
      return;
    }
    this.trainingBusy.set(true);
    this.trainingError.set('');
    try {
      await this.api.saveRoutine(this.editingRoutineId, parsed.data);
      this.editorOpen.set(false);
      this.routines.reload();
      aioToast.success('برنامه ویرایش شد');
    } catch (error) {
      this.trainingError.set(apiErrorMessage(error));
    } finally {
      this.trainingBusy.set(false);
    }
  }
  protected async removeRoutine(routine: WorkoutRoutine) {
    if (
      !(await this.confirm.ask({
        title: 'برنامه حذف شود؟',
        description: 'سابقه تمرین‌های ثبت‌شده باقی می‌ماند.',
        confirmText: 'حذف',
        destructive: true,
      }))
    )
      return;
    try {
      await this.api.removeRoutine(routine.id);
      this.routines.reload();
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

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
        this.progress.reload();
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
      this.progress.reload();
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }
}
