import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CONVERSATION_SITUATIONS,
  type ConversationSituation,
  type DeckWithStats,
  type Dialogue,
  READING_LEVELS,
  type ReadingLevel,
  type SpeechVoice,
  type UsefulPhrase,
  type WritingFeedback,
  type WritingTask,
} from '@all-in-one/applets/english-learning/contracts';
import {
  AioButton,
  AioEmptyDirectives,
  AioFieldDirectives,
  AioIcon,
  AioNativeSelect,
  AioNativeSelectOption,
  AioSpinner,
  AioTextarea,
  aioToast,
  AioToggleGroupDirectives,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage } from '@all-in-one/web/shared';
import {
  lucideCheck,
  lucideEye,
  lucideEyeOff,
  lucideHeadphones,
  lucideMessageSquare,
  lucideMic,
  lucidePause,
  lucidePenLine,
  lucidePlay,
  lucidePlus,
  lucideSquare,
  lucideVolume2,
  lucideX,
} from '@ng-icons/lucide';
import { EnglishApi, remember } from './english-api';
import { Tts } from './tts';

type Mode = 'writing' | 'speaking' | 'listening';
const MODES: Mode[] = ['writing', 'speaking', 'listening'];
const DECK_KEY = 'aio.english.practice.deck';
const MAX_RECORDING = 1500 * 1024;

interface TaskState {
  task: WritingTask | null;
  answer: string;
  feedback: WritingFeedback | null;
  situation: ConversationSituation;
  level: ReadingLevel;
}
const freshTask = (): TaskState => ({
  task: null,
  answer: '',
  feedback: null,
  situation: 'small-talk',
  level: 'B1',
});

