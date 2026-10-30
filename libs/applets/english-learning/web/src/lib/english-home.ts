import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  required,
  submit,
} from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import type {
  EnglishDeckSummary,
  EnglishStats,
  ReviewCard,
} from '@all-in-one/applets/english-learning/contracts';
import {
  AioButton,
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
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage, faNumber } from '@all-in-one/web/shared';
import {
  lucideBookOpen,
  lucideCrown,
  lucideFlame,
  lucideGem,
  lucidePlus,
  lucideStar,
  lucideTrash2,
  lucideVolume2,
} from '@ng-icons/lucide';
import { EnglishApi, speak } from './english-api';

@Component({
  selector: 'english-learning-home',
  imports: [
    AioButton,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioFieldDirectives,
    AioFieldError,
    AioIcon,
    AioInput,
    AioProgressDirectives,
    AioSkeleton,
    FormField,
    FormRoot,
    RouterLink,
  ],
  providers: [
    provideIcons({
      lucideBookOpen,
      lucideCrown,
      lucideFlame,
      lucideGem,
      lucidePlus,
      lucideStar,
      lucideTrash2,
      lucideVolume2,
    }),
  ],
  template: `
    <div class="applet-english mx-auto flex w-full max-w-xl flex-col gap-6">
      <header class="flex items-center justify-between gap-3">
        <h1 class="text-2xl font-bold">انگلیسی</h1>
        <div class="flex items-center gap-4 text-base font-bold">
          <span
            class="flex items-center gap-1"
            [class.text-[var(--streak)]]="streak() > 0"
            [class.text-muted-foreground]="streak() === 0"
            [attr.aria-label]="fa(streak()) + ' روز پیاپی'"
          >
            <aio-icon name="lucideFlame" />{{ fa(streak()) }}
          </span>
          <span
            class="flex items-center gap-1 text-[var(--gem)]"
            [attr.aria-label]="fa(stats.value()?.mastered ?? 0) + ' واژه یادگرفته'"
          >
            <aio-icon name="lucideGem" />{{ fa(stats.value()?.mastered ?? 0) }}
          </span>
        </div>
      </header>

      <section
        class="glass flex flex-col items-center gap-4 rounded-3xl border-2 border-b-4 p-6 text-center"
      >
        @if (due() > 0) {
          <div
            class="bg-primary text-primary-foreground flex size-16 items-center justify-center rounded-full shadow-[0_0.25rem_0_var(--primary-edge)]"
          >
            <aio-icon name="lucideBookOpen" size="lg" />
          </div>
          <div class="flex flex-col gap-1">
            <h2 class="text-xl font-bold">مرور امروز</h2>
            <p class="text-muted-foreground">
              {{ fa(due()) }} واژه منتظرت است، حدود
              {{ fa(minutes()) }} دقیقه.
            </p>
          </div>
          <a
            aioBtn
            size="lg"
            routerLink="review"
            class="btn-3d h-14 w-full rounded-2xl"
            >شروع مرور</a
          >
        } @else {
          <div
            class="flex size-16 items-center justify-center rounded-full bg-[var(--streak)]/15 text-[var(--streak)]"
          >
            <aio-icon name="lucideFlame" size="lg" />
          </div>
          <div class="flex flex-col gap-1">
            <h2 class="text-xl font-bold">
              {{
                (stats.value()?.reviewedToday ?? 0) > 0
                  ? 'امروز کامل شد!'
                  : 'امروز چیزی برای مرور نیست'
              }}
            </h2>
            <p class="text-muted-foreground">
              {{
                (stats.value()?.reviewedToday ?? 0) > 0
                  ? fa(stats.value()!.reviewedToday) +
                    ' واژه مرور کردی. فردا برگرد تا شعله روشن بماند.'
                  : 'یک مجموعه از مسیر پایین شروع کن تا واژه‌ها وارد مرور شوند.'
              }}
            </p>
          </div>
        }
      </section>

      <section class="flex flex-col gap-4" aria-labelledby="path-title">
        <h2 id="path-title" class="text-lg font-bold">مسیر یادگیری</h2>
        @if (decks.isLoading() && !decks.hasValue()) {
          <div class="flex flex-col items-center gap-6">
            @for (i of [0, 1, 2]; track i) {
              <div aioSkeleton class="size-18 rounded-full"></div>
            }
          </div>
        } @else {
          <ol class="flex flex-col items-center gap-5 py-2">
            @for (deck of decks.value() ?? []; track deck.slug; let i = $index) {
              <li
                class="flex w-40 flex-col items-center gap-2 text-center"
                [style.transform]="'translateX(' + zigzag[i % 4] + 'rem)'"
              >
                <button
                  aioBtn
                  class="btn-3d size-18 rounded-full"
                  [class]="nodeClass(deck)"
                  [variant]="deck.started === 0 ? 'outline' : 'default'"
                  (click)="openDeck.set(deck)"
                  [attr.aria-label]="deck.title + '، ' + deckState(deck)"
                >
                  <aio-icon [name]="nodeIcon(deck)" size="lg" />
                </button>
                <span class="font-bold">{{ deck.title }}</span>
                <span class="text-muted-foreground text-xs">
                  <span dir="ltr">{{ deck.level }}</span>،
                  {{ deckState(deck) }}
                </span>
              </li>
            }
          </ol>
        }
      </section>

      <section class="flex flex-col gap-3" aria-labelledby="words-title">
        <div class="flex items-center justify-between">
          <h2 id="words-title" class="text-lg font-bold">واژه‌های من</h2>
          <button
            aioBtn
            variant="outline"
            class="btn-3d btn-3d-quiet rounded-xl border-2"
            (click)="adding.set(true)"
          >
            <aio-icon name="lucidePlus" size="sm" />
            واژه جدید
          </button>
        </div>
        @if ((myWords.value() ?? []).length === 0) {
          <p class="text-muted-foreground text-sm">
            واژه‌هایی که خودت اضافه کنی اینجا می‌آیند و وارد مرور می‌شوند.
          </p>
        } @else {
          <ul class="glass divide-border/60 flex flex-col divide-y rounded-2xl">
            @for (word of myWords.value() ?? []; track word.wordId) {
              <li class="flex min-h-14 items-center gap-2 px-3">
                <div class="flex min-w-0 flex-1 flex-col py-2">
                  <span dir="ltr" lang="en" class="truncate text-end font-bold">{{
                    word.term
                  }}</span>
                  <span class="text-muted-foreground truncate text-sm">{{
                    word.meaningFa
                  }}</span>
                </div>
                <button
                  aioBtn
                  variant="ghost"
                  size="icon"
                  (click)="say(word.term)"
                  [attr.aria-label]="'تلفظ ' + word.term"
                >
                  <aio-icon name="lucideVolume2" size="sm" />
                </button>
                <button
                  aioBtn
                  variant="ghost"
                  size="icon"
                  (click)="remove(word)"
                  [attr.aria-label]="'حذف ' + word.term"
                >
                  <aio-icon name="lucideTrash2" size="sm" />
                </button>
              </li>
            }
          </ul>
        }
      </section>
    </div>

    <aio-dialog
      [open]="!!openDeck()"
      (openChange)="$event || openDeck.set(null)"
      [title]="openDeck()?.title ?? ''"
      [description]="openDeck()?.description ?? ''"
      contentClass="applet-english"
    >
      <ng-template aioDialogBody>
        @if (openDeck(); as deck) {
          <div class="flex flex-col gap-2">
            <div
              aioProgress
              class="h-3 rounded-full"
              [value]="(100 * deck.started) / (deck.wordCount || 1)"
              [attr.aria-label]="'پیشرفت ' + deck.title"
            >
              <div aioProgressIndicator class="rounded-full"></div>
            </div>
            <p class="text-muted-foreground text-sm">
              {{ fa(deck.started) }} از {{ fa(deck.wordCount) }} واژه در مرور،
              {{ fa(deck.mastered) }} یادگرفته
            </p>
          </div>
        }
      </ng-template>
      <ng-template aioDialogActions>
        @if (openDeck(); as deck) {
          <button
            aioBtn
            size="lg"
            class="btn-3d h-12 w-full rounded-2xl"
            [disabled]="deck.started === deck.wordCount || starting() === deck.slug"
            (click)="start(deck)"
          >
            {{
              deck.started === 0
                ? 'شروع، +' + fa(deck.wordCount) + ' واژه'
                : deck.started === deck.wordCount
                  ? 'همه واژه‌ها در مرورند'
                  : 'افزودن ' + fa(deck.wordCount - deck.started) + ' واژه باقی‌مانده'
            }}
          </button>
        }
      </ng-template>
    </aio-dialog>

    <aio-dialog
      [(open)]="adding"
      title="واژه جدید"
      description="معنی فارسی و یک مثال، یادگیری را ساده‌تر می‌کند."
    >
      <ng-template aioDialogBody>
        <form
          id="english-word-form"
          class="flex flex-col gap-4"
          [formRoot]="wordForm"
          (submit)="$event.preventDefault(); addWord()"
        >
          <div aioField>
            <label aioFieldLabel for="word-term">واژه انگلیسی</label>
            <input
              aioInput
              id="word-term"
              dir="ltr"
              lang="en"
              autocomplete="off"
              [formField]="wordForm.term"
            />
            @for (error of wordForm.term().errors(); track error.kind) {
              <aio-field-error [validator]="error.kind">{{
                error.message
              }}</aio-field-error>
            }
          </div>
          <div aioField>
            <label aioFieldLabel for="word-meaning">معنی فارسی</label>
            <input
              aioInput
              id="word-meaning"
              [formField]="wordForm.meaningFa"
            />
            @for (error of wordForm.meaningFa().errors(); track error.kind) {
              <aio-field-error [validator]="error.kind">{{
                error.message
              }}</aio-field-error>
            }
          </div>
          <div aioField>
            <label aioFieldLabel for="word-example">مثال (اختیاری)</label>
            <input
              aioInput
              id="word-example"
              dir="ltr"
              lang="en"
              [formField]="wordForm.example"
            />
          </div>
        </form>
      </ng-template>
      <ng-template aioDialogActions>
        <button aioBtn variant="outline" (click)="adding.set(false)">
          انصراف
        </button>
        <button aioBtn type="submit" form="english-word-form">افزودن</button>
      </ng-template>
    </aio-dialog>
  `,
})
export class EnglishHome {
  private readonly api = inject(EnglishApi);
  private readonly confirm = inject(AioConfirm);

