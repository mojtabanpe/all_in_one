import { httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  REVIEW_GRADE_LABELS,
  REVIEW_GRADES,
  type ReviewCard,
  type ReviewGrade,
} from '@all-in-one/applets/english-learning/contracts';
import {
  AioButton,
  AioEmptyDirectives,
  AioIcon,
  AioProgressDirectives,
  AioSkeleton,
  aioToast,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage, faNumber } from '@all-in-one/web/shared';
import {
  lucideBookOpen,
  lucidePartyPopper,
  lucideTarget,
  lucideVolume2,
  lucideX,
  lucideZap,
} from '@ng-icons/lucide';
import { EnglishApi, speak } from './english-api';

/** Session points per answer, shown in the end-of-session celebration. */
const POINTS: Record<ReviewGrade, number> = {
  again: 2,
  hard: 6,
  good: 10,
  easy: 12,
};

/**
 * 3D answer buttons (Duolingo style): each grade recolours the button by
 * overriding spartan's --primary (and the 3D edge) on the button itself.
 * Class strings stay literal so Tailwind can find them.
 */
const GRADE_STYLE: Record<
  ReviewGrade,
  { variant: 'default' | 'outline'; class: string }
> = {
  again: {
    variant: 'default',
    class:
      '[--primary:var(--destructive)] [--primary-edge:color-mix(in_oklch,var(--destructive)_72%,black)]',
  },
  hard: { variant: 'outline', class: 'btn-3d-quiet border-2' },
  good: { variant: 'default', class: '' },
  easy: {
    variant: 'default',
    class:
      '[--primary:var(--gem)] [--primary-edge:color-mix(in_oklch,var(--gem)_72%,black)]',
  },
};