/** Everyday-conversation practice (Recall practice page): writing, speaking, listening. */
@Component({
  selector: 'english-learning-practice',
  imports: [
    AioButton,
    AioEmptyDirectives,
    AioFieldDirectives,
    AioIcon,
    AioNativeSelect,
    AioNativeSelectOption,
    AioSpinner,
    AioTextarea,
    AioToggleGroupDirectives,
    NgTemplateOutlet,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideEye,
      lucideEyeOff,
      lucideHeadphones,
      lucideMessageSquare,
      lucideMic,
      lucidePause,
      lucidePenLine,
      lucidePlay,
      lucidePlus,
      lucideSquare,
      lucideVolume2,
      lucideX,
    }),
  ],
  template: `
    <div class="flex flex-col gap-6">
      <header>
        <h1 class="text-2xl font-bold">تمرین مکالمه</h1>
        <p class="text-muted-foreground text-sm">انگلیسی روزمره: بنویس، بگو و گوش کن.</p>
      </header>

      <div
        aioToggleGroup
        type="single"
        spacing="1"
        class="glass grid w-full grid-cols-3 rounded-2xl p-1"
        aria-label="نوع تمرین"
        [value]="mode()"
        (valueChange)="setMode($event)"
      >
        @for (m of modes; track m) {
          <button
            aioToggleGroupItem
            [value]="m"
            class="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 gap-1.5 rounded-xl"
          >
            <aio-icon [name]="modeIcons[m]" size="sm" />
            {{ modeLabels[m] }}
          </button>
        }
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div aioField>
          <label aioFieldLabel for="practice-situation">موقعیت</label>
          <aio-native-select selectId="practice-situation" [value]="situation()" (valueChange)="situation.set($any($event))">
            @for (s of situations; track s.id) {
              <option aioNativeSelectOption [value]="s.id">{{ s.fa }}</option>
            }
          </aio-native-select>
        </div>
        <div aioField>
          <label aioFieldLabel for="practice-level">سطح</label>
          <aio-native-select selectId="practice-level" [value]="level()" (valueChange)="level.set($any($event))">
            @for (l of levels; track l.id) {
              <option aioNativeSelectOption [value]="l.id">{{ l.fa }}</option>
            }
          </aio-native-select>
        </div>
      </div>

      @if (error()) {
        <p class="text-destructive text-sm" role="alert">{{ error() }}</p>
      }

      @if (mode() === 'listening') {
        <button aioBtn size="lg" class="btn-3d h-14 rounded-2xl" [disabled]="busy()" (click)="newDialogue()">
          @if (busy()) {
            <aio-spinner /> در حال آماده کردن…
          } @else {
            <aio-icon name="lucideHeadphones" /> گفت‌وگوی تازه
          }
        </button>

        @if (dialogue(); as d) {
          <section class="glass flex flex-col gap-4 rounded-2xl p-4" aria-labelledby="dialogue-title">
            <h2 id="dialogue-title" dir="ltr" lang="en" class="text-start text-lg font-bold">{{ d.title }}</h2>
            <div class="flex flex-wrap items-center gap-2">
              <button aioBtn (click)="playAll()">
                <aio-icon [name]="playing() ? 'lucidePause' : 'lucidePlay'" size="sm" />
                {{ playing() ? 'توقف' : 'پخش گفت‌وگو' }}
              </button>
              <div aioToggleGroup type="single" variant="outline" [value]="speedValue()" (valueChange)="setSpeed($event)" aria-label="سرعت">
                <button aioToggleGroupItem value="0.75">آهسته</button>
                <button aioToggleGroupItem value="1">عادی</button>
              </div>
              <button aioBtn variant="ghost" (click)="showText.update(v => !v)">
                <aio-icon [name]="showText() ? 'lucideEyeOff' : 'lucideEye'" size="sm" />
                {{ showText() ? 'پنهان کردن متن' : 'نمایش متن' }}
              </button>
            </div>
            @if (showText()) {
              <ol dir="ltr" lang="en" class="flex flex-col gap-2">
                @for (l of d.lines; track $index) {
                  <li
                    class="flex gap-2 rounded-xl p-2"
                    [class.bg-accent]="line() === $index"
                  >
                    <button
                      type="button"
                      class="text-primary shrink-0 font-bold"
                      (click)="speak(l.text, speakerVoice(l.speaker))"
                      [attr.aria-label]="'پخش جمله ' + l.speaker"
                    >{{ l.speaker }}:</button>
                    <span>{{ l.text }}</span>
                  </li>
                }
              </ol>
            }
          </section>

          @if (d.questions.length) {
            <section class="flex flex-col gap-3" aria-labelledby="questions-title">
              <h2 id="questions-title" class="text-lg font-bold">سؤال‌ها</h2>
              @for (q of d.questions; track $index; let qi = $index) {
                <div class="glass flex flex-col gap-2 rounded-2xl p-4" role="group" [attr.aria-labelledby]="'q-' + qi">
                  <p [id]="'q-' + qi" dir="ltr" lang="en" class="mb-1 text-start font-semibold">{{ q.question }}</p>
                  @for (o of q.options; track $index; let oi = $index) {
                    <button
                      type="button"
                      dir="ltr"
                      lang="en"
                      class="flex min-h-11 items-center justify-between rounded-xl border-2 px-3 text-start"
                      [class]="optionClass(qi, oi, q.answer)"
                      [disabled]="qi in choices()"
                      (click)="choose(qi, oi)"
                    >
                      <span>{{ o }}</span>
                      @if (qi in choices() && oi === q.answer) {
                        <aio-icon name="lucideCheck" size="sm" aria-label="درست" />
                      } @else if (choices()[qi] === oi) {
                        <aio-icon name="lucideX" size="sm" aria-label="نادرست" />
                      }
                    </button>
                  }
                </div>
              }
            </section>
          }
          <ng-container *ngTemplateOutlet="phrasesTpl; context: { $implicit: d.phrases }" />
        }
      } @else {
        <button aioBtn size="lg" class="btn-3d h-14 rounded-2xl" [disabled]="busy()" (click)="newTask()">
          @if (busy() && !current().task) {
            <aio-spinner /> در حال آماده کردن…
          } @else {
            <aio-icon [name]="mode() === 'speaking' ? 'lucideMic' : 'lucidePenLine'" />
            تمرین تازه
          }
        </button>

        @if (current().task; as task) {
          <section class="glass flex flex-col gap-3 rounded-2xl p-4" aria-labelledby="task-title">
            <h2 id="task-title" class="sr-only">تمرین</h2>
            <p dir="ltr" lang="en" class="text-start">{{ task.scenario }}</p>
            @if (task.message) {
              <div dir="ltr" lang="en" class="bg-accent text-accent-foreground flex items-start gap-2 self-start rounded-2xl rounded-ss-sm p-3">
                <aio-icon name="lucideMessageSquare" size="sm" class="mt-1 shrink-0" />
                <span>{{ task.message }}</span>
                <button aioBtn variant="ghost" size="icon-sm" (click)="speak(task.message)" aria-label="شنیدن پیام">
                  <aio-icon name="lucideVolume2" size="sm" />
                </button>
              </div>
            }

            @if (mode() === 'speaking') {
              <div class="flex flex-wrap items-center gap-3">
                <button
                  aioBtn
                  size="lg"
                  class="rounded-full"
                  [class]="recording() ? '[--primary:var(--destructive)]' : ''"
                  [disabled]="transcribing()"
                  (click)="record()"
                >
                  <aio-icon [name]="recording() ? 'lucideSquare' : 'lucideMic'" />
                  {{ recording() ? 'پایان ضبط' : 'ضبط پاسخ' }}
                </button>
                @if (transcribing()) {
                  <span class="text-muted-foreground flex items-center gap-2 text-sm"><aio-spinner /> در حال تبدیل صدا به متن…</span>
                }
                @if (recordingUrl()) {
                  <audio [src]="recordingUrl()" controls class="h-10 max-w-full"></audio>
                }
              </div>
            }

            <label for="practice-answer" class="text-sm font-medium">
              {{ mode() === 'speaking' ? 'آنچه گفتی (می‌توانی اصلاحش کنی)' : 'پاسخ تو' }}
            </label>
            <textarea
              aioTextarea
              id="practice-answer"
              dir="ltr"
              lang="en"
              rows="4"
              [value]="current().answer"
              (input)="patch({ answer: $any($event.target).value, feedback: null })"
            ></textarea>
            <button aioBtn class="self-start" [disabled]="busy() || !current().answer.trim()" (click)="check()">
              @if (busy()) {
                <aio-spinner />
              } @else {
                <aio-icon name="lucideCheck" size="sm" />
              }
              بررسی
            </button>
          </section>

          @if (current().feedback; as f) {
            <section class="glass flex flex-col gap-4 rounded-2xl p-4" aria-labelledby="feedback-title">
              <h2 id="feedback-title" class="text-lg font-bold">بازخورد</h2>
              @if (f.comment) {
                <p dir="ltr" lang="en" class="text-primary text-start font-semibold">{{ f.comment }}</p>
              }
              <div class="flex flex-col gap-1">
                <span class="text-muted-foreground text-sm">اصلاح‌شده</span>
                <p dir="ltr" lang="en" class="text-start">{{ f.corrected }}</p>
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-muted-foreground text-sm">طبیعی‌تر</span>
                <p dir="ltr" lang="en" class="flex items-start gap-2 text-start">
                  {{ f.natural }}
                  <button aioBtn variant="ghost" size="icon-sm" (click)="speak(f.natural)" aria-label="شنیدن">
                    <aio-icon name="lucideVolume2" size="sm" />
                  </button>
                </p>
              </div>
              @if (f.mistakes.length) {
                <div class="flex flex-col gap-2">
                  <span class="text-muted-foreground text-sm">اشتباه‌ها</span>
                  <ul dir="ltr" lang="en" class="flex flex-col gap-2">
                    @for (m of f.mistakes; track $index) {
                      <li class="bg-background/60 rounded-xl p-3 text-start">
                        <span class="text-destructive line-through">{{ m.original }}</span>
                        → <span class="text-success font-semibold">{{ m.fix }}</span>
                        @if (m.why) {
                          <p class="text-muted-foreground text-sm">{{ m.why }}</p>
                        }
                      </li>
                    }
                  </ul>
                </div>
              }
            </section>
            <ng-container *ngTemplateOutlet="phrasesTpl; context: { $implicit: f.phrases }" />
          }
        } @else if (!busy()) {
          <div aioEmpty class="glass rounded-2xl">
            <div aioEmptyHeader>
              <h2 aioEmptyTitle>{{ mode() === 'speaking' ? 'بلند جواب بده' : 'کوتاه بنویس' }}</h2>
              <p aioEmptyDescription>
                موقعیت را انتخاب کن و «تمرین تازه» را بزن. بعد پاسخت را بررسی می‌کنیم.
              </p>
            </div>
          </div>
        }
      }
    </div>

    <ng-template #phrasesTpl let-phrases>
      @if (phrases.length) {
        <section class="flex flex-col gap-3" aria-labelledby="phrases-title">
          <div class="flex items-center justify-between gap-3">
            <h2 id="phrases-title" class="text-lg font-bold">عبارت‌های کاربردی</h2>
            @if (decks().length) {
              <aio-native-select class="w-40" selectId="phrase-deck" [value]="deckId()" (valueChange)="deckId.set($event)">
                @for (d of decks(); track d.id) {
                  <option aioNativeSelectOption [value]="d.id">{{ d.name }}</option>
                }
              </aio-native-select>
            }
          </div>
          <ul class="glass divide-border/60 flex flex-col divide-y rounded-2xl">
            @for (p of phrases; track p.phrase) {
              <li class="flex min-h-14 items-center gap-2 px-3 py-2">
                <span dir="ltr" lang="en" class="flex min-w-0 flex-1 flex-col text-start">
                  <span class="font-semibold">{{ p.phrase }}</span>
                  <span class="text-muted-foreground text-sm">{{ p.meaning }}</span>
                </span>
                <button aioBtn variant="ghost" size="icon" (click)="speak(p.phrase)" [attr.aria-label]="'تلفظ ' + p.phrase">
                  <aio-icon name="lucideVolume2" size="sm" />
                </button>
                <button
                  aioBtn
                  variant="outline"
                  size="icon"
                  [disabled]="added().has(p.phrase)"
                  (click)="addPhrase(p)"
                  [attr.aria-label]="'افزودن ' + p.phrase + ' به دسته'"
                >
                  <aio-icon [name]="added().has(p.phrase) ? 'lucideCheck' : 'lucidePlus'" size="sm" />
                </button>
              </li>
            }
          </ul>
        </section>
      }
    </ng-template>
  `,
})
export class PracticePage {
  private readonly api = inject(EnglishApi);
  private readonly tts = inject(Tts);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly modes = MODES;
  protected readonly modeLabels: Record<Mode, string> = {
    writing: 'نوشتن',
    speaking: 'گفتن',
    listening: 'شنیدن',
  };
  protected readonly modeIcons: Record<Mode, string> = {
    writing: 'lucidePenLine',
    speaking: 'lucideMic',
    listening: 'lucideHeadphones',
  };
  protected readonly situations = CONVERSATION_SITUATIONS;
  protected readonly levels = READING_LEVELS;