  protected readonly stats = httpResource<EnglishStats>(
    () => `${this.api.base}/stats`,
  );
  protected readonly decks = httpResource<EnglishDeckSummary[]>(
    () => `${this.api.base}/decks`,
  );
  protected readonly myWords = httpResource<ReviewCard[]>(
    () => `${this.api.base}/words`,
  );
  protected readonly starting = signal<string | null>(null);
  protected readonly adding = signal(false);

  protected readonly wordModel = signal({
    term: '',
    meaningFa: '',
    example: '',
  });
  protected readonly wordForm = form(this.wordModel, (path) => {
    required(path.term, { message: 'واژه را بنویسید.' });
    required(path.meaningFa, { message: 'معنی را بنویسید.' });
  });

  protected readonly openDeck = signal<EnglishDeckSummary | null>(null);
  /** Horizontal offsets (rem) that make the deck path zigzag. */
  protected readonly zigzag = [0, 2.75, 0, -2.75];

  protected readonly fa = (n: number) => faNumber(n);
  protected readonly due = computed(() => this.stats.value()?.dueNow ?? 0);
  protected readonly streak = computed(
    () => this.stats.value()?.streakDays ?? 0,
  );
  /** About 20 seconds per card. */
  protected readonly minutes = computed(() =>
    Math.max(1, Math.round(Math.min(this.due(), 20) / 3)),
  );

