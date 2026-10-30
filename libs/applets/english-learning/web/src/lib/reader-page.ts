import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  type DeckWithStats,
  parseReading,
  type ReadingDoc,
  type ReadingText,
  type ReadingToken,
} from '@all-in-one/applets/english-learning/contracts';
import {
  AioButton,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioFieldDirectives,
  AioIcon,
  AioInput,
  AioNativeSelect,
  AioNativeSelectOption,
  AioSkeleton,
  AioSpinner,
  AioTextarea,
  aioToast,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage } from '@all-in-one/web/shared';
import {
  lucideArrowRight,
  lucidePause,
  lucidePlay,
  lucidePlus,
  lucideStar,
  lucideVolume2,
} from '@ng-icons/lucide';
import { EnglishApi, remember } from './english-api';
import { Tts } from './tts';

const DECK_KEY = 'aio.english.reader.deck';
const UNIT_KEY = 'aio.english.reader.unit';

/**
 * Reader (Recall): read aloud with the current passage highlighted; double-click
 * (or double-tap) a word to look it up in context and save it as a card; rate
 * AI-written texts so the next one fits better.
 */
@Component({
  selector: 'english-learning-reader',
  imports: [
    AioButton,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioFieldDirectives,
    AioIcon,
    AioInput,
    AioNativeSelect,
    AioNativeSelectOption,
    AioSkeleton,
    AioSpinner,
    AioTextarea,
    RouterLink,
  ],
  providers: [
    provideIcons({
      lucideArrowRight,
      lucidePause,
      lucidePlay,
      lucidePlus,
      lucideStar,
      lucideVolume2,
    }),
  ],
  template: `
    <div class="applet-english mx-auto flex w-full max-w-2xl flex-col gap-6">
      @if (loading()) {
        <div aioSkeleton class="h-12 rounded-2xl"></div>
        <div aioSkeleton class="h-96 rounded-3xl"></div>
      } @else if (text(); as t) {
        <header class="flex items-start gap-3">
          <a
            aioBtn
            variant="ghost"
            size="icon"
            routerLink="../../texts"
            aria-label="بازگشت به متن‌ها"
          >
            <aio-icon name="lucideArrowRight" />
          </a>
          <h1
            dir="ltr"
            lang="en"
            class="min-w-0 flex-1 text-start text-2xl font-bold"
          >
            {{ t.title }}
          </h1>
        </header>

        <div
          class="glass sticky top-2 z-10 flex items-center gap-3 rounded-2xl p-2"
        >
          <button aioBtn class="btn-3d rounded-xl" (click)="toggleReading()">
            <aio-icon
              [name]="reading() ? 'lucidePause' : 'lucidePlay'"
              size="sm"
            />
            {{ reading() ? 'توقف' : 'خواندن با صدا' }}
          </button>
          <p class="text-muted-foreground text-xs">
            روی هر واژه دو بار بزن تا معنی‌اش را ببینی و کارت بسازی.
          </p>
        </div>

        <article
          dir="ltr"
          lang="en"
          class="glass flex flex-col gap-4 rounded-3xl p-5 text-lg leading-loose select-text"
          (dblclick)="onDoubleClick($event)"
          (pointerup)="onPointerUp($event)"
        >
          @for (paragraph of doc().paragraphs; track $index) {
            <p>
              @for (token of paragraph; track token.id) {
                @if (token.word) {
                  <span
                    [attr.data-t]="token.id"
                    class="cursor-pointer rounded"
                    [class]="tokenClass(token)"
                    >{{ token.text }}</span
                  >
                } @else {
                  <span [class]="tokenClass(token)">{{ token.text }}</span>
                }
              }
            </p>
          }
        </article>

        @if (t.ai) {
          <section
            class="glass flex flex-col gap-3 rounded-2xl p-4"
            aria-labelledby="rate-title"
          >
            <h2 id="rate-title" class="font-bold">این متن چطور بود؟</h2>
            <p class="text-muted-foreground text-sm">
              امتیاز و یادداشتت، متن بعدی هوش مصنوعی را بهتر می‌کند.
            </p>
            <div class="flex gap-1" role="radiogroup" aria-label="امتیاز">
              @for (s of stars; track s) {
                <button
                  type="button"
                  role="radio"
                  class="flex size-11 items-center justify-center rounded-full"
                  [class.text-[var(--streak)]]="s <= rating()"
                  [class.text-muted-foreground]="s > rating()"
                  [attr.aria-checked]="s === rating()"
                  [attr.aria-label]="s + ' ستاره'"
                  (click)="rating.set(s)"
                >
                  <aio-icon
                    name="lucideStar"
                    [class]="s <= rating() ? '[&_svg]:fill-current' : ''"
                  />
                </button>
              }
            </div>
            <label for="rate-note" class="sr-only">یادداشت</label>
            <textarea
              aioTextarea
              id="rate-note"
              rows="2"
              placeholder="مثلاً: سخت‌تر باشد، گفت‌وگوی بیشتری داشته باشد…"
              [value]="note()"
              (input)="note.set($any($event.target).value)"
            ></textarea>
            <button
              aioBtn
              class="self-start"
              [disabled]="savingReview()"
              (click)="saveReview()"
            >
              ثبت امتیاز
            </button>
          </section>
        }
      }
    </div>

    <aio-dialog
      [open]="!!lookup()"
      (openChange)="$event || close()"
      [title]="lookup()?.text ?? ''"
      description="معنی در همین جمله"
      contentClass="applet-english"
    >
      <ng-template aioDialogBody>
        <form
          id="reader-card-form"
          class="flex flex-col gap-3"
          (submit)="$event.preventDefault(); addCard()"
        >
          @if (looking()) {
            <p class="text-muted-foreground flex items-center gap-2 text-sm">
              <aio-spinner /> در حال پیدا کردن معنی…
            </p>
          }
          @if (lookupError()) {
            <p class="text-destructive text-sm" role="alert">
              {{ lookupError() }}
              <button
                aioBtn
                variant="link"
                size="sm"
                type="button"
                (click)="define()"
              >
                دوباره
              </button>
            </p>
          }
          <div aioField>
            <label aioFieldLabel for="lookup-front">رو</label>
            <div class="flex gap-2">
              <input
                aioInput
                id="lookup-front"
                dir="ltr"
                lang="en"
                [value]="front()"
                (input)="front.set($any($event.target).value); checkDuplicate()"
              />
              <button
                aioBtn
                type="button"
                variant="outline"
                size="icon"
                (click)="speak(front())"
                aria-label="تلفظ"
              >
                <aio-icon name="lucideVolume2" size="sm" />
              </button>
            </div>
            @if (duplicate()) {
              <p class="text-xs text-[var(--streak)]">
                این واژه از قبل در این دسته هست.
              </p>
            }
          </div>
          <div aioField>
            <label aioFieldLabel for="lookup-back">معنی</label>
            <textarea
              aioTextarea
              id="lookup-back"
              dir="auto"
              rows="2"
              [value]="back()"
              (input)="back.set($any($event.target).value)"
            ></textarea>
          </div>
          <div aioField>
            <label aioFieldLabel for="lookup-examples">مثال‌ها</label>
            <textarea
              aioTextarea
              id="lookup-examples"
              dir="ltr"
              lang="en"
              rows="3"
              [value]="examples()"
              (input)="examples.set($any($event.target).value)"
            ></textarea>
          </div>
          <div class="grid grid-cols-[1fr_6rem] gap-3">
            <div aioField>
              <label aioFieldLabel for="lookup-deck">دسته</label>
              <aio-native-select
                selectId="lookup-deck"
                [value]="deckId()"
                (valueChange)="setDeck($event)"
              >
                @for (d of decks(); track d.id) {
                  <option aioNativeSelectOption [value]="d.id">
                    {{ d.name }}
                  </option>
                }
              </aio-native-select>
            </div>
            <div aioField>
              <label aioFieldLabel for="lookup-unit">واحد</label>
              <input
                aioInput
                id="lookup-unit"
                dir="ltr"
                placeholder="u19"
                [value]="unit()"
                (input)="unit.set($any($event.target).value)"
              />
            </div>
          </div>
          @if (formError()) {
            <p class="text-destructive text-sm" role="alert">
              {{ formError() }}
            </p>
          }
        </form>
      </ng-template>
      <ng-template aioDialogActions>
        <button aioBtn variant="outline" (click)="close()">بستن</button>
        <button
          aioBtn
          type="submit"
          form="reader-card-form"
          [disabled]="adding() || !decks().length"
        >
          <aio-icon name="lucidePlus" size="sm" />
          افزودن کارت
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class ReaderPage {
  /** Route param, bound by withComponentInputBinding(). */
  readonly id = input<string>();
  private readonly api = inject(EnglishApi);
  private readonly tts = inject(Tts);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly text = signal<ReadingText | null>(null);
  protected readonly doc = signal<ReadingDoc>({
    paragraphs: [],
    sentences: [],
    chunks: [],
  });
  protected readonly decks = signal<DeckWithStats[]>([]);
  protected readonly loading = signal(true);

  protected readonly stars = [1, 2, 3, 4, 5];
  protected readonly rating = signal(0);
  protected readonly note = signal('');
  protected readonly savingReview = signal(false);

  protected readonly reading = signal(false);
  protected readonly chunk = signal(-1);
  protected readonly readingSentences = computed(
    () => new Set(this.doc().chunks[this.chunk()] ?? []),
  );
  protected readonly marked = signal<ReadonlySet<number>>(new Set());
  protected readonly saved = signal<ReadonlySet<string>>(new Set());

  protected readonly lookup = signal<ReadingToken | null>(null);
  protected readonly looking = signal(false);
  protected readonly lookupError = signal('');
  protected readonly front = signal('');
  protected readonly back = signal('');
  protected readonly examples = signal('');
  protected readonly deckId = signal('');
  protected readonly unit = signal('');
  protected readonly adding = signal(false);
  protected readonly formError = signal('');
  protected readonly duplicate = signal(false);
  private readonly deckFronts = new Map<string, Set<string>>();
  private lookupSeq = 0;
  private lastTap = { id: -1, at: 0 };

  constructor() {
    queueMicrotask(() => this.load());
    inject(DestroyRef).onDestroy(() => this.tts.stop());
  }

  /** Highlights the passage being read, looked-up words and words saved as cards. */
  protected tokenClass(token: ReadingToken): string {
    const classes = [];
    if (this.readingSentences().has(token.sentence))
      classes.push('bg-primary/15');
    if (this.marked().has(token.id)) classes.push('bg-accent');
    if (token.word && this.saved().has(token.text.toLowerCase()))
      classes.push('underline decoration-primary decoration-2');
    return classes.join(' ');
  }

  private async load() {
    try {
      const id = this.id() ?? this.route.snapshot.paramMap.get('id') ?? '';
      const [text, decks] = await Promise.all([
        this.api.text(id),
        this.api.decks(),
      ]);
      this.text.set(text);
      this.rating.set(text.rating ?? 0);
      this.note.set(text.reviewNote);
      this.doc.set(parseReading(text.body));
      this.decks.set(decks);
    } catch (error) {
      aioToast.error(apiErrorMessage(error, 'این متن باز نشد.'));
      await this.router.navigate(['../../texts'], { relativeTo: this.route });
    } finally {
      this.loading.set(false);
    }
  }

  protected async saveReview() {
    const text = this.text();
    if (!text || !this.rating()) {
      aioToast.error('اول تعداد ستاره را انتخاب کن.');
      return;
    }
    this.savingReview.set(true);
    try {
      this.text.set(
        await this.api.rateText(text.id, this.rating(), this.note().trim()),
      );
      aioToast.success('ممنون! متن بعدی را با این نظر می‌نویسیم.');
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.savingReview.set(false);
    }
  }

  protected async toggleReading() {
    if (this.reading()) {
      this.tts.stop();
      return;
    }
    const { chunks, sentences } = this.doc();
    this.reading.set(true);
    try {
      await this.tts.readAloud(
        chunks.map((c) => c.map((i) => sentences[i]).join(' ')),
        (i) => this.chunk.set(i),
      );
    } finally {
      this.reading.set(false);
      this.chunk.set(-1);
    }
  }

  private tokenAt(event: Event): ReadingToken | null {
    const el = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-t]',
    );
    if (!el) return null;
    const id = Number(el.dataset['t']);
    for (const paragraph of this.doc().paragraphs) {
      const token = paragraph.find((t) => t.id === id);
      if (token) return token;
    }
    return null;
  }

  protected onDoubleClick(event: MouseEvent) {
    const token = this.tokenAt(event);
    if (!token?.word) return;
    window.getSelection()?.removeAllRanges();
    void this.open(token);
  }

  /** Touch browsers do not reliably fire dblclick, so detect a double tap. */
  protected onPointerUp(event: PointerEvent) {
    if (event.pointerType !== 'touch') return;
    const token = this.tokenAt(event);
    if (!token?.word) return;
    const now = Date.now();
    if (this.lastTap.id === token.id && now - this.lastTap.at < 400) {
      this.lastTap = { id: -1, at: 0 };
      event.preventDefault();
      void this.open(token);
    } else {
      this.lastTap = { id: token.id, at: now };
    }
  }

  private async open(token: ReadingToken) {
    if (this.lookup()) return;
    this.marked.update((set) => new Set(set).add(token.id));
    this.lookup.set(token);
    this.front.set(token.text);
    this.back.set('');
    this.examples.set('');
    this.lookupError.set('');
    this.formError.set('');
    const last = remember(DECK_KEY);
    this.deckId.set(
      this.decks().some((d) => d.id === last)
        ? last
        : (this.decks()[0]?.id ?? ''),
    );
    this.unit.set(remember(UNIT_KEY));
    void this.loadDeckFronts();
    await this.define(token);
  }

  /** Asks AI for the meaning used in this sentence. */
  protected async define(token = this.lookup()) {
    if (!token) return;
    const seq = ++this.lookupSeq;
    this.looking.set(true);
    this.lookupError.set('');
    try {
      const deck = this.decks().find((d) => d.id === this.deckId())?.name;
      const answer = await this.api.cardAnswer(
        token.text,
        deck,
        this.doc().sentences[token.sentence],
      );
      if (seq !== this.lookupSeq || this.lookup() !== token) return;
      this.front.set(answer.front);
      this.back.set(answer.back);
      this.examples.set(answer.examples);
      this.checkDuplicate();
    } catch (error) {
      if (seq === this.lookupSeq)
        this.lookupError.set(apiErrorMessage(error, 'معنی پیدا نشد.'));
    } finally {
      if (seq === this.lookupSeq) this.looking.set(false);
    }
  }

  protected close() {
    this.lookupSeq++;
    this.looking.set(false);
    this.lookup.set(null);
  }

  protected speak(text: string) {
    void this.tts.speak(text);
  }

  protected setDeck(id: string) {
    this.deckId.set(id);
    void this.loadDeckFronts();
  }

  private async loadDeckFronts() {
    const id = this.deckId();
    if (!id || this.deckFronts.has(id)) return this.checkDuplicate();
    try {
      const cards = await this.api.cards(id);
      this.deckFronts.set(
        id,
        new Set(cards.map((c) => c.front.trim().toLowerCase())),
      );
    } catch {
      // The duplicate hint is optional; adding still works.
    }
    this.checkDuplicate();
  }

  protected checkDuplicate() {
    this.duplicate.set(
      !!this.deckFronts
        .get(this.deckId())
        ?.has(this.front().trim().toLowerCase()),
    );
  }

  protected async addCard() {
    const token = this.lookup();
    const front = this.front().trim();
    const back = this.back().trim();
    const unit = this.unit().trim().toLowerCase();
    if (!token || this.adding()) return;
    if (!this.deckId()) {
      this.formError.set('یک دسته برای این کارت انتخاب کن.');
      return;
    }
    if (!front || !back) {
      this.formError.set('واژه و معنی آن را بنویس.');
      return;
    }
    if (!/^(?:u\d+)?$/.test(unit)) {
      this.formError.set('واحد را کوتاه بنویس، مثل u19.');
      return;
    }
    this.adding.set(true);
    try {
      await this.api.createCard({
        deckId: this.deckId(),
        front,
        back,
        unit,
        examples: this.examples().trim(),
      });
      remember(DECK_KEY, this.deckId());
      remember(UNIT_KEY, unit);
      this.deckFronts.get(this.deckId())?.add(front.toLowerCase());
      this.saved.update((set) => new Set(set).add(token.text.toLowerCase()));
      const deck = this.decks().find((d) => d.id === this.deckId());
      aioToast.success(
        `«${front.slice(0, 40)}» به ${deck?.name ?? 'دسته'} اضافه شد`,
      );
      this.close();
    } catch (error) {
      this.formError.set(apiErrorMessage(error, 'کارت اضافه نشد.'));
    } finally {
      this.adding.set(false);
    }
  }
}