@Component({
  selector: 'english-learning-review',
  imports: [
    AioButton,
    AioEmptyDirectives,
    AioIcon,
    AioProgressDirectives,
    AioSkeleton,
    RouterLink,
  ],
  providers: [
    provideIcons({
      lucideBookOpen,
      lucidePartyPopper,
      lucideTarget,
      lucideVolume2,
      lucideX,
      lucideZap,
    }),
  ],
  template: `
    <div
      class="applet-english mx-auto flex min-h-[calc(100dvh-var(--bottom-nav-space)-6rem)] max-w-lg flex-col gap-6"
    >
      <header class="flex items-center gap-3">
        <a
          aioBtn
          variant="ghost"
          size="icon"
          routerLink=".."
          aria-label="پایان مرور"
        >
          <aio-icon name="lucideX" />
        </a>
        <div
          aioProgress
          class="bg-muted h-4 flex-1 rounded-full"
          [value]="(100 * index()) / Math.max(total(), 1)"
          aria-label="پیشرفت مرور"
        >
          <div aioProgressIndicator class="rounded-full"></div>
        </div>
      </header>

      @if (cards.isLoading() && !cards.hasValue()) {
        <div aioSkeleton class="h-72 rounded-3xl"></div>
      } @else if (current(); as card) {
        <h1 class="text-xl font-bold">این واژه را بلدی؟</h1>

        <section
          class="glass flex flex-col items-center gap-4 rounded-3xl border-2 border-b-4 p-6 text-center"
          aria-live="polite"
        >
          <div class="flex items-center gap-3" dir="ltr">
            <button
              aioBtn
              size="icon-lg"
              class="btn-3d size-12 rounded-2xl [--primary-edge:color-mix(in_oklch,var(--gem)_72%,black)] [--primary:var(--gem)]"
              (click)="say(card.term)"
              aria-label="تلفظ"
            >
              <aio-icon name="lucideVolume2" />
            </button>
            <h2 lang="en" class="text-4xl font-bold">{{ card.term }}</h2>
          </div>
          @if (card.partOfSpeech) {
            <span dir="ltr" lang="en" class="text-muted-foreground text-sm">{{
              card.partOfSpeech
            }}</span>
          }
          @if (revealed()) {
            <div class="border-border/70 flex w-full flex-col gap-2 border-t pt-4">
              <p class="text-2xl font-bold">{{ card.meaningFa }}</p>
              @if (card.example) {
                <p dir="ltr" lang="en" class="text-muted-foreground">
                  {{ card.example }}
                </p>
              }
              @if (card.exampleFa) {
                <p class="text-muted-foreground text-sm">
                  {{ card.exampleFa }}
                </p>
              }
            </div>
          }
        </section>

        <div class="mt-auto flex flex-col gap-3">
          @if (revealed()) {
            <p class="text-sm font-bold">چقدر بلد بودی؟</p>
            <div
              class="grid grid-cols-2 gap-3"
              role="group"
              aria-label="چقدر بلد بودی؟"
            >
              @for (grade of grades; track grade) {
                <button
                  aioBtn
                  size="lg"
                  class="btn-3d h-14 rounded-2xl"
                  [variant]="gradeStyle[grade].variant"
                  [class]="gradeStyle[grade].class"
                  [disabled]="sending()"
                  (click)="answer(card, grade)"
                >
                  {{ gradeLabels[grade] }}
                </button>
              }
            </div>
          } @else {
            <button
              aioBtn
              size="lg"
              class="btn-3d h-14 w-full rounded-2xl"
              (click)="revealed.set(true)"
            >
              نمایش معنی
            </button>
          }
        </div>
      } @else if (total() > 0) {
        <section
          class="flex flex-1 flex-col items-center justify-center gap-6 text-center"
          aria-live="polite"
        >
          <div
            class="bg-primary/15 text-primary flex size-24 items-center justify-center rounded-full"
          >
            <aio-icon name="lucidePartyPopper" size="xl" />
          </div>
          <div class="flex flex-col gap-2">
            <h1 class="text-primary text-3xl font-bold">آفرین! تمامش کردی</h1>
            <p class="text-muted-foreground">
              مرور امروز تمام شد. فردا برگرد تا شعله‌ات روشن بماند.
            </p>
          </div>
          <div class="grid w-full grid-cols-3 gap-3">
            @for (tile of summary(); track tile.label) {
              <div
                class="flex flex-col overflow-hidden rounded-2xl border-2"
                [style.border-color]="tile.color"
              >
                <span
                  class="py-1 text-sm font-bold text-white"
                  [style.background-color]="tile.color"
                  >{{ tile.label }}</span
                >
                <span
                  class="flex items-center justify-center gap-1 py-3 text-lg font-bold"
                  [style.color]="tile.color"
                >
                  <aio-icon [name]="tile.icon" size="sm" />{{ tile.value }}
                </span>
              </div>
            }
          </div>
          <a
            aioBtn
            size="lg"
            class="btn-3d mt-auto h-14 w-full rounded-2xl"
            routerLink=".."
            >ادامه</a
          >
        </section>
      } @else {
        <div aioEmpty class="glass rounded-3xl">
          <div aioEmptyHeader>
            <div aioEmptyMedia variant="icon" class="text-primary">
              <aio-icon name="lucideBookOpen" />
            </div>
            <h1 aioEmptyTitle>فعلاً واژه‌ای برای مرور نیست</h1>
            <p aioEmptyDescription>
              از مسیر یادگیری یک مجموعه واژه را شروع کن.
            </p>
          </div>
          <div aioEmptyContent>
            <a aioBtn class="btn-3d" routerLink="..">بازگشت به مسیر</a>
          </div>
        </div>
      }
    </div>
  `,
})
export class ReviewPage {
  private readonly api = inject(EnglishApi);
  protected readonly Math = Math;
  protected readonly grades = REVIEW_GRADES;
  protected readonly gradeLabels = REVIEW_GRADE_LABELS;
  protected readonly gradeStyle = GRADE_STYLE;

  protected readonly cards = httpResource<ReviewCard[]>(
    () => `${this.api.base}/review?limit=20`,
  );
  protected readonly index = signal(0);
  protected readonly revealed = signal(false);
  protected readonly sending = signal(false);
  private readonly known = signal(0);
  private readonly points = signal(0);
  protected readonly total = computed(() => this.cards.value()?.length ?? 0);
  protected readonly current = computed(
    () => this.cards.value()?.[this.index()] ?? null,
  );
  protected readonly summary = computed(() => [
    {
      label: 'امتیاز',
      value: faNumber(this.points()),
      icon: 'lucideZap',
      color: 'var(--streak)',
    },
    {
      label: 'واژه',
      value: faNumber(this.total()),
      icon: 'lucideBookOpen',
      color: 'var(--gem)',
    },
    {
      label: 'بلد بودی',
      value: `٪${faNumber(Math.round((this.known() / Math.max(this.total(), 1)) * 100))}`,
      icon: 'lucideTarget',
      color: 'var(--primary)',
    },
  ]);

  constructor() {
    // Pronounce each new card once.
    effect(() => {
      const card = this.current();
      if (card) speak(card.term);
    });
  }

  protected say(term: string) {
    speak(term);
  }

  protected async answer(card: ReviewCard, grade: ReviewGrade) {
    this.sending.set(true);
    try {
      await this.api.review(card.wordId, grade);
      if (grade === 'good' || grade === 'easy') this.known.update((n) => n + 1);
      this.points.update((p) => p + POINTS[grade]);
      this.revealed.set(false);
      this.index.update((i) => i + 1);
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.sending.set(false);
    }
  }
}
