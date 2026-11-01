import {
  Component,
  computed,
  HostListener,
  inject,
  input,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  type Card,
  cardParts,
  type Deck,
  previewInterval,
  type Rating,
  RATING_LABELS,
} from '@all-in-one/applets/english-learning/contracts';
import {
  AioButton,
  AioConfirm,
  AioEmptyDirectives,
  AioIcon,
  AioProgressDirectives,
  AioSkeleton,
  aioToast,
  provideIcons,
} from '@all-in-one/ui';
import {
  englishErrorMessage as apiErrorMessage,
  englishNumber as faNumber,
} from './english-locale';
import {
  lucideBookOpen,
  lucideListChecks,
  lucidePartyPopper,
  lucideTarget,
  lucideTrash2,
  lucideVolume2,
  lucideX,
  lucideZap,
} from '@ng-icons/lucide';
import { EnglishApi, exampleLines } from './english-api';
import { Tts } from './tts';

/** 3D rating buttons: each recolours spartan's --primary on itself (literal for Tailwind). */
const RATING_STYLE: Record<
  Rating,
  { variant: 'default' | 'outline'; class: string; key: string }
> = {
  again: {
    variant: 'default',
    key: '1',
    class:
      '[--primary:var(--destructive)] [--primary-edge:color-mix(in_oklch,var(--destructive)_72%,black)]',
  },
  hard: { variant: 'outline', key: '2', class: '' },
  good: { variant: 'default', key: '3', class: '' },
  easy: {
    variant: 'default',
    key: '4',
    class:
      '[--primary:var(--gem)] [--primary-edge:color-mix(in_oklch,var(--gem)_72%,black)]',
  },
};
const POINTS: Record<Rating, number> = {
  again: 2,
  hard: 6,
  good: 10,
  easy: 12,
};

