import { httpResource } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  EQUIPMENT_LABELS,
  type CompletedSet,
  type Exercise,
  type WorkoutRoutine,
} from '@all-in-one/applets/health/contracts';
import { toIsoDate } from '@all-in-one/shared/schemas';
import {
  AioAccordionContent,
  AioAccordionDirectives,
  AioAccordionTrigger,
  AioBadge,
  AioButton,
  AioSkeleton,
  AioCardDirectives,
  AioConfirm,
  AioProgressDirectives,
  aioToast,
} from '@all-in-one/ui';
import { apiErrorMessage, faNumber } from '@all-in-one/web/shared';
import { HealthApi } from './health-api';
import { prescribedSet, trainingSessionSteps } from './training-session-steps';

@Component({
  selector: 'health-training-session-page',
  imports: [
    RouterLink,
    AioAccordionContent,
    AioAccordionDirectives,
    AioAccordionTrigger,
    AioBadge,
    AioButton,
    AioSkeleton,
    AioCardDirectives,
    AioProgressDirectives,
  ],
  template: `
    <div class="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-4">
      <a aioBtn variant="ghost" routerLink="../.." class="self-start"
        >بازگشت به ورزش</a
      >
      <h2 #heading tabindex="-1" class="text-xl font-bold outline-none">
        {{ routine.value()?.title ?? 'جلسه تمرین' }}
      </h2>
      @if (routine.isLoading()) {
        <div
          class="flex flex-col gap-4"
          role="status"
          aria-label="در حال دریافت جلسه"
        >
          <div
            aioSkeleton
            class="h-5 w-1/2 rounded-lg"
            aria-hidden="true"
          ></div>
          <div
            aioSkeleton
            class="h-2 w-full rounded-full"
            aria-hidden="true"
          ></div>
          <div aioSkeleton class="h-80 rounded-3xl" aria-hidden="true"></div>
          <div aioSkeleton class="h-12 rounded-2xl" aria-hidden="true"></div>
        </div>
      } @else if (routine.error()) {
        <p role="alert">دریافت برنامه ممکن نشد.</p>
        <button aioBtn variant="outline" (click)="routine.reload()">
          تلاش دوباره
        </button>
      } @else if (!day()) {
        <p role="alert">این جلسه در برنامه وجود ندارد.</p>
      } @else {
        <p class="text-muted-foreground">{{ day()?.title }}</p>
        <div class="flex flex-col gap-2">
          <p class="text-sm" role="status">
            {{ fa(completed().length) }} از {{ fa(steps().length) }} ست انجام
            شده
          </p>
          <div aioProgress [value]="progress()" aria-label="پیشرفت جلسه">
            <div aioProgressIndicator></div>
          </div>
        </div>
        @if (phase() === 'warmup') {
          <section aioCard>
            <div aioCardHeader>
              <h3 aioCardTitle>اول گرم کن</h3>
              <p aioCardDescription>
                بعد از گرم کردن، ست‌ها را یکی‌یکی طبق برنامه انجام می‌دهیم.
              </p>
            </div>
            <div aioCardContent class="flex flex-col gap-3">
              @for (line of routine.value()?.warmup ?? []; track $index) {
                <p>{{ line }}</p>
              }
            </div>
            <div aioCardFooter>
              <button aioBtn class="min-h-11 w-full" (click)="start()">
                گرم کردم؛ شروع تمرین
              </button>
            </div>
          </section>
        } @else if (phase() === 'rest') {
          <section aioCard>
            <div aioCardHeader>
              <h3 aioCardTitle>کمی استراحت کن</h3>
              <p aioCardDescription>
                ست قبلی انجام شد؛ قبل از ادامه {{ fa(restSeconds()) }} ثانیه
                استراحت کن.
              </p>
            </div>
            <div aioCardContent>
              <p>
                بعدی: {{ nextExerciseName() }}، ست
                {{ fa(current()?.setNumber ?? 1) }}
              </p>
            </div>
            <div aioCardFooter>
              <button
                aioBtn
                class="min-h-11 w-full"
                (click)="continueExercise()"
              >
                استراحت کردم؛ مرحله بعد
              </button>
            </div>
          </section>
        } @else if (phase() === 'exercise') {
          @if (current(); as step) {
            <section aioCard>
              <div aioCardHeader class="gap-3">
                <div class="flex flex-wrap gap-2">
                  <span aioBadge variant="secondary"
                    >حرکت {{ fa(step.exerciseIndex + 1) }} از
                    {{ fa(day()?.exercises?.length ?? 0) }}</span
                  >
                  <span aioBadge variant="outline"
                    >ست {{ fa(step.setNumber) }} از {{ fa(step.sets) }}</span
                  >
                </div>
                <h3 aioCardTitle class="text-xl">
                  {{ exercise.value()?.name ?? 'در حال دریافت حرکت…' }}
                </h3>
                <p class="text-2xl font-bold">
                  @if (step.seconds > 0) {
                    {{ fa(step.seconds) }} ثانیه
                  } @else {
                    {{ fa(step.reps) }} تکرار
                  }
                </p>
                @if (exercise.value(); as movement) {
                  <p aioCardDescription>
                    {{ equipmentLabels[movement.equipment] }}
                  </p>
                  @if (recordedSet()?.weightKg; as weight) {
                    <p>وزنهٔ این ست: {{ fa(weight) }} کیلوگرم</p>
                  }
                  @if (movement.guide?.eachSide) {
                    <p class="text-sm">برای هر سمت انجام بده.</p>
                  }
                }
              </div>
              <div aioCardContent class="flex flex-col gap-4">
                @if (exercise.error()) {
                  <p role="alert">راهنمای حرکت دریافت نشد.</p>
                  <button aioBtn variant="outline" (click)="exercise.reload()">
                    تلاش دوباره
                  </button>
                }
                @if (exercise.value(); as movement) {
                  @if (movement.guide; as guide) {
                    <img
                      [src]="guide.imageUrl"
                      [alt]="'روش اجرای ' + movement.name"
                      width="1400"
                      height="700"
                      class="h-auto max-h-72 w-full rounded-lg bg-white object-contain"
                    />
                  }
                  <div aioAccordion type="single">
                    <div aioAccordionItem>
                      <aio-accordion-trigger
                        >راهنمای اجرای حرکت</aio-accordion-trigger
                      >
                      <aio-accordion-content>
                        <div class="flex flex-col gap-4">
                          <ol
                            class="flex list-inside [list-style-type:persian] flex-col gap-2"
                          >
                            @for (
                              instruction of movement.instructions;
                              track $index
                            ) {
                              <li>{{ instruction }}</li>
                            }
                          </ol>
                          @if (movement.mistakes.length) {
                            <h4 class="font-semibold">اشتباهات رایج</h4>
                            <ul
                              class="flex list-inside list-disc flex-col gap-2"
                            >
                              @for (
                                mistake of movement.mistakes;
                                track $index
                              ) {
                                <li>{{ mistake }}</li>
                              }
                            </ul>
                          }
                        </div>
                      </aio-accordion-content>
                    </div>
                  </div>
                  @if (movement.videoUrl) {
                    <a
                      aioBtn
                      variant="outline"
                      class="min-h-11"
                      [href]="movement.videoUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      >دیدن ویدئوی آموزش (پنجره جدید)</a
                    >
                  }
                }
              </div>
              <div aioCardFooter>
                <button
                  aioBtn
                  class="min-h-11 w-full"
                  [disabled]="!recordedSet()"
                  (click)="completeSet()"
                >
                  این ست را انجام دادم
                </button>
              </div>
            </section>
          }
        } @else if (phase() === 'cooldown') {
          <section aioCard>
            <div aioCardHeader>
              <h3 aioCardTitle>ست‌ها تمام شد؛ حالا سرد کن</h3>
              <p aioCardDescription>بعد از سرد کردن، جلسه را ثبت کن.</p>
            </div>
            <div aioCardContent class="flex flex-col gap-3">
              @for (line of routine.value()?.cooldown ?? []; track $index) {
                <p>{{ line }}</p>
              }
              @if (saveError()) {
                <p role="alert" class="text-destructive">{{ saveError() }}</p>
              }
            </div>
            <div aioCardFooter>
              <button
                aioBtn
                class="min-h-11 w-full"
                [disabled]="saving()"
                (click)="finish()"
              >
                {{ saving() ? 'در حال ثبت…' : 'سرد کردم؛ ثبت جلسه' }}
              </button>
            </div>
          </section>
        } @else {
          <section aioCard>
            <div aioCardHeader>
              <h3 aioCardTitle>خسته نباشی! جلسه ثبت شد</h3>
              <p aioCardDescription>
                {{ fa(completed().length) }} ست را طبق برنامه انجام دادی.
              </p>
            </div>
            <div aioCardFooter>
              <a aioBtn routerLink="../.." class="min-h-11 w-full"
                >برگشت به ورزش</a
              >
            </div>
          </section>
        }
      }
    </div>
  `,
})
export class TrainingSessionPage {
  readonly routineId = input.required<string>();
  readonly dayIndex = input.required<string>();
  private readonly api = inject(HealthApi);
  private readonly confirm = inject(AioConfirm);
  private readonly injector = inject(Injector);
  private readonly heading =
    viewChild<ElementRef<HTMLHeadingElement>>('heading');
  private startedAt = 0;
  private sessionDate = '';
  protected readonly fa = faNumber;
  protected readonly equipmentLabels = EQUIPMENT_LABELS;
  protected readonly phase = signal<
    'warmup' | 'exercise' | 'rest' | 'cooldown' | 'done'
  >('warmup');
  protected readonly completed = signal<CompletedSet[]>([]);
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly routine = httpResource<WorkoutRoutine>(
    () => `${this.api.base}/routines/${encodeURIComponent(this.routineId())}`,
  );
  protected readonly day = computed(() => {
    const index = Number(this.dayIndex());
    return Number.isInteger(index) && index >= 0
      ? this.routine.value()?.days[index]
      : undefined;
  });
  protected readonly steps = computed(() => trainingSessionSteps(this.day()));
  protected readonly current = computed<
    ReturnType<typeof trainingSessionSteps>[number] | undefined
  >(() => this.steps()[this.completed().length]);
  protected readonly progress = computed(() =>
    this.steps().length
      ? (this.completed().length / this.steps().length) * 100
      : 0,
  );
  private readonly currentSlug = computed(() => this.current()?.exerciseSlug);
  protected readonly exercise = httpResource<Exercise>(() => {
    const slug = this.currentSlug();
    return slug
      ? `${this.api.base}/exercises/${encodeURIComponent(slug)}`
      : undefined;
  });
  protected readonly recordedSet = computed(() => {
    const step = this.current();
    const movement = this.exercise.value();
    return step && movement ? prescribedSet(step, movement) : undefined;
  });
  protected readonly restSeconds = computed(
    () => this.steps()[this.completed().length - 1]?.restSeconds ?? 0,
  );
  protected readonly nextExerciseName = computed(
    () => this.exercise.value()?.name ?? 'حرکت بعدی',
  );

