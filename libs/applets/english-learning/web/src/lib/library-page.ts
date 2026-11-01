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
  AioIcon,
  AioInput,
  AioInputGroupDirectives,
  AioSkeleton,
  AioTextarea,
  aioToast,
  provideIcons,
  AioFormField,
  AioEmptyState,
  AioSectionHeading,
  AioSkeletonLines,
} from '@all-in-one/ui';
import {
  englishErrorMessage as apiErrorMessage,
  englishNumber as faNumber,
} from './english-locale';
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
  host: { dir: 'ltr', lang: 'en' },
  selector: 'english-learning-library',
  imports: [
    AioButton,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioIcon,
    AioInput,
    AioInputGroupDirectives,
    AioSkeleton,
    AioTextarea,
    RouterLink,
    AioFormField,
    AioEmptyState,
    AioSectionHeading,
    AioSkeletonLines,
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
      @if (decks.error() || starters.error()) {
        <p role="alert" class="text-destructive text-sm">
          {{ errorMessage(decks.error() ?? starters.error()) }}
        </p>
        <button
          aioBtn
          variant="outline"
          (click)="decks.reload(); starters.reload()"
        >
          Try again
        </button>
      }

      <section
        class="lx-glass flex flex-col gap-5 rounded-[28px] p-5 sm:p-7"
        [attr.aria-busy]="initialLoading()"
        aria-labelledby="today-title"
      >
        <span class="lx-orb bg-violet-400" aria-hidden="true"></span>
        <span
          class="lx-orb start-[-60px] end-auto top-auto bottom-[-70px] bg-sky-300"
          aria-hidden="true"
        ></span>
        <div class="flex items-center gap-5 sm:gap-7">
          <div class="relative size-16 shrink-0 min-[390px]:size-24 sm:size-32">
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
              @if (initialLoading()) {
                <span aioSkeleton class="h-10 w-10 rounded-full"></span>
              } @else if (totalDue()) {
                <span
                  class="text-2xl leading-none font-extrabold sm:text-3xl"
                  >{{ fa(totalDue()) }}</span
                >
                <span class="text-muted-foreground mt-1 text-xs">due</span>
              } @else {
                <aio-icon name="lucideCheck" size="lg" class="text-primary" />
              }
            </span>
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <p class="aio-eyebrow">Today’s review</p>
            <h2
              id="today-title"
              class="line-clamp-2 min-h-14 text-xl font-bold sm:text-2xl"
            >
              @if (initialLoading()) {
                <span aioSkeleton class="block h-6 w-full rounded-lg"></span>
                <span
                  aioSkeleton
                  class="mt-2 block h-6 w-2/3 rounded-lg"
                ></span>
              } @else if (recommended()) {
                {{ fa(totalDue()) }} cards are waiting for you
              } @else if ((stats.value()?.reviewedToday ?? 0) > 0) {
                All done for today!
              } @else {
                No cards due right now
              }
            </h2>
            <p
              class="text-muted-foreground line-clamp-3 min-h-21 text-sm leading-7 sm:line-clamp-2 sm:min-h-14"
            >
              @if (initialLoading()) {
                <span aioSkeleton class="block h-5 w-full rounded-lg"></span>
                <span
                  aioSkeleton
                  class="mt-2 block h-5 w-3/4 rounded-lg"
                ></span>
              } @else if (recommended(); as next) {
                Start with “{{ next.name }}”. A few minutes is all it takes.
              } @else if ((stats.value()?.reviewedToday ?? 0) > 0) {
                You reviewed {{ fa(stats.value()!.reviewedToday) }} cards. Come
                back tomorrow to keep your streak going.
              } @else {
                Add new cards or come back tomorrow.
              }
            </p>
          </div>
        </div>
        @if (initialLoading()) {
          <div aioSkeleton class="h-13 w-full rounded-2xl"></div>
        } @else if (recommended(); as next) {
          <a
            aioBtn
            size="lg"
            class="h-13 w-full rounded-2xl text-base"
            [routerLink]="['deck', next.id, 'study']"
          >
            <aio-icon name="lucidePlay" size="sm" />
            Start review
          </a>
        } @else {
          <button
            aioBtn
            size="lg"
            class="h-13 w-full rounded-2xl text-base"
            (click)="openNew()"
          >
            <aio-icon name="lucidePlus" size="sm" /> Add cards
          </button>
        }
        <ul class="flex min-h-9 flex-wrap gap-2" aria-label="Statistics">
          <li
            class="lx-chip"
            [class.text-[var(--streak)]]="streak() > 0"
            [class.text-muted-foreground]="streak() === 0"
          >
            <aio-icon name="lucideFlame" size="sm" />
            <span class="min-w-[3ch]">
              @if (initialLoading()) {
                <span
                  aioSkeleton
                  class="block h-4 w-6 rounded-lg"
                  aria-hidden="true"
                ></span>
              } @else {
                {{ fa(streak()) }}
              }
            </span>
            day streak
          </li>
          <li class="lx-chip text-[var(--gem)]">
            <aio-icon name="lucideGem" size="sm" />
            <span class="min-w-[3ch]">
              @if (initialLoading()) {
                <span
                  aioSkeleton
                  class="block h-4 w-6 rounded-lg"
                  aria-hidden="true"
                ></span>
              } @else {
                {{ fa(stats.value()?.mature ?? 0) }}
              }
            </span>
            mature
          </li>
          <li class="lx-chip text-muted-foreground">
            <aio-icon name="lucideLayers" size="sm" />
            <span class="min-w-[3ch]">
              @if (initialLoading()) {
                <span
                  aioSkeleton
                  class="block h-4 w-6 rounded-lg"
                  aria-hidden="true"
                ></span>
              } @else {
                {{ fa(totalCards()) }}
              }
            </span>
            cards
          </li>
        </ul>
      </section>

      <section class="flex flex-col gap-3" aria-labelledby="decks-title">
        <div
          class="flex items-center justify-between gap-3"
          aioSectionHeading
          title="My decks"
          [description]="
            fa(myDecks().length) + ' decks, ' + fa(totalCards()) + ' cards'
          "
          [loading]="decks.isLoading() && !decks.hasValue()"
          [level]="2"
          headingId="decks-title"
          titleClass="text-lg font-bold"
          descriptionClass="text-muted-foreground min-h-5 truncate text-sm"
          textClass="min-w-0 flex-1"
        >
          <button aioBtn variant="outline" (click)="openNew()">
            <aio-icon name="lucidePlus" size="sm" />
            New deck
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
              placeholder="Search decks"
              aria-label="Search decks"
              [value]="search()"
              (input)="search.set($any($event.target).value)"
            />
          </div>
        }

        @if (decks.hasValue() && !myDecks().length) {
          <div
            class="lx-glass rounded-3xl"
            aioEmptyState
            title="Your library is empty"
            description="Create a deck or start with a ready-made deck below."
            [level]="3"
            icon="lucideBookOpen"
            iconClass="text-primary"
          ></div>
        }

        <div class="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          @if (decks.isLoading() && !decks.hasValue()) {
            @for (item of [1, 2]; track item) {
              <div
                class="lx-glass flex min-h-44 flex-col gap-4 rounded-3xl p-5"
                aria-hidden="true"
                aioSkeletonLines
                [lines]="[
                  'h-6 w-2/3 rounded-lg',
                  'h-5 w-full rounded-lg',
                  'mt-auto h-4 w-1/3 rounded-lg',
                ]"
              ></div>
            }
          }
          @for (deck of filteredDecks(); track deck.id) {
            <a
              [routerLink]="['deck', deck.id]"
              class="lx-glass lx-glass-hover flex min-h-44 min-w-0 rounded-3xl"
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
                      >{{ fa(deck.due) }} due</span
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
                  {{ fa(deck.total) }} cards
                  @if (deck.suspended) {
                    , {{ fa(deck.suspended) }} paused
                  }
                </span>
              </span>
            </a>
          }
        </div>
      </section>

      <section class="flex flex-col gap-3" aria-labelledby="starter-title">
        <h2 id="starter-title" class="text-lg font-bold">Starter decks</h2>
        <ul
          class="lx-glass divide-foreground/8 flex flex-col divide-y rounded-3xl"
        >
          @if (starters.isLoading() && !starters.hasValue()) {
            @for (item of [1, 2, 3, 4]; track item) {
              <li
                class="flex min-h-20 items-center gap-3 px-4 py-3"
                aria-hidden="true"
              >
                <span aioSkeleton class="size-10 shrink-0 rounded-xl"></span>
                <span
                  class="flex flex-1 flex-col gap-2"
                  aioSkeletonLines
                  [lines]="['h-5 w-2/3 rounded-lg', 'h-4 w-full rounded-lg']"
                ></span>
              </li>
            }
          }
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
                  >{{ fa(s.cardCount) }} cards, {{ s.description }}</span
                >
              </span>
              <button
                aioBtn
                variant="outline"
                size="sm"
                [disabled]="copying() === s.slug || inLibrary(s)"
                (click)="copy(s)"
                [attr.aria-label]="'Add ' + s.title"
              >
                @if (inLibrary(s)) {
                  <aio-icon name="lucideCheck" size="sm" />
                  Added
                } @else {
                  <aio-icon name="lucidePlus" size="sm" />
                  Add
                }
              </button>
            </li>
          }
        </ul>
      </section>
    </div>

    <aio-dialog
      [(open)]="creating"
      title="New deck"
      description="Cards you review together."
      contentClass="applet-english"
      language="en"
    >
      <ng-template aioDialogBody>
        <form
          id="english-deck-form"
          class="flex flex-col gap-4"
          (submit)="$event.preventDefault(); create()"
        >
          <aio-form-field label="Name" controlId="deck-name">
            <input
              aioInput
              id="deck-name"
              autocomplete="off"
              placeholder="For example: Tactics vocabulary"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
            />
          </aio-form-field>
          <aio-form-field label="Description (optional)" controlId="deck-desc">
            <textarea
              aioTextarea
              id="deck-desc"
              rows="2"
              [value]="description()"
              (input)="description.set($any($event.target).value)"
            ></textarea>
          </aio-form-field>
          <fieldset class="flex flex-col gap-2">
            <legend class="mb-2 text-sm font-medium">Colour</legend>
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
          Cancel
        </button>
        <button
          aioBtn
          type="submit"
          form="english-deck-form"
          [disabled]="saving()"
        >
          Create deck
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class LibraryPage {
  protected readonly errorMessage = apiErrorMessage;
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

  protected readonly initialLoading = computed(
    () =>
      (this.decks.isLoading() && !this.decks.hasValue()) ||
      (this.stats.isLoading() && !this.stats.hasValue()),
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
      aioToast.error('Enter a name for the deck.');
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
        `“${starter.title}” added with ${faNumber(starter.cardCount)} cards`,
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