/** Study a deck's due cards (Recall study page) as a Duolingo-style session. */
@Component({
  host: { dir: 'ltr', lang: 'en' },
  selector: 'english-learning-study',
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
      lucideListChecks,
      lucidePartyPopper,
      lucideTarget,
      lucideTrash2,
      lucideVolume2,
      lucideX,
      lucideZap,
    }),
  ],
  template: `
    <div
      class="applet-english lx-stage mx-auto flex min-w-0 min-h-[calc(100dvh-var(--bottom-nav-space)-6rem)] w-full max-w-lg flex-col gap-6"
    >
      <header class="flex items-center gap-3">
        <a
          aioBtn
          variant="ghost"
          size="icon"
          routerLink=".."
          aria-label="End review"
        >
          <aio-icon name="lucideX" />
        </a>
        <div
          aioProgress
          class="bg-muted h-4 flex-1 rounded-full"
          [value]="progress()"
          aria-label="Review progress"
        >
          <div aioProgressIndicator class="rounded-full"></div>
        </div>
        @if (queue().length) {
          <span class="text-muted-foreground text-sm">{{
            fa(queue().length)
          }}</span>
        }
      </header>

      @if (loading()) {
        <div aioSkeleton class="h-72 rounded-3xl"></div>
      } @else if (loadError()) {
        <div aioEmpty class="lx-glass rounded-3xl">
          <div aioEmptyHeader>
            <h1 aioEmptyTitle>Unable to load review</h1>
            <p aioEmptyDescription>{{ loadError() }}</p>
          </div>
          <div aioEmptyContent>
            <button aioBtn (click)="load()">Again</button>
          </div>
        </div>
      } @else if (current(); as card) {
        <h1 class="text-muted-foreground text-sm font-bold">
          {{ deck()?.name }}
        </h1>
        <button
          type="button"
          class="lx-glass flex min-h-64 flex-col items-center justify-center gap-4 rounded-3xl p-6 text-center"
          (click)="toggle()"
          [attr.aria-label]="flipped() ? 'Show front' : 'Show answer'"
          aria-live="polite"
        >
          @if (flipped()) {
            @if (parts(card).unit; as u) {
              <span
                class="bg-accent text-accent-foreground rounded-full px-2 text-xs"
                dir="ltr"
                >{{ u }}</span
              >
            }
            <span dir="ltr" class="text-xl font-semibold">{{
              parts(card).body
            }}</span>
          } @else {
            <span dir="ltr" lang="en" class="text-4xl font-bold">{{
              card.front
            }}</span>
          }
        </button>

        <div class="flex items-center justify-center gap-2">
          <button
            aioBtn
            size="icon-lg"
            class="size-12 rounded-2xl [--primary:var(--gem)]"
            (click)="speak()"
            aria-label="Pronunciation"
          >
            <aio-icon name="lucideVolume2" />
          </button>
          @if (examples().length) {
            <button
              aioBtn
              variant="outline"
              (click)="examplesOpen.update((o) => !o)"
              [attr.aria-expanded]="examplesOpen()"
            >
              <aio-icon name="lucideListChecks" size="sm" />
              {{ examplesOpen() ? 'Hide examples' : 'Examples' }}
            </button>
          }
          <button
            aioBtn
            variant="ghost"
            size="icon"
            class="text-destructive"
            (click)="deleteCurrent()"
            aria-label="Delete this card"
          >
            <aio-icon name="lucideTrash2" size="sm" />
          </button>
        </div>
        @if (examplesOpen()) {
          <ul
            dir="ltr"
            lang="en"
            class="lx-glass text-muted-foreground flex list-disc flex-col gap-1 rounded-2xl py-3 ps-8 pe-4 text-sm"
          >
            @for (line of examples(); track $index) {
              <li>{{ line }}</li>
            }
          </ul>
        }

        <div class="mt-auto flex flex-col gap-3">
          @if (flipped()) {
            <p class="text-sm font-bold">How well did you remember?</p>
            <div
              class="grid grid-cols-2 gap-3"
              role="group"
              aria-label="How well did you remember?"
            >
              @for (r of ratings; track r) {
                <button
                  aioBtn
                  size="lg"
                  class="h-auto min-h-14 flex-col gap-0 rounded-2xl py-2"
                  [variant]="style[r].variant"
                  [class]="style[r].class"
                  [disabled]="busy()"
                  [attr.aria-keyshortcuts]="style[r].key"
                  (click)="rate(r)"
                >
                  <span>{{ labels[r] }}</span>
                  <span class="text-xs font-normal opacity-80">{{
                    previewFor(r)
                  }}</span>
                </button>
              }
            </div>
          } @else {
            <button
              aioBtn
              size="lg"
              class="h-14 w-full rounded-2xl"
              (click)="toggle()"
            >
              Show answer
            </button>
          }
        </div>
      } @else if (reviewed() > 0) {
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
            <h1 class="text-primary text-3xl font-bold">
              Well done! You did it
            </h1>
            <p class="text-muted-foreground">
              You finished reviewing this deck. Come back tomorrow to keep your
              streak going.
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
            class="mt-auto h-14 w-full rounded-2xl"
            routerLink=".."
            >Continue</a
          >
        </section>
      } @else {
        <div aioEmpty class="lx-glass rounded-3xl">
          <div aioEmptyHeader>
            <div aioEmptyMedia variant="icon" class="text-primary">
              <aio-icon name="lucideBookOpen" />
            </div>
            <h1 aioEmptyTitle>No cards due right now</h1>
            <p aioEmptyDescription>Add new cards or come back later.</p>
          </div>
          <div aioEmptyContent>
            <a aioBtn routerLink="..">Back to deck</a>
          </div>
        </div>
      }
    </div>
  `,
})
export class StudyPage {
  /** Route param, bound by withComponentInputBinding(). */
  readonly id = input<string>();
  private readonly api = inject(EnglishApi);
  private readonly tts = inject(Tts);
  private readonly confirm = inject(AioConfirm);
  private readonly route = inject(ActivatedRoute);

