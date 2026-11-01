import { Component, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  type Card,
  cardParts,
  DECK_COLOR_LABELS,
  DECK_COLORS,
  type Deck,
  type DeckColor,
  isBeyondSalvage,
  matchesCard,
} from '@all-in-one/applets/english-learning/contracts';
import {
  AioButton,
  AioConfirm,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioEmptyDirectives,
  AioFieldDirectives,
  AioIcon,
  AioInput,
  AioInputGroupDirectives,
  AioNativeSelect,
  AioNativeSelectOption,
  AioSkeleton,
  AioSpinner,
  AioTextarea,
  aioToast,
  provideIcons,
} from '@all-in-one/ui';
import {
  englishErrorMessage as apiErrorMessage,
  englishNumber as faNumber,
} from './english-locale';
import {
  lucideArrowLeft,
  lucideBookOpen,
  lucideCheck,
  lucidePencil,
  lucidePlus,
  lucideRotateCcw,
  lucideSearch,
  lucideSettings2,
  lucideSparkles,
  lucideTrash2,
  lucideVolume2,
} from '@ng-icons/lucide';
import { DECK_TONE } from './deck-colors';
import { EnglishApi, exampleLines } from './english-api';
import { Tts } from './tts';

const PAGE = 30;
const UNIT = /^(?:u\d+)?$/i;