  protected readonly mode = signal<Mode>('writing');
  protected readonly situation = signal<ConversationSituation>('small-talk');
  protected readonly level = signal<ReadingLevel>('B1');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  /** Writing and speaking keep their own task, answer and feedback. */
  private readonly tasks = signal<Record<'writing' | 'speaking', TaskState>>({
    writing: freshTask(),
    speaking: freshTask(),
  });
  protected readonly current = computed(() => {
    const m = this.mode();
    return m === 'listening' ? freshTask() : this.tasks()[m];
  });

  protected readonly dialogue = signal<Dialogue | null>(null);
  protected readonly playing = signal(false);
  protected readonly line = signal(-1);
  protected readonly showText = signal(false);
  protected readonly choices = signal<Record<number, number>>({});
  protected readonly speed = signal(1);
  protected readonly speedValue = computed(() => String(this.speed()));

  protected readonly recording = signal(false);
  protected readonly transcribing = signal(false);
  protected readonly recordingUrl = signal('');
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private timer?: ReturnType<typeof setTimeout>;
  private recordingRun = 0;

  protected readonly decks = signal<DeckWithStats[]>([]);
  protected readonly deckId = signal(remember(DECK_KEY));
  protected readonly added = signal<ReadonlySet<string>>(new Set());
  /** Ignores an answer that arrives after the user asked again. */
  private run = 0;

