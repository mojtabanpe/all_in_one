import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  DECK_COLOR_LABELS,
  DECK_COLORS,
  type DeckColor,
  type DeckWithStats,
  type EnglishStats,
  type StarterDeck,
} from '@all-in-one/applets/english-learning/contracts';
import {
  AioButton,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioEmptyDirectives,
  AioFieldDirectives,
  AioIcon,
  AioInput,
  AioInputGroupDirectives,
  AioSkeleton,
  AioTextarea,
  aioToast,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage, faNumber } from '@all-in-one/web/shared';
import {
  lucideBookOpen,
  lucideCheck,
  lucideFlame,
  lucideGem,
  lucideLayers,
  lucidePlay,
  lucidePlus,
  lucideSearch,
} from '@ng-icons/lucide';
import { DECK_TONE } from './deck-colors';
import { EnglishApi } from './english-api';

/** Recall's library: streak, today's review, the user's decks and starter decks. */
@Component({
  selector: 'english-learning-library',
  imports: [
    AioButton,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioEmptyDirectives,
    AioFieldDirectives,
    AioIcon,
    AioInput,
    AioInputGroupDirectives,
    AioSkeleton,
    AioTextarea,
    RouterLink,
  ],
  providers: [
    provideIcons({
      lucideBookOpen,
      lucideCheck,
      lucideFlame,
      lucideGem,
      lucideLayers,
      lucidePlay,
      lucidePlus,
      lucideSearch,
    }),
  ],
  template: `
    <div class="flex flex-col gap-6">
      @if (decks.isLoading() && !decks.hasValue()) {
        <div aioSkeleton class="h-56 rounded-[28px]"></div>
      } @else if (myDecks().length) {
        <section
          class="lx-glass flex flex-col gap-5 rounded-[28px] p-5 sm:p-7"
          aria-labelledby="today-title"
        >
          <span class="lx-orb bg-emerald-400" aria-hidden="true"></span>
          <span
            class="lx-orb start-[-60px] end-auto top-auto bottom-[-70px] bg-sky-300"
            aria-hidden="true"
          ></span>
          <div class="flex items-center gap-5 sm:gap-7">
            <div class="relative size-24 shrink-0 sm:size-32">
              <svg
                viewBox="0 0 120 120"
                class="size-full -rotate-90"
                aria-hidden="true"
              >
                <circle
                  class="lx-ring-track"
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke-width="10"
                />
                <circle
                  class="lx-ring-value"
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke-width="10"
                  stroke-linecap="round"
                  [attr.stroke-dasharray]="ring"
                  [attr.stroke-dashoffset]="ring * (1 - progress())"
                />
              </svg>
              <span
                class="absolute inset-0 flex flex-col items-center justify-center"
              >
                @if (totalDue()) {
                  <span
                    class="text-2xl leading-none font-extrabold sm:text-3xl"
                    >{{ fa(totalDue()) }}</span
                  >
                  <span class="text-muted-foreground mt-1 text-xs">آماده</span>
                } @else {
                  <aio-icon name="lucideCheck" size="lg" class="text-primary" />
                }
              </span>
            </div>
            <div class="flex min-w-0 flex-col gap-1">
              <p class="aio-eyebrow">مرور امروز</p>
              <h2 id="today-title" class="text-xl font-bold sm:text-2xl">
                @if (recommended()) {
                  {{ fa(totalDue()) }} کارت منتظر توست
                } @else if ((stats.value()?.reviewedToday ?? 0) > 0) {
                  امروز کامل شد!
                } @else {
                  فعلاً کارتی برای مرور نیست
                }
              </h2>
              <p class="text-muted-foreground text-sm leading-7">
                @if (recommended(); as next) {
                  از «{{ next.name }}» شروع کن؛ چند دقیقه کافی است.
                } @else if ((stats.value()?.reviewedToday ?? 0) > 0) {
                  {{ fa(stats.value()!.reviewedToday) }} کارت مرور کردی. فردا
                  برگرد تا شعله روشن بماند.
                } @else {
                  کارت تازه اضافه کن یا فردا برگرد.
                }
              </p>
            </div>
          </div>
          @if (recommended(); as next) {
            <a
              aioBtn
              size="lg"
              class="h-13 w-full rounded-2xl text-base"
              [routerLink]="['deck', next.id, 'study']"
            >
              <aio-icon name="lucidePlay" size="sm" />
              شروع مرور
            </a>
          }
          <ul class="flex flex-wrap gap-2" aria-label="آمار">
            <li
              class="lx-chip"
              [class.text-[var(--streak)]]="streak() > 0"
              [class.text-muted-foreground]="streak() === 0"
            >
              <aio-icon name="lucideFlame" size="sm" />
              {{ fa(streak()) }} روز پیاپی
            </li>
            <li class="lx-chip text-[var(--gem)]">
              <aio-icon name="lucideGem" size="sm" />
              {{ fa(stats.value()?.mature ?? 0) }} جاافتاده
            </li>
            <li class="lx-chip text-muted-foreground">
              <aio-icon name="lucideLayers" size="sm" />
              {{ fa(totalCards()) }} کارت
            </li>
          </ul>
        </section>
      }

      <section class="flex flex-col gap-3" aria-labelledby="decks-title">
        <div class="flex items-center justify-between gap-3">
          <h2 id="decks-title" class="text-lg font-bold">
            دسته‌های من
            @if (myDecks().length) {
              <span class="text-muted-foreground text-sm font-normal"
                >{{ fa(myDecks().length) }} دسته،
                {{ fa(totalCards()) }} کارت</span
              >
            }
          </h2>
          <button aioBtn variant="outline" (click)="openNew()">
            <aio-icon name="lucidePlus" size="sm" />
            دسته جدید
          </button>
        </div>

        @if (myDecks().length > 3) {
          <div aioInputGroup>
            <aio-input-group-addon>
              <aio-icon name="lucideSearch" size="sm" />
            </aio-input-group-addon>
            <input
              aioInputGroupInput
              type="search"
              placeholder="جست‌وجوی دسته‌ها"
              aria-label="جست‌وجوی دسته‌ها"
              [value]="search()"
              (input)="search.set($any($event.target).value)"
            />
          </div>
        }

        @if (decks.hasValue() && !myDecks().length) {
          <div aioEmpty class="lx-glass rounded-3xl">
            <div aioEmptyHeader>
              <div aioEmptyMedia variant="icon" class="text-primary">
                <aio-icon name="lucideBookOpen" />
              </div>
              <h3 aioEmptyTitle>کتابخانه‌ات خالی است</h3>
              <p aioEmptyDescription>
                یک دسته بساز یا از دسته‌های آماده پایین شروع کن.
              </p>
            </div>
          </div>
        }

        <div class="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          @for (deck of filteredDecks(); track deck.id) {
            <a
              [routerLink]="['deck', deck.id]"
              class="lx-glass lx-glass-hover flex min-w-0 rounded-3xl"
            >
              <span
                class="lx-orb"
                [class]="tone(deck.color).bar"
                aria-hidden="true"
              ></span>
              <span class="flex min-w-0 flex-1 flex-col gap-2 p-5">
                <span class="flex items-start justify-between gap-2">
                  <span class="truncate text-lg font-bold">{{
                    deck.name
                  }}</span>
                  @if (deck.due > 0) {
                    <span
                      class="bg-primary text-primary-foreground shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold"
                      >{{ fa(deck.due) }} آماده</span
                    >
                  }
                </span>
                @if (deck.description) {
                  <span class="text-muted-foreground line-clamp-2 text-sm">{{
                    deck.description
                  }}</span>
                }
                <span
                  class="bg-foreground/8 mt-1 h-1.5 overflow-hidden rounded-full"
                  aria-hidden="true"
                >
                  <span
                    class="block h-full rounded-full"
                    [class]="tone(deck.color).bar"
                    [style.width.%]="
                      deck.total
                        ? (100 * (deck.total - deck.due)) / deck.total
                        : 0
                    "
                  ></span>
                </span>
                <span class="text-muted-foreground text-xs">
                  {{ fa(deck.total) }} کارت
                  @if (deck.suspended) {
                    ، {{ fa(deck.suspended) }} کنار گذاشته
                  }
                </span>
              </span>
            </a>
          }
        </div>
      </section>

      <section class="flex flex-col gap-3" aria-labelledby="starter-title">
        <h2 id="starter-title" class="text-lg font-bold">دسته‌های آماده</h2>
        <ul
          class="lx-glass divide-foreground/8 flex flex-col divide-y rounded-3xl"
        >
          @for (s of starters.value() ?? []; track s.slug) {
            <li class="flex min-h-16 items-center gap-3 px-4 py-3">
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                [class]="tone(s.color).soft + ' ' + tone(s.color).text"
                dir="ltr"
                >{{ s.level }}</span
              >
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="font-semibold">{{ s.title }}</span>
                <span class="text-muted-foreground truncate text-sm"
                  >{{ fa(s.cardCount) }} کارت، {{ s.description }}</span
                >
              </span>
              <button
                aioBtn
                variant="outline"
                size="sm"
                [disabled]="copying() === s.slug || inLibrary(s)"
                (click)="copy(s)"
                [attr.aria-label]="'افزودن ' + s.title"
              >
                @if (inLibrary(s)) {
                  <aio-icon name="lucideCheck" size="sm" />
                  اضافه شد
                } @else {
                  <aio-icon name="lucidePlus" size="sm" />
                  افزودن
                }
              </button>
            </li>
          }
        </ul>
      </section>
    </div>

    <aio-dialog
      [(open)]="creating"
      title="دسته جدید"
      description="کارت‌هایی که با هم مرور می‌کنی."
      contentClass="applet-english"
    >
      <ng-template aioDialogBody>
        <form
          id="english-deck-form"
          class="flex flex-col gap-4"
          (submit)="$event.preventDefault(); create()"
        >
          <div aioField>
            <label aioFieldLabel for="deck-name">نام</label>
            <input
              aioInput
              id="deck-name"
              autocomplete="off"
              placeholder="مثلاً: لغت‌های کتاب Tactics"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
            />
          </div>
          <div aioField>
            <label aioFieldLabel for="deck-desc">توضیح (اختیاری)</label>
            <textarea
              aioTextarea
              id="deck-desc"
              rows="2"
              [value]="description()"
              (input)="description.set($any($event.target).value)"
            ></textarea>
          </div>
          <fieldset class="flex flex-col gap-2">
            <legend class="mb-2 text-sm font-medium">رنگ</legend>
            <div class="flex flex-wrap gap-2">
              @for (c of colors; track c) {
                <button
                  type="button"
                  class="flex size-11 items-center justify-center rounded-full ring-offset-2 transition"
                  [class]="tone(c).bar"
                  [class.ring-2]="color() === c"
                  [class.ring-foreground]="color() === c"
                  [attr.aria-pressed]="color() === c"
                  [attr.aria-label]="colorLabels[c]"
                  (click)="color.set(c)"
                >
                  @if (color() === c) {
                    <aio-icon name="lucideCheck" size="sm" class="text-white" />
                  }
                </button>
              }
            </div>
          </fieldset>
        </form>
      </ng-template>
      <ng-template aioDialogActions>
        <button aioBtn variant="outline" (click)="creating.set(false)">
          انصراف
        </button>
        <button
          aioBtn
          type="submit"
          form="english-deck-form"
          [disabled]="saving()"
        >
          ساخت دسته
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class LibraryPage {
  private readonly api = inject(EnglishApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly stats = httpResource<EnglishStats>(
    () => `${this.api.base}/stats`,
  );
  protected readonly decks = httpResource<DeckWithStats[]>(
    () => `${this.api.base}/decks`,
  );
  protected readonly starters = httpResource<StarterDeck[]>(
    () => `${this.api.base}/starter-decks`,
  );

  protected readonly colors = DECK_COLORS;
  protected readonly colorLabels = DECK_COLOR_LABELS;
  protected readonly search = signal('');
  protected readonly creating = signal(false);
  protected readonly saving = signal(false);
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly color = signal<DeckColor>('sky');
  protected readonly copying = signal<string | null>(null);
  protected readonly copied = signal<ReadonlySet<string>>(new Set());

  protected readonly fa = (n: number) => faNumber(n);
  protected readonly tone = (c: DeckColor) => DECK_TONE[c];
  /** Copied in this visit, or a deck with the same name is already in the library. */
  protected readonly inLibrary = (s: StarterDeck) =>
    this.copied().has(s.slug) || this.myDecks().some((d) => d.name === s.title);
  /** Circumference of the progress ring (r = 52). */
  protected readonly ring = 2 * Math.PI * 52;
  /** Today's share of the review queue already done. */
  protected readonly progress = computed(() => {
    const done = this.stats.value()?.reviewedToday ?? 0;
    const left = this.totalDue();
    return done + left ? done / (done + left) : 0;
  });
  protected readonly streak = computed(
    () => this.stats.value()?.streakDays ?? 0,
  );
  protected readonly myDecks = computed(() =>
    this.decks.hasValue() ? this.decks.value() : [],
  );
  protected readonly totalCards = computed(() =>
    this.myDecks().reduce((n, d) => n + d.total, 0),
  );
  protected readonly totalDue = computed(() =>
    this.myDecks().reduce((n, d) => n + d.due, 0),
  );
  /** The deck with the most cards due. */
  protected readonly recommended = computed(
    () =>
      [...this.myDecks()]
        .filter((d) => d.due > 0)
        .sort((a, b) => b.due - a.due)[0] ?? null,
  );
  protected readonly filteredDecks = computed(() => {
    const q = this.search().trim().toLowerCase();
    return q
      ? this.myDecks().filter((d) =>
          (d.name + ' ' + d.description).toLowerCase().includes(q),
        )
      : this.myDecks();
  });

  protected openNew() {
    this.name.set('');
    this.description.set('');
    this.color.set('sky');
    this.creating.set(true);
  }

  protected async create() {
    const name = this.name().trim();
    if (!name) {
      aioToast.error('برای دسته یک نام بنویس.');
      return;
    }
    this.saving.set(true);
    try {
      const deck = await this.api.createDeck({
        name,
        description: this.description().trim(),
        color: this.color(),
      });
      this.creating.set(false);
      await this.router.navigate(['deck', deck.id], { relativeTo: this.route });
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async copy(starter: StarterDeck) {
    this.copying.set(starter.slug);
    try {
      await this.api.copyStarter(starter.slug);
      this.copied.update((set) => new Set(set).add(starter.slug));
      aioToast.success(
        `«${starter.title}» با ${faNumber(starter.cardCount)} کارت اضافه شد`,
      );
      this.decks.reload();
      this.stats.reload();
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.copying.set(null);
    }
  }
}