/** A deck (Recall deck-detail): quick add with AI, search, preview, edit, paused cards. */
@Component({
  host: { dir: 'ltr', lang: 'en' },
  selector: 'english-learning-deck',
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
    AioNativeSelect,
    AioNativeSelectOption,
    AioSkeleton,
    AioSpinner,
    AioTextarea,
    RouterLink,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideBookOpen,
      lucideCheck,
      lucidePencil,
      lucidePlus,
      lucideRotateCcw,
      lucideSearch,
      lucideSettings2,
      lucideSparkles,
      lucideTrash2,
      lucideVolume2,
    }),
  ],
  template: `
    <div
      class="applet-english lx-stage mx-auto min-w-0 flex w-full max-w-3xl flex-col gap-6"
    >
      @if (loading()) {
        <div aioSkeleton class="h-28 rounded-3xl"></div>
        <div aioSkeleton class="h-64 rounded-3xl"></div>
      } @else if (deck(); as d) {
        <header class="flex items-start gap-3">
          <a
            aioBtn
            variant="ghost"
            size="icon"
            routerLink="../.."
            aria-label="Back to library"
          >
            <aio-icon name="lucideArrowLeft" />
          </a>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <h1 class="flex items-center gap-2 text-2xl font-bold">
              <span
                class="size-3 shrink-0 rounded-full"
                [class]="tone(d.color).bar"
              ></span>
              <span class="truncate">{{ d.name }}</span>
            </h1>
            @if (d.description) {
              <p class="text-muted-foreground text-sm">{{ d.description }}</p>
            }
            <p class="text-muted-foreground text-sm">
              {{ fa(cards().length) }} cards, {{ fa(dueCount()) }} due for
              review
              @if (pausedCount()) {
                , {{ fa(pausedCount()) }} paused
              }
            </p>
          </div>
          <button
            aioBtn
            variant="ghost"
            size="icon"
            (click)="openEditDeck()"
            aria-label="Deck settings"
          >
            <aio-icon name="lucideSettings2" />
          </button>
        </header>

        <a
          aioBtn
          size="lg"
          class="h-14 w-full rounded-2xl"
          [class.pointer-events-none]="!dueCount()"
          [attr.aria-disabled]="!dueCount()"
          [class.opacity-50]="!dueCount()"
          routerLink="study"
        >
          <aio-icon name="lucideBookOpen" />
          {{
            dueCount()
              ? 'Review ' + fa(dueCount()) + ' cards'
              : 'No cards due right now'
          }}
        </a>

        <section
          class="lx-glass flex flex-col gap-4 rounded-2xl p-4"
          aria-labelledby="add-title"
        >
          <h2 id="add-title" class="font-bold">New card</h2>
          <form
            class="flex flex-col gap-3"
            (submit)="$event.preventDefault(); addCard()"
          >
            <div aioField>
              <label aioFieldLabel for="card-front">Word or phrase</label>
              <input
                aioInput
                id="card-front"
                dir="ltr"
                lang="en"
                autocomplete="off"
                placeholder="e.g. take off"
                [value]="front()"
                (input)="front.set($any($event.target).value)"
                (blur)="autoFill()"
              />
            </div>
            <div aioField>
              <div class="flex items-center justify-between">
                <label aioFieldLabel for="card-back"
                  >Meaning or definition</label
                >
                <button
                  aioBtn
                  type="button"
                  variant="ghost"
                  size="sm"
                  [disabled]="generating()"
                  (click)="fillWithAi()"
                >
                  @if (generating()) {
                    <aio-spinner aria-label="Loading" />
                  } @else {
                    <aio-icon name="lucideSparkles" size="sm" />
                  }
                  Fill with AI
                </button>
              </div>
              <textarea
                aioTextarea
                id="card-back"
                dir="ltr"
                rows="2"
                [value]="back()"
                (input)="back.set($any($event.target).value)"
              ></textarea>
            </div>
            <div class="grid grid-cols-[6rem_1fr] gap-3">
              <div aioField>
                <label aioFieldLabel for="card-unit">Unit</label>
                <input
                  aioInput
                  id="card-unit"
                  dir="ltr"
                  placeholder="u19"
                  [value]="unit()"
                  (input)="unit.set($any($event.target).value)"
                />
              </div>
              <div aioField>
                <label aioFieldLabel for="card-examples"
                  >Examples (optional)</label
                >
                <textarea
                  aioTextarea
                  id="card-examples"
                  dir="ltr"
                  lang="en"
                  rows="2"
                  placeholder="- One example per line"
                  [value]="examples()"
                  (input)="examples.set($any($event.target).value)"
                ></textarea>
              </div>
            </div>
            @if (composerError()) {
              <p class="text-destructive text-sm" role="alert">
                {{ composerError() }}
              </p>
            }
            <button
              aioBtn
              type="submit"
              class="self-start"
              [disabled]="adding()"
            >
              <aio-icon name="lucidePlus" size="sm" />
              Add card
            </button>
          </form>
        </section>

        <section class="flex flex-col gap-3" aria-labelledby="cards-title">
          <h2 id="cards-title" class="text-lg font-bold">Cards</h2>
          <div class="flex gap-2">
            <div aioInputGroup class="flex-1">
              <aio-input-group-addon>
                <aio-icon name="lucideSearch" size="sm" />
              </aio-input-group-addon>
              <input
                aioInputGroupInput
                type="search"
                placeholder="Search cards"
                aria-label="Search cards"
                [value]="search()"
                (input)="setSearch($any($event.target).value)"
              />
            </div>
            @if (units().length) {
              <aio-native-select
                class="w-28"
                selectId="unit-filter"
                aria-label="Unit"
                [value]="selectedUnit()"
                (valueChange)="setUnit($event)"
              >
                <option aioNativeSelectOption value="">All units</option>
                @for (u of units(); track u) {
                  <option aioNativeSelectOption [value]="u">{{ u }}</option>
                }
              </aio-native-select>
            }
          </div>

          @if (!activeCards().length) {
            <div aioEmpty class="lx-glass rounded-2xl">
              <div aioEmptyHeader>
                <h3 aioEmptyTitle>
                  {{ cards().length ? 'No cards found' : 'No cards yet' }}
                </h3>
                <p aioEmptyDescription>
                  {{
                    cards().length
                      ? 'Try another search.'
                      : 'Add your first card above.'
                  }}
                </p>
              </div>
            </div>
          } @else {
            <ul
              class="lx-glass divide-border/60 flex flex-col divide-y rounded-2xl"
            >
              @for (card of visibleCards(); track card.id) {
                <li class="flex min-h-14 items-center gap-2 px-3">
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 flex-col items-start py-2.5 text-start"
                    (click)="openPreview(card)"
                  >
                    <span class="flex w-full items-center gap-2">
                      <span
                        dir="ltr"
                        lang="en"
                        class="truncate font-semibold"
                        >{{ card.front }}</span
                      >
                      @if (parts(card).unit; as u) {
                        <span
                          class="bg-accent text-accent-foreground rounded-full px-2 text-xs"
                          dir="ltr"
                          >{{ u }}</span
                        >
                      }
                    </span>
                    <span
                      dir="ltr"
                      class="text-muted-foreground line-clamp-1 text-sm"
                      >{{ parts(card).body }}</span
                    >
                  </button>
                  <button
                    aioBtn
                    variant="ghost"
                    size="icon"
                    (click)="speak(card.front)"
                    [attr.aria-label]="'Pronunciation ' + card.front"
                  >
                    <aio-icon name="lucideVolume2" size="sm" />
                  </button>
                </li>
              }
            </ul>
            @if (activeCards().length > visibleCards().length) {
              <button
                aioBtn
                variant="outline"
                class="self-center"
                (click)="visibleCount.update((n) => n + page)"
              >
                Show more ({{
                  fa(activeCards().length - visibleCards().length)
                }})
              </button>
            }
          }
        </section>

        @if (suspendedCards().length) {
          <section class="flex flex-col gap-3" aria-labelledby="paused-title">
            <div>
              <h2 id="paused-title" class="text-lg font-bold">Paused cards</h2>
              <p class="text-muted-foreground text-sm">
                Cards you repeatedly forgot are paused from review (the Leitner
                method).
              </p>
            </div>
            <ul
              class="lx-glass divide-border/60 flex flex-col divide-y rounded-2xl"
            >
              @for (card of suspendedCards(); track card.id) {
                <li class="flex min-h-14 items-center gap-2 px-3 py-2">
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span
                      dir="ltr"
                      lang="en"
                      class="truncate text-start font-semibold"
                      >{{ card.front }}</span
                    >
                    @if (beyondSalvage(card)) {
                      <span class="text-destructive text-xs"
                        >Paused twice. Consider rewriting or deleting this
                        card.</span
                      >
                    }
                  </span>
                  <button
                    aioBtn
                    variant="outline"
                    size="sm"
                    (click)="unsuspend(card)"
                  >
                    <aio-icon name="lucideRotateCcw" size="sm" />
                    Resume
                  </button>
                  <button
                    aioBtn
                    variant="ghost"
                    size="icon"
                    class="text-destructive"
                    (click)="deleteCard(card)"
                    [attr.aria-label]="'Delete ' + card.front"
                  >
                    <aio-icon name="lucideTrash2" size="sm" />
                  </button>
                </li>
              }
            </ul>
          </section>
        }
      }
    </div>

    <aio-dialog
      [open]="!!previewCard()"
      (openChange)="$event || previewCard.set(null)"
      [title]="previewCard()?.front ?? ''"
      contentClass="applet-english"
      language="en"
    >
      <ng-template aioDialogBody>
        @if (previewCard(); as card) {
          <div class="flex flex-col gap-4">
            <button
              type="button"
              class="lx-glass flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl p-6 text-center"
              (click)="previewFlipped.update((f) => !f)"
              [attr.aria-label]="previewFlipped() ? 'Show front' : 'Show back'"
            >
              @if (previewFlipped()) {
                @if (parts(card).unit; as u) {
                  <span class="text-muted-foreground text-xs" dir="ltr">{{
                    u
                  }}</span>
                }
                <span dir="ltr" class="text-lg">{{ parts(card).body }}</span>
              } @else {
                <span dir="ltr" lang="en" class="text-3xl font-bold">{{
                  card.front
                }}</span>
                <span class="text-muted-foreground text-xs"
                  >Select to reveal the answer</span
                >
              }
            </button>
            @if (exampleList(card).length) {
              <ul
                dir="ltr"
                lang="en"
                class="text-muted-foreground flex list-disc flex-col gap-1 ps-5 text-sm"
              >
                @for (line of exampleList(card); track $index) {
                  <li>{{ line }}</li>
                }
              </ul>
            }
            <p class="text-muted-foreground text-xs">
              Next review: {{ dueLabel(card) }};
              {{ fa(card.repetitions) }} correct in a row
            </p>
          </div>
        }
      </ng-template>
      <ng-template aioDialogActions>
        <button
          aioBtn
          variant="ghost"
          class="text-destructive"
          (click)="deleteCard(previewCard()!)"
        >
          <aio-icon name="lucideTrash2" size="sm" />
          Delete
        </button>
        <button aioBtn variant="outline" (click)="speak(previewCard()!.front)">
          <aio-icon name="lucideVolume2" size="sm" />
          Pronunciation
        </button>
        <button aioBtn (click)="openEditCard(previewCard()!)">
          <aio-icon name="lucidePencil" size="sm" />
          Edit
        </button>
      </ng-template>
    </aio-dialog>

    <aio-dialog
      [open]="!!editCard()"
      (openChange)="$event || editCard.set(null)"
      title="Edit card"
      contentClass="applet-english"
      language="en"
    >
      <ng-template aioDialogBody>
        <form
          id="edit-card-form"
          class="flex flex-col gap-3"
          (submit)="$event.preventDefault(); saveCard()"
        >
          <div aioField>
            <label aioFieldLabel for="edit-front">Front</label>
            <input
              aioInput
              id="edit-front"
              dir="ltr"
              lang="en"
              [value]="editFront()"
              (input)="editFront.set($any($event.target).value)"
            />
          </div>
          <div aioField>
            <label aioFieldLabel for="edit-back">Back</label>
            <textarea
              aioTextarea
              id="edit-back"
              dir="ltr"
              rows="3"
              [value]="editBack()"
              (input)="editBack.set($any($event.target).value)"
            ></textarea>
          </div>
          <div aioField>
            <label aioFieldLabel for="edit-unit">Unit</label>
            <input
              aioInput
              id="edit-unit"
              dir="ltr"
              placeholder="u19"
              [value]="editUnit()"
              (input)="editUnit.set($any($event.target).value)"
            />
          </div>
          <div aioField>
            <label aioFieldLabel for="edit-examples">Examples</label>
            <textarea
              aioTextarea
              id="edit-examples"
              dir="ltr"
              lang="en"
              rows="3"
              [value]="editExamples()"
              (input)="editExamples.set($any($event.target).value)"
            ></textarea>
          </div>
          @if (editError()) {
            <p class="text-destructive text-sm" role="alert">
              {{ editError() }}
            </p>
          }
        </form>
      </ng-template>
      <ng-template aioDialogActions>
        <button aioBtn variant="outline" (click)="editCard.set(null)">
          Cancel
        </button>
        <button
          aioBtn
          type="submit"
          form="edit-card-form"
          [disabled]="savingCard()"
        >
          Save
        </button>
      </ng-template>
    </aio-dialog>

    <aio-dialog
      [(open)]="deckModal"
      title="Deck settings"
      contentClass="applet-english"
      language="en"
    >
      <ng-template aioDialogBody>
        <form
          id="edit-deck-form"
          class="flex flex-col gap-4"
          (submit)="$event.preventDefault(); saveDeck()"
        >
          <div aioField>
            <label aioFieldLabel for="deck-edit-name">Name</label>
            <input
              aioInput
              id="deck-edit-name"
              [value]="dName()"
              (input)="dName.set($any($event.target).value)"
            />
          </div>
          <div aioField>
            <label aioFieldLabel for="deck-edit-desc">Description</label>
            <textarea
              aioTextarea
              id="deck-edit-desc"
              rows="2"
              [value]="dDesc()"
              (input)="dDesc.set($any($event.target).value)"
            ></textarea>
          </div>
          <fieldset>
            <legend class="mb-2 text-sm font-medium">Colour</legend>
            <div class="flex flex-wrap gap-2">
              @for (c of colors; track c) {
                <button
                  type="button"
                  class="flex size-11 items-center justify-center rounded-full ring-offset-2"
                  [class]="tone(c).bar"
                  [class.ring-2]="dColor() === c"
                  [class.ring-foreground]="dColor() === c"
                  [attr.aria-pressed]="dColor() === c"
                  [attr.aria-label]="colorLabels[c]"
                  (click)="dColor.set(c)"
                >
                  @if (dColor() === c) {
                    <aio-icon name="lucideCheck" size="sm" class="text-white" />
                  }
                </button>
              }
            </div>
          </fieldset>
        </form>
      </ng-template>
      <ng-template aioDialogActions>
        <button
          aioBtn
          variant="ghost"
          class="text-destructive"
          (click)="deleteDeck()"
        >
          <aio-icon name="lucideTrash2" size="sm" />
          Delete deck
        </button>
        <button
          aioBtn
          type="submit"
          form="edit-deck-form"
          [disabled]="savingDeck()"
        >
          Save
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class DeckPage {
  /** Route param, bound by withComponentInputBinding(). */
  readonly id = input<string>();
  private readonly api = inject(EnglishApi);
  private readonly tts = inject(Tts);
  private readonly confirm = inject(AioConfirm);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly page = PAGE;
  protected readonly colors = DECK_COLORS;
  protected readonly colorLabels = DECK_COLOR_LABELS;
  protected readonly deck = signal<Deck | null>(null);
  protected readonly cards = signal<Card[]>([]);
  protected readonly loading = signal(true);
  protected readonly search = signal('');
  protected readonly selectedUnit = signal('');
  protected readonly visibleCount = signal(PAGE);

  protected readonly front = signal('');
  protected readonly back = signal('');
  protected readonly unit = signal('');
  protected readonly examples = signal('');
  protected readonly adding = signal(false);
  protected readonly generating = signal(false);
  protected readonly composerError = signal('');

  protected readonly previewCard = signal<Card | null>(null);
  protected readonly previewFlipped = signal(false);
  protected readonly editCard = signal<Card | null>(null);
  protected readonly editFront = signal('');
  protected readonly editBack = signal('');
  protected readonly editUnit = signal('');
  protected readonly editExamples = signal('');
  protected readonly editError = signal('');
  protected readonly savingCard = signal(false);

  protected readonly deckModal = signal(false);
  protected readonly dName = signal('');
  protected readonly dDesc = signal('');
  protected readonly dColor = signal<DeckColor>('sky');
  protected readonly savingDeck = signal(false);

  protected readonly fa = (n: number) => faNumber(n);
  protected readonly tone = (c: DeckColor) => DECK_TONE[c];
  protected readonly parts = cardParts;
  protected readonly beyondSalvage = isBeyondSalvage;
  protected readonly exampleList = (card: Card) => exampleLines(card.examples);

  protected readonly dueCount = computed(
    () =>
      this.cards().filter(
        (c) => !c.suspended && new Date(c.dueAt).getTime() <= Date.now(),
      ).length,
  );
  protected readonly pausedCount = computed(
    () => this.cards().filter((c) => c.suspended).length,
  );
  protected readonly units = computed(() =>
    [
      ...new Set(
        this.cards()
          .map((c) => cardParts(c).unit)
          .filter((u): u is string => !!u),
      ),
    ].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
  );
  protected readonly activeCards = computed(() =>
    this.cards().filter(
      (c) => !c.suspended && matchesCard(c, this.search(), this.selectedUnit()),
    ),
  );
  protected readonly suspendedCards = computed(() =>
    this.cards().filter(
      (c) => c.suspended && matchesCard(c, this.search(), this.selectedUnit()),
    ),
  );
  protected readonly visibleCards = computed(() =>
    this.activeCards().slice(0, this.visibleCount()),
  );

  constructor() {
    queueMicrotask(() => this.load());
  }

  private deckId(): string {
    return this.id() ?? this.route.snapshot.paramMap.get('id') ?? '';
  }

  private async load() {
    this.loading.set(true);
    try {
      const [deck, cards] = await Promise.all([
        this.api.deck(this.deckId()),
        this.api.cards(this.deckId()),
      ]);
      this.deck.set(deck);
      this.cards.set(cards);
    } catch (error) {
      aioToast.error(apiErrorMessage(error, 'Unable to load this deck.'));
      await this.router.navigate(['../..'], { relativeTo: this.route });
    } finally {
      this.loading.set(false);
    }
  }

  protected setSearch(value: string) {
    this.search.set(value);
    this.visibleCount.set(PAGE);
  }

  protected setUnit(value: string) {
    this.selectedUnit.set(value);
    this.visibleCount.set(PAGE);
  }

  protected speak(text: string) {
    void this.tts.speak(text);
  }

  protected dueLabel(card: Card): string {
    const days = Math.round(
      (new Date(card.dueAt).getTime() - Date.now()) / 86400000,
    );
    if (days <= 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `In ${faNumber(days)} days`;
  }

  /** Fills the answer (and empty examples) with an AI suggestion for the front. */
  protected async fillWithAi() {
    const front = this.front().trim();
    if (!front) {
      aioToast.error('Enter the front of the card first.');
      return;
    }
    if (this.generating()) return;
    this.generating.set(true);
    try {
      const answer = await this.api.cardAnswer(front, this.deck()?.name);
      // Ignore a late answer when the front changed meanwhile.
      if (this.front().trim() !== front) return;
      this.back.set(answer.back);
      if (!this.examples().trim()) this.examples.set(answer.examples);
    } catch (error) {
      aioToast.error(apiErrorMessage(error, 'Unable to generate an answer.'));
    } finally {
      this.generating.set(false);
    }
  }

  /** Recall fills the answer automatically once the front is written and the back is empty. */
  protected autoFill() {
    if (this.front().trim() && !this.back().trim()) void this.fillWithAi();
  }

  protected async addCard() {
    const front = this.front().trim();
    const back = this.back().trim();
    const unit = this.unit().trim().toLowerCase();
    if (!front || !back) {
      this.composerError.set('Enter the word and its definition.');
      return;
    }
    if (!UNIT.test(unit)) {
      this.composerError.set('Use a short unit code, such as u19.');
      return;
    }
    this.composerError.set('');
    this.adding.set(true);
    try {
      const card = await this.api.createCard({
        deckId: this.deckId(),
        front,
        back,
        unit,
        examples: this.examples().trim(),
      });
      this.cards.update((list) => [...list, card]);
      aioToast.success(`«${card.front.slice(0, 40)}» Added`);
      this.front.set('');
      this.back.set('');
      this.examples.set('');
    } catch (error) {
      aioToast.error(apiErrorMessage(error, 'Unable to add the card.'));
    } finally {
      this.adding.set(false);
    }
  }

  protected openPreview(card: Card) {
    this.previewFlipped.set(false);
    this.previewCard.set(card);
  }

  protected openEditCard(card: Card) {
    this.previewCard.set(null);
    this.editError.set('');
    this.editFront.set(card.front);
    this.editBack.set(cardParts(card).body);
    this.editUnit.set(cardParts(card).unit ?? '');
    this.editExamples.set(card.examples);
    this.editCard.set(card);
  }

  protected async saveCard() {
    const card = this.editCard();
    if (!card || this.savingCard()) return;
    const front = this.editFront().trim();
    const back = this.editBack().trim();
    const unit = this.editUnit().trim().toLowerCase();
    if (!front || !back) {
      this.editError.set('Enter both sides of the card.');
      return;
    }
    if (!UNIT.test(unit)) {
      this.editError.set('Use a short unit code, such as u19.');
      return;
    }
    this.savingCard.set(true);
    try {
      const saved = await this.api.updateCard(card.id, {
        front,
        back,
        unit,
        examples: this.editExamples().trim(),
      });
      this.cards.update((list) =>
        list.map((c) => (c.id === card.id ? saved : c)),
      );
      this.editCard.set(null);
      aioToast.success('Card updated');
    } catch (error) {
      this.editError.set(apiErrorMessage(error, 'Unable to save the card.'));
    } finally {
      this.savingCard.set(false);
    }
  }

  protected async deleteCard(card: Card) {
    this.previewCard.set(null);
    const ok = await this.confirm.ask({
      language: 'en',
      title: 'Delete this card?',
      description: `“${card.front}” will be permanently deleted.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.api.removeCard(card.id);
      this.cards.update((list) => list.filter((c) => c.id !== card.id));
      aioToast.success('Card deleted');
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

  protected async unsuspend(card: Card) {
    try {
      const saved = await this.api.unsuspend(card.id);
      this.cards.update((list) =>
        list.map((c) => (c.id === card.id ? saved : c)),
      );
      aioToast.success('Card returned to review');
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

  protected openEditDeck() {
    const d = this.deck();
    if (!d) return;
    this.dName.set(d.name);
    this.dDesc.set(d.description);
    this.dColor.set(d.color);
    this.deckModal.set(true);
  }

  protected async saveDeck() {
    const d = this.deck();
    const name = this.dName().trim();
    if (!d) return;
    if (!name) {
      aioToast.error('Enter a name for the deck.');
      return;
    }
    this.savingDeck.set(true);
    try {
      this.deck.set(
        await this.api.updateDeck(d.id, {
          name,
          description: this.dDesc().trim(),
          color: this.dColor(),
        }),
      );
      this.deckModal.set(false);
      aioToast.success('Deck updated');
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.savingDeck.set(false);
    }
  }

  protected async deleteDeck() {
    const d = this.deck();
    if (!d) return;
    this.deckModal.set(false);
    const ok = await this.confirm.ask({
      language: 'en',
      title: 'Delete this deck?',
      description: `“${d.name}” and all its cards will be permanently deleted.`,
      confirmText: 'Delete deck',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.api.removeDeck(d.id);
      aioToast.success('Deck deleted');
      await this.router.navigate(['../..'], { relativeTo: this.route });
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }
}