  constructor() {
    const mode = this.route.snapshot.queryParamMap.get('mode');
    if (MODES.includes(mode as Mode)) this.mode.set(mode as Mode);
    inject(DestroyRef).onDestroy(() => {
      this.run++;
      this.stop();
      this.cancelRecording();
    });
    this.api
      .decks()
      .then((decks) => {
        this.decks.set(decks);
        if (!decks.some((d) => d.id === this.deckId())) this.deckId.set(decks[0]?.id ?? '');
      })
      .catch(() => undefined);
  }

  protected patch(change: Partial<TaskState>, mode = this.mode()) {
    if (mode === 'listening') return;
    this.tasks.update((t) => ({ ...t, [mode]: { ...t[mode], ...change } }));
  }

  protected setMode(value: unknown) {
    if (!MODES.includes(value as Mode) || value === this.mode()) return;
    this.stop();
    this.cancelRecording();
    this.error.set('');
    this.busy.set(false);
    this.run++;
    this.mode.set(value as Mode);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mode: value },
      replaceUrl: true,
    });
  }

  private async load<T>(request: () => Promise<T>, apply: (value: T) => void) {
    const run = ++this.run;
    this.stop();
    this.error.set('');
    this.busy.set(true);
    try {
      const value = await request();
      if (run === this.run) apply(value);
    } catch (error) {
      if (run === this.run) this.error.set(apiErrorMessage(error));
    } finally {
      if (run === this.run) this.busy.set(false);
    }
  }

  protected newTask() {
    const mode = this.mode();
    const situation = this.situation();
    const level = this.level();
    this.cancelRecording();
    return this.load(
      () => this.api.writingTask(situation, level),
      (task) => this.patch({ task, answer: '', feedback: null, situation, level }, mode),
    );
  }

  protected check() {
    const mode = this.mode();
    const state = this.current();
    const answer = state.answer.trim();
    if (!state.task) return;
    if (!answer) {
      this.error.set('اول پاسخت را بنویس.');
      return;
    }
    return this.load(
      () => this.api.writingFeedback(state.situation, state.level, state.task!, answer),
      (feedback) => this.patch({ feedback }, mode),
    );
  }

  protected newDialogue() {
    return this.load(
      () => this.api.dialogue(this.situation(), this.level()),
      (dialogue) => {
        this.dialogue.set(dialogue);
        this.showText.set(false);
        this.choices.set({});
      },
    );
  }

  protected setSpeed(value: unknown) {
    const speed = Number(value);
    if (speed === 0.75 || speed === 1) {
      this.speed.set(speed);
      this.tts.rate = speed;
    }
  }

  protected speakerVoice(speaker: string): SpeechVoice {
    return speaker === this.dialogue()?.lines[0]?.speaker ? 'primary' : 'secondary';
  }

  protected async playAll() {
    const dialogue = this.dialogue();
    if (!dialogue) return;
    if (this.playing()) return this.stop();
    this.tts.rate = this.speed();
    this.playing.set(true);
    try {
      await this.tts.readAloud(
        dialogue.lines.map((l) => l.text),
        (i) => this.line.set(i),
        dialogue.lines.map((l) => this.speakerVoice(l.speaker)),
      );
    } finally {
      this.playing.set(false);
      this.line.set(-1);
    }
  }

  protected speak(text: string, voice: SpeechVoice = 'primary') {
    this.stop();
    this.tts.rate = this.speed();
    void this.tts.speak(text, voice);
  }

  protected stop() {
    this.tts.stop();
    this.tts.rate = 1;
    this.playing.set(false);
    this.line.set(-1);
  }

  protected choose(question: number, option: number) {
    if (question in this.choices()) return;
    this.choices.update((c) => ({ ...c, [question]: option }));
  }

  /** Correct answers turn green after a choice; a wrong pick turns red. */
  protected optionClass(question: number, option: number, answer: number): string {
    const choices = this.choices();
    if (!(question in choices)) return 'border-border hover:bg-accent';
    if (option === answer) return 'border-success bg-success/10 text-success';
    if (choices[question] === option) return 'border-destructive bg-destructive/10 text-destructive';
    return 'border-border opacity-60';
  }

  protected async addPhrase(phrase: UsefulPhrase) {
    const deckId = this.deckId();
    if (!deckId) {
      aioToast.error('اول یک دسته بساز تا عبارت‌ها را ذخیره کنی.');
      return;
    }
    try {
      await this.api.createCard({ deckId, front: phrase.phrase, back: phrase.meaning });
      remember(DECK_KEY, deckId);
      this.added.update((set) => new Set(set).add(phrase.phrase));
      const deck = this.decks().find((d) => d.id === deckId);
      aioToast.success(`«${phrase.phrase}» به ${deck?.name ?? 'دسته'} اضافه شد`);
    } catch (error) {
      aioToast.error(apiErrorMessage(error, 'کارت اضافه نشد.'));
    }
  }

  /** Records up to a minute, then sends the audio to speech-to-text. */
  protected async record() {
    if (this.recording()) {
      this.recorder?.stop();
      return;
    }
    this.stop();
    this.error.set('');
    const run = ++this.recordingRun;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error('ضبط صدا در این مرورگر ممکن نیست. پاسخ را بنویس.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (run !== this.recordingRun) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      const recorder = (this.recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      ));
      const chunks: BlobPart[] = [];
      let bytes = 0;
      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
        bytes += e.data.size;
        if (bytes > MAX_RECORDING - 100 * 1024 && recorder.state !== 'inactive') recorder.stop();
      };
      recorder.onstop = () => {
        clearTimeout(this.timer);
        stream.getTracks().forEach((t) => t.stop());
        this.recording.set(false);
        if (run !== this.recordingRun) return;
        const audio = new Blob(chunks, { type: recorder.mimeType });
        if (!audio.size || audio.size > MAX_RECORDING) {
          this.error.set('ضبط کوتاه‌تری بگیر و دوباره امتحان کن.');
          return;
        }
        this.clearRecordingUrl();
        this.recordingUrl.set(URL.createObjectURL(audio));
        this.transcribing.set(true);
        this.api
          .transcribe(audio)
          .then((result) => {
            if (run === this.recordingRun)
              this.patch({ answer: result.text, feedback: null }, 'speaking');
          })
          .catch((error) => {
            if (run === this.recordingRun) this.error.set(apiErrorMessage(error));
          })
          .finally(() => {
            if (run === this.recordingRun) this.transcribing.set(false);
          });
      };
      recorder.start(1000);
      this.recording.set(true);
      this.timer = setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, 60000);
    } catch (error) {
      this.error.set(
        (error as { name?: string })?.name === 'NotAllowedError'
          ? 'اجازه دسترسی به میکروفون را بده، یا پاسخ را بنویس.'
          : ((error as Error)?.message ?? 'میکروفون در دسترس نیست.'),
      );
      this.cancelRecording();
    }
  }

  private clearRecordingUrl() {
    if (this.recordingUrl()) URL.revokeObjectURL(this.recordingUrl());
    this.recordingUrl.set('');
  }

  private cancelRecording() {
    this.recordingRun++;
    clearTimeout(this.timer);
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.recording.set(false);
    this.transcribing.set(false);
    this.clearRecordingUrl();
  }
}
