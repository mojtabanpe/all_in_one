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
  AioProgressDirectives,
  AioSkeleton,
  aioToast,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage, faNumber } from '@all-in-one/web/shared';
import {
  lucideBookOpen,
  lucideFlame,
  lucidePlus,
  lucideTrash2,
  lucideVolume2,
} from '@ng-icons/lucide';
import { EnglishApi, speak } from './english-api';

@Component({
  selector: 'english-learning-home',
  imports: [
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
    AioProgressDirectives,
    AioSkeleton,
    FormField,
    FormRoot,
    RouterLink,
  ],
  providers: [
    provideIcons({
      lucideBookOpen,
      lucideFlame,
      lucidePlus,
      lucideTrash2,
      lucideVolume2,
    }),
  ],
  template: `
    <div class="flex flex-col gap-5">
      <header>
        <h1 class="text-2xl font-bold">یادگیری انگلیسی</h1>
        <p class="text-muted-foreground text-sm">
          هر روز چند دقیقه مرور، با جعبه لایتنر.
        </p>
      </header>

      <section aioCard class="bg-primary/10">
        <div
          aioCardContent
          class="flex flex-wrap items-center justify-between gap-4"
        >
          <div class="grid grid-cols-3 gap-4 text-center">
            <div>
              <div class="text-2xl font-bold">
                {{ fa(stats.value()?.dueNow ?? 0) }}
              </div>
              <div class="text-muted-foreground text-xs">آماده مرور</div>
            </div>
            <div>
              <div class="text-2xl font-bold">
                {{ fa(stats.value()?.learning ?? 0) }}
              </div>
              <div class="text-muted-foreground text-xs">در حال یادگیری</div>
            </div>
            <div>
              <div class="text-2xl font-bold">
                {{ fa(stats.value()?.mastered ?? 0) }}
              </div>
              <div class="text-muted-foreground text-xs">یادگرفته</div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            @if ((stats.value()?.streakDays ?? 0) > 0) {
              <span aioBadge variant="secondary" class="gap-1">
                <aio-icon name="lucideFlame" size="xs" class="text-warning" />
                {{ fa(stats.value()!.streakDays) }} روز پیاپی
              </span>
            }
            <a
              aioBtn
              size="lg"
              routerLink="review"
              [class.pointer-events-none]="!stats.value()?.dueNow"
              [attr.aria-disabled]="!stats.value()?.dueNow"
            >
              <aio-icon name="lucideBookOpen" size="sm" />
              مرور امروز
            </a>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">مجموعه واژه‌ها</h2>
        @if (decks.isLoading() && !decks.hasValue()) {
          <div class="grid gap-3 sm:grid-cols-2">
            <div aioSkeleton class="h-36 rounded-3xl"></div>
            <div aioSkeleton class="h-36 rounded-3xl"></div>
          </div>
        } @else {
          <div class="grid gap-3 sm:grid-cols-2">
            @for (deck of decks.value() ?? []; track deck.slug) {
              <article aioCard>
                <div aioCardHeader>
                  <h3 aioCardTitle class="flex items-center gap-2">
                    {{ deck.title }}
                    <span aioBadge variant="outline" dir="ltr">{{
                      deck.level
                    }}</span>
                  </h3>
                  <p aioCardDescription>{{ deck.description }}</p>
                </div>
                <div aioCardContent class="flex flex-col gap-2">
                  <div
                    aioProgress
                    [value]="deck.started"
                    [max]="deck.wordCount"
                    [attr.aria-label]="'پیشرفت ' + deck.title"
                  >
                    <div aioProgressIndicator></div>
                  </div>
                  <p class="text-muted-foreground text-xs">
                    {{ fa(deck.started) }} از {{ fa(deck.wordCount) }} واژه شروع
                    شده · {{ fa(deck.mastered) }} یادگرفته
                  </p>
                </div>
                <div aioCardFooter>
                  <button
                    aioBtn
                    [variant]="
                      deck.started === deck.wordCount ? 'outline' : 'default'
                    "
                    [disabled]="
                      deck.started === deck.wordCount ||
                      starting() === deck.slug
                    "
                    (click)="start(deck)"
                  >
                    {{
                      deck.started === 0
                        ? 'شروع'
                        : deck.started === deck.wordCount
                          ? 'همه در مرور'
                          : 'افزودن باقی واژه‌ها'
                    }}
                  </button>
                </div>
              </article>
            }
          </div>
        }
      </section>

      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">واژه‌های من</h2>
          <button aioBtn variant="outline" size="sm" (click)="adding.set(true)">
            <aio-icon name="lucidePlus" size="sm" />
            واژه جدید
          </button>
        </div>
        @if ((myWords.value() ?? []).length === 0) {
          <p class="text-muted-foreground text-sm">
            واژه‌هایی که خودتان اضافه کنید اینجا می‌آیند و وارد مرور می‌شوند.
          </p>
        } @else {
          <div aioItemGroup class="flex flex-col gap-2">
            @for (word of myWords.value() ?? []; track word.wordId) {
              <div aioItem variant="outline" class="glass rounded-2xl">
                <div aioItemContent>
                  <div aioItemTitle dir="ltr" lang="en" class="justify-end">
                    {{ word.term }}
                  </div>
                  <div aioItemDescription>{{ word.meaningFa }}</div>
                </div>
                <div aioItemActions>
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
                </div>
              </div>
            }
          </div>
        }
      </section>
    </div>

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

  protected readonly fa = (n: number) => faNumber(n);
  protected readonly hasWords = computed(
    () => (this.myWords.value() ?? []).length > 0,
  );

  protected say(term: string) {
    speak(term);
  }

  protected async start(deck: EnglishDeckSummary) {
    this.starting.set(deck.slug);
    try {
      const { added } = await this.api.startDeck(deck.slug);
      aioToast.success(`${faNumber(added)} واژه به مرور اضافه شد`);
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