  protected readonly ratings: Rating[] = ['again', 'hard', 'good', 'easy'];
  protected readonly labels = RATING_LABELS;
  protected readonly style = RATING_STYLE;
  protected readonly deck = signal<Deck | null>(null);
  protected readonly queue = signal<Card[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly flipped = signal(false);
  protected readonly examplesOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly reviewed = signal(0);
  private readonly startCount = signal(0);
  private readonly remembered = signal(0);
  private readonly points = signal(0);

  protected readonly fa = (n: number) => faNumber(n);
  protected readonly parts = cardParts;
  protected readonly current = computed(() => this.queue()[0] ?? null);
  protected readonly examples = computed(() =>
    exampleLines(this.current()?.examples ?? ''),
  );
  protected readonly progress = computed(() => {
    const total = this.startCount();
    return total
      ? Math.min(100, ((total - this.queue().length) / total) * 100)
      : 0;
  });
  protected readonly summary = computed(() => [
    {
      label: 'Points',
      value: faNumber(this.points()),
      icon: 'lucideZap',
      color: 'var(--streak)',
    },
    {
      label: 'Review',
      value: faNumber(this.reviewed()),
      icon: 'lucideBookOpen',
      color: 'var(--gem)',
    },
    {
      label: 'Recall',
      value: `${faNumber(Math.round((this.remembered() / Math.max(this.reviewed(), 1)) * 100))}%`,
      icon: 'lucideTarget',
      color: 'var(--primary)',
    },
  ]);

  constructor() {
    queueMicrotask(() => this.load());
  }

  private deckId(): string {
    return this.id() ?? this.route.snapshot.paramMap.get('id') ?? '';
  }

  protected async load() {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const [deck, due] = await Promise.all([
        this.api.deck(this.deckId()),
        this.api.cards(this.deckId(), true),
      ]);
      this.deck.set(deck);
      this.queue.set(due);
      this.startCount.set(due.length);
    } catch (error) {
      this.loadError.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected toggle() {
    if (this.busy()) return;
    this.examplesOpen.set(false);
    this.flipped.update((f) => !f);
  }

  protected previewFor(rating: Rating): string {
    const card = this.current();
    return card ? previewInterval(card, rating) : '';
  }

  protected speak() {
    const card = this.current();
    if (card)
      void this.tts.speak(this.flipped() ? cardParts(card).body : card.front);
  }

  protected async rate(rating: Rating) {
    const card = this.current();
    if (!card || this.busy() || !this.flipped()) return;
    this.busy.set(true);
    try {
      const updated = await this.api.review(card.id, rating);
      this.examplesOpen.set(false);
      this.reviewed.update((n) => n + 1);
      this.points.update((p) => p + POINTS[rating]);
      if (rating === 'good' || rating === 'easy')
        this.remembered.update((n) => n + 1);
      this.flipped.set(false);
      // A fresh leech leaves the queue instead of cycling back.
      if (updated.suspended) {
        aioToast.info(
          'This card was repeatedly forgotten and has been paused.',
        );
        this.queue.update((q) => q.slice(1));
        return;
      }
      // A failed card comes back later in this session.
      this.queue.update((q) =>
        rating === 'again' ? [...q.slice(1), updated] : q.slice(1),
      );
    } catch (error) {
      aioToast.error(apiErrorMessage(error, 'Unable to save your review.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async deleteCurrent() {
    const card = this.current();
    if (!card || this.busy()) return;
    const ok = await this.confirm.ask({
      language: 'en',
      title: 'Delete this card?',
      description: `“${card.front}” will be permanently deleted.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.api.removeCard(card.id);
      this.queue.update((q) => q.filter((c) => c.id !== card.id));
      this.startCount.update((n) => Math.max(0, n - 1));
      this.flipped.set(false);
      aioToast.success('Card deleted');
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** Space/Enter flips; 1–4 rate once the answer shows (as in Recall). */
  @HostListener('window:keydown', ['$event'])
  protected onKey(event: KeyboardEvent) {
    if (this.loading() || !this.current() || this.busy()) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        'input, textarea, select, [contenteditable="true"], [role="dialog"]',
      )
    )
      return;
    if (event.code === 'Space' || event.code === 'Enter') {
      if (target?.closest('button, a')) return;
      event.preventDefault();
      this.toggle();
      return;
    }
    if (!this.flipped()) return;
    const rating = this.ratings.find((r) => RATING_STYLE[r].key === event.key);
    if (rating) {
      event.preventDefault();
      void this.rate(rating);
    }
  }
}