  constructor() {
    this.focusStart();
  }

  private focusStart() {
    afterNextRender(
      () => {
        const heading = this.heading()?.nativeElement;
        heading?.focus({ preventScroll: true });
        heading?.scrollIntoView({ block: 'start', behavior: 'instant' });
      },
      { injector: this.injector },
    );
  }

  protected start() {
    if (this.phase() !== 'warmup' || !this.steps().length) return;
    this.startedAt = Date.now();
    this.sessionDate = toIsoDate(new Date());
    this.phase.set('exercise');
    this.focusStart();
  }

  protected completeSet() {
    const set = this.recordedSet();
    if (this.phase() !== 'exercise' || !set) return;
    this.completed.update((sets) => [...sets, set]);
    this.phase.set(
      this.completed().length === this.steps().length ? 'cooldown' : 'rest',
    );
    this.focusStart();
  }

  protected continueExercise() {
    if (this.phase() !== 'rest') return;
    this.phase.set('exercise');
    this.focusStart();
  }

  protected async finish() {
    if (this.saving() || this.phase() !== 'cooldown') return;
    this.saving.set(true);
    this.saveError.set('');
    try {
      await this.api.logSession({
        routineId: this.routineId(),
        dayIndex: Number(this.dayIndex()),
        date: this.sessionDate,
        durationMin: Math.min(
          600,
          Math.max(1, Math.round((Date.now() - this.startedAt) / 60000)),
        ),
        sets: this.completed(),
      });
      this.phase.set('done');
      aioToast.success('جلسه تمرین ثبت شد');
      this.focusStart();
    } catch (error) {
      this.saveError.set(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  canLeave(): boolean | Promise<boolean> {
    if (this.saving()) return false;
    if (this.phase() === 'warmup' || this.phase() === 'done') return true;
    return this.confirm.ask({
      title: 'از جلسه خارج می‌شوی؟',
      description:
        'این جلسه هنوز ثبت نشده است. با خروج، پیشرفت این جلسه از دست می‌رود.',
      confirmText: 'خروج از جلسه',
      destructive: true,
    });
  }
}