  protected deckState(deck: EnglishDeckSummary): string {
    if (deck.started === 0) return 'شروع نشده';
    if (deck.mastered === deck.wordCount) return 'کامل!';
    return `${faNumber(deck.started)} از ${faNumber(deck.wordCount)}`;
  }

  protected nodeIcon(deck: EnglishDeckSummary): string {
    if (deck.wordCount > 0 && deck.mastered === deck.wordCount)
      return 'lucideCrown';
    return deck.started > 0 ? 'lucideStar' : 'lucideBookOpen';
  }

  /** Path node colour: grey before starting, green in progress, gold when mastered. */
  protected nodeClass(deck: EnglishDeckSummary): string {
    if (deck.started === 0) return 'btn-3d-quiet text-muted-foreground border-2';
    if (deck.mastered === deck.wordCount)
      return '[--primary:var(--streak)] [--primary-edge:color-mix(in_oklch,var(--streak)_72%,black)]';
    return '';
  }

  protected say(term: string) {
    speak(term);
  }

  protected async start(deck: EnglishDeckSummary) {
    this.starting.set(deck.slug);
    try {
      const { added } = await this.api.startDeck(deck.slug);
      aioToast.success(`${faNumber(added)} واژه به مرور اضافه شد`);
      this.openDeck.set(null);
      this.decks.reload();
      this.stats.reload();
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.starting.set(null);
    }
  }

  protected addWord() {
    submit(this.wordForm, async () => {
      const { term, meaningFa, example } = this.wordModel();
      try {
        await this.api.addWord({
          term: term.trim(),
          meaningFa: meaningFa.trim(),
          example: example.trim() || undefined,
        });
        this.wordModel.set({ term: '', meaningFa: '', example: '' });
        this.wordForm().reset();
        this.adding.set(false);
        aioToast.success('واژه اضافه شد');
        this.myWords.reload();
        this.stats.reload();
      } catch (error) {
        aioToast.error(apiErrorMessage(error));
      }
    });
  }

  protected async remove(word: ReviewCard) {
    const ok = await this.confirm.ask({
      title: `«${word.term}» حذف شود؟`,
      confirmText: 'حذف',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.api.removeWord(word.wordId);
      this.myWords.reload();
      this.stats.reload();
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }
}
