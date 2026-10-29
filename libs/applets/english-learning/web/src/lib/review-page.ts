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
  AioBadge,
  AioButton,
  AioCardDirectives,
  AioEmptyDirectives,
  AioIcon,
  AioProgressDirectives,
  AioSkeleton,
  aioToast,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage, faNumber } from '@all-in-one/web/shared';
import {
  lucideArrowRight,
  lucidePartyPopper,
  lucideVolume2,
} from '@ng-icons/lucide';
import { EnglishApi, speak } from './english-api';

const GRADE_VARIANT: Record<
  ReviewGrade,
  'destructive' | 'outline' | 'default' | 'secondary'
> = {
  again: 'destructive',
  hard: 'outline',
  good: 'default',
  easy: 'secondary',
};

@Component({
  selector: 'english-learning-review',
  imports: [
    AioBadge,
    AioButton,
    AioCardDirectives,
    AioEmptyDirectives,
    AioIcon,
    AioProgressDirectives,
    AioSkeleton,
    RouterLink,
  ],
  providers: [
    provideIcons({ lucideArrowRight, lucidePartyPopper, lucideVolume2 }),
  ],
  template: `
    <div class="mx-auto flex max-w-lg flex-col gap-4">
      <header class="flex items-center gap-2">
        <a
          aioBtn
          variant="ghost"
          size="icon"
          routerLink=".."
          aria-label="بازگشت"
        >
          <aio-icon name="lucideArrowRight" size="sm" />
        </a>
        <h1 class="text-xl font-bold">مرور امروز</h1>
        @if (total() > 0) {
          <span class="text-muted-foreground ms-auto text-sm"
            >{{ fa(Math.min(index() + 1, total())) }} / {{ fa(total()) }}</span
          >
        }
      </header>

      @if (total() > 0) {
        <div
          aioProgress
          [value]="index()"
          [max]="total()"
          aria-label="پیشرفت مرور"
        >
          <div aioProgressIndicator></div>
        </div>
      }

      @if (cards.isLoading() && !cards.hasValue()) {
        <div aioSkeleton class="h-72 rounded-3xl"></div>
      } @else if (current(); as card) {
        <section aioCard class="min-h-72">
          <div aioCardHeader class="items-center text-center">
            <div class="flex items-center justify-center gap-2">
              <h2 aioCardTitle dir="ltr" lang="en" class="text-3xl">
                {{ card.term }}
              </h2>
              <button
                aioBtn
                variant="ghost"
                size="icon"
                (click)="say(card.term)"
                aria-label="تلفظ"
              >
                <aio-icon name="lucideVolume2" />
              </button>
            </div>
            @if (card.partOfSpeech) {
              <span aioBadge variant="outline" dir="ltr" class="mx-auto">{{
                card.partOfSpeech
              }}</span>
            }
          </div>
          <div
            aioCardContent
            class="flex flex-col items-center gap-3 text-center"
          >
            @if (revealed()) {
              <p class="text-xl font-semibold">{{ card.meaningFa }}</p>
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
            } @else {
              <button
                aioBtn
                variant="outline"
                size="lg"
                (click)="revealed.set(true)"
              >
                نمایش معنی
              </button>
            }
          </div>
        </section>
        @if (revealed()) {
          <div
            class="grid grid-cols-2 gap-2 sm:grid-cols-4"
            role="group"
            aria-label="چقدر بلد بودید؟"
          >
            @for (grade of grades; track grade) {
              <button
                aioBtn
                size="lg"
                [variant]="gradeVariant[grade]"
                [disabled]="sending()"
                (click)="answer(card, grade)"
              >
                {{ gradeLabels[grade] }}
              </button>
            }
          </div>
        }
      } @else {
        <div aioEmpty class="glass rounded-3xl">
          <div aioEmptyHeader>
            <div aioEmptyMedia variant="icon">
              <aio-icon name="lucidePartyPopper" />
            </div>
            <h2 aioEmptyTitle>
              {{
                total() > 0
                  ? 'مرور امروز تمام شد!'
                  : 'فعلاً واژه‌ای برای مرور نیست'
              }}
            </h2>
            <p aioEmptyDescription>
              {{
                total() > 0
                  ? fa(total()) + ' واژه مرور کردید. فردا دوباره سر بزنید.'
                  : 'از صفحه قبل یک مجموعه واژه را شروع کنید.'
              }}
            </p>
          </div>
          <div aioEmptyContent>
            <a aioBtn routerLink="..">بازگشت</a>
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
  protected readonly gradeVariant = GRADE_VARIANT;

  protected readonly cards = httpResource<ReviewCard[]>(
    () => `${this.api.base}/review?limit=20`,
  );
  protected readonly index = signal(0);
  protected readonly revealed = signal(false);
  protected readonly sending = signal(false);
  protected readonly total = computed(() => this.cards.value()?.length ?? 0);
  protected readonly current = computed(
    () => this.cards.value()?.[this.index()] ?? null,
  );
  protected readonly fa = (n: number) => faNumber(n);

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
      this.revealed.set(false);
      this.index.update((i) => i + 1);
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.sending.set(false);
    }
  }
}
