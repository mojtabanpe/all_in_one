import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  inject,
  type Signal,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  checkShadowing,
  CONVERSATION_SITUATIONS,
  type ConversationSituation,
  type DeckWithStats,
  type Dialogue,
  READING_LEVELS,
  type ReadingLevel,
  listeningScore,
  type PracticeKind,
  type PracticeScore,
  type ShadowCheck,
  shadowSessionScore,
  writingScore,
  type SpeechVoice,
  type UsefulPhrase,
  type WritingFeedback,
  type WritingTask,
} from '@all-in-one/applets/english-learning/contracts';
import {
  AioTranslate,
  AioButton,
  AioIcon,
  AioNativeSelect,
  AioNativeSelectOption,
  AioSpinner,
  AioTextarea,
  AioToggleGroupDirectives,
  provideIcons,
  AioEmptyState,
  AioSectionHeading,
  AioAsyncButton,
  AioSelectField,
  AioNotifications,
  AioLocale,
  AioChartImports,
  type AioChartOptions,
  AioDatePipe,
  aioChartTooltip,
  verbatim,
} from '@all-in-one/ui';
import { defineChart, dot, lineY } from '@tanstack/charts';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import { englishErrorMessage as apiErrorMessage } from './english-locale';
import {
  lucideChartLine,
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

interface ProgressPoint {
  id: string;
  label: string;
  score: number;
}

type Mode = 'writing' | 'speaking' | 'listening' | 'shadowing';
const MODE_KIND: Record<Mode, PracticeKind> = {
  writing: 'WRITING',
  speaking: 'SPEAKING',
  listening: 'LISTENING',
  shadowing: 'SHADOWING',
};
const MODES: Mode[] = ['writing', 'speaking', 'listening', 'shadowing'];
const DECK_KEY = 'aio.english.practice.deck';
const MAX_RECORDING = 1500 * 1024;

interface TaskState {
  task: WritingTask | null;
  answer: string;
  feedback: WritingFeedback | null;
  /** Strict score of `feedback`, and whether it reached the progress history. */
  score?: number | null;
  saved?: boolean;
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

/** Everyday conversation, listening and sentence-by-sentence shadowing. */
@Component({
  selector: 'english-learning-practice',
  imports: [
    AioButton,
    AioIcon,
    AioNativeSelect,
    AioNativeSelectOption,
    AioSpinner,
    AioTextarea,
    AioToggleGroupDirectives,
    NgTemplateOutlet,
    AioEmptyState,
    AioSectionHeading,
    AioAsyncButton,
    AioSelectField,
    AioTranslate,
    AioChartImports,
    AioDatePipe,
  ],
  providers: [
    provideIcons({
      lucideChartLine,
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
      <header
        aioSectionHeading
        [title]="'Conversation practice' | aioTranslate"
        [description]="
          'Everyday English: write, speak, listen and shadow.' | aioTranslate
        "
        [level]="1"
        titleClass="text-2xl font-bold"
        descriptionClass="text-muted-foreground text-sm"
        textClass="flex flex-col gap-1"
      ></header>

      <div
        aioToggleGroup
        type="single"
        spacing="1"
        class="lx-glass grid w-full grid-cols-2 rounded-2xl p-1 sm:grid-cols-4"
        [attr.aria-label]="'Practice mode' | aioTranslate"
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
            {{ modeLabels[m] | aioTranslate }}
          </button>
        }
      </div>

      <section
        class="flex flex-col gap-3"
        [attr.aria-label]="'My progress' | aioTranslate"
      >
        <button
          aioBtn
          variant="outline"
          class="self-start"
          [attr.aria-expanded]="showProgress()"
          (click)="toggleProgress()"
        >
          <aio-icon name="lucideChartLine" size="sm" />
          {{
            (showProgress() ? 'Hide my progress' : 'Show my progress')
              | aioTranslate
          }}
        </button>
        @if (showProgress()) {
          @if (modeHistory(); as history) {
            @if (history.length) {
              <tanstack-chart aioChart [options]="progressChart()" />
              <ul class="flex flex-col gap-1 text-sm">
                @for (h of history.slice(-5).reverse(); track h.id) {
                  <li class="flex items-center justify-between gap-3">
                    <span class="text-muted-foreground">{{
                      h.createdAt
                        | aioDate
                          : {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                    }}</span>
                    <strong>{{ number(h.score) }}/{{ number(100) }}</strong>
                  </li>
                }
              </ul>
            } @else {
              <p class="text-muted-foreground text-sm">
                {{
                  'No scores yet. Finish an exercise to get your first one.'
                    | aioTranslate
                }}
              </p>
            }
          } @else {
            <p class="text-muted-foreground text-sm">
              {{ 'Loading' | aioTranslate }}…
            </p>
          }
        }
      </section>

      <div class="grid grid-cols-2 gap-3">
        <aio-select-field
          [label]="'Situation' | aioTranslate"
          controlId="practice-situation"
          [value]="situation()"
          [options]="situations"
          valueKey="id"
          labelKey="label"
          (valueChange)="situation.set($any($event))"
        />
        <aio-select-field
          [label]="'Level' | aioTranslate"
          controlId="practice-level"
          [value]="level()"
          [options]="levels"
          valueKey="id"
          labelKey="label"
          (valueChange)="level.set($any($event))"
        />
      </div>

      @if (error()) {
        <p class="text-destructive text-sm" role="alert">
          {{ error() | aioTranslate }}
        </p>
      }

      @if (mode() === 'shadowing') {
        <section
          class="lx-glass flex flex-col gap-4 rounded-2xl p-4"
          aria-labelledby="shadowing-title"
        >
          <h2 id="shadowing-title" class="text-lg font-bold">
            {{ 'Shadowing' | aioTranslate }}
          </h2>
          <p class="text-muted-foreground text-sm leading-7">
            {{
              'Listen to the sentence first. Play it again and repeat just behind the speaker, matching their rhythm and intonation. Use headphones and record yourself to hear the difference.'
                | aioTranslate
            }}
          </p>
          <button
            size="lg"
            [disabled]="busy() || recording() || recordingPending()"
            (click)="newDialogue()"
            aioAsyncButton
            [busy]="busy()"
            [label]="'New exercise' | aioTranslate"
            [busyLabel]="'Preparing…' | aioTranslate"
            icon="lucideHeadphones"
          ></button>
          <p class="text-muted-foreground text-sm">
            {{ 'New exercises and audio use Poshtetgarm AI.' | aioTranslate }}
          </p>
        </section>
        @if (shadowLine(); as sentence) {
          <section
            class="lx-glass flex min-w-0 flex-col gap-4 rounded-2xl p-4"
            aria-labelledby="shadow-sentence-title"
          >
            <h2
              id="shadow-sentence-title"
              class="font-semibold"
              aria-live="polite"
            >
              {{
                'Sentence {0} of {1}'
                  | aioTranslate
                    : [
                        number(shadowIndex() + 1),
                        number(dialogue()!.lines.length),
                      ]
              }}
            </h2>
            @if (shadowFinished()) {
              <div class="flex flex-col gap-1" role="status">
                <p class="text-success font-semibold">
                  {{
                    'Well done! You practised every sentence. Try another round to build fluency.'
                      | aioTranslate
                  }}
                </p>
                @if (shadowAttempted()) {
                  <p class="text-3xl font-bold">
                    {{ number(shadowSessionScore())
                    }}<span class="text-muted-foreground text-base font-medium"
                      >/{{ number(100) }}</span
                    >
                  </p>
                  <p class="text-muted-foreground text-sm">
                    {{
                      'Session score: {0} of {1} sentences recorded. Sentences you did not record count as zero.'
                        | aioTranslate
                          : [
                              number(shadowAttempted()),
                              number(dialogue()!.lines.length),
                            ]
                    }}
                  </p>
                  <p class="text-muted-foreground text-sm">
                    {{
                      (shadowSaved() ? 'Saved to your progress.' : 'Saving…')
                        | aioTranslate
                    }}
                  </p>
                } @else {
                  <p class="font-semibold">
                    {{
                      'Record yourself on each sentence to get a score.'
                        | aioTranslate
                    }}
                  </p>
                }
              </div>
            }
            <div class="flex flex-wrap gap-2">
              <div
                aioToggleGroup
                type="single"
                variant="outline"
                [value]="speedValue()"
                (valueChange)="setShadowSpeed($event)"
                [attr.aria-label]="'Speaker speed' | aioTranslate"
              >
                <button aioToggleGroupItem value="0.75" class="min-h-11">
                  {{ 'Slow' | aioTranslate }}
                </button>
                <button aioToggleGroupItem value="1" class="min-h-11">
                  {{ 'Normal' | aioTranslate }}
                </button>
              </div>
              <button
                aioBtn
                variant="ghost"
                [attr.aria-pressed]="showText()"
                (click)="showText.update((v) => !v)"
              >
                <aio-icon
                  [name]="showText() ? 'lucideEyeOff' : 'lucideEye'"
                  size="sm"
                />
                {{
                  (showText() ? 'Hide transcript' : 'Show transcript')
                    | aioTranslate
                }}
              </button>
            </div>
            @if (showText()) {
              <p
                dir="ltr"
                lang="en"
                class="text-start text-xl leading-9 wrap-anywhere"
              >
                {{ sentence.text }}
              </p>
            }
            <div class="flex flex-wrap gap-3">
              <button
                aioBtn
                [disabled]="recordingPending()"
                (click)="playShadow()"
              >
                <aio-icon
                  [name]="playing() ? 'lucideSquare' : 'lucidePlay'"
                  size="sm"
                />
                {{
                  (playing() ? 'Stop speaker' : 'Play sentence') | aioTranslate
                }}
              </button>
              <button
                aioBtn
                variant="outline"
                [disabled]="recordingPending()"
                (click)="record()"
              >
                @if (recordingPending()) {
                  <aio-spinner [aria-label]="'Loading' | aioTranslate" />
                } @else {
                  <aio-icon
                    [name]="recording() ? 'lucideSquare' : 'lucideMic'"
                    size="sm"
                  />
                }
                {{
                  (recording()
                    ? 'Stop recording'
                    : 'Record along with the speaker'
                  ) | aioTranslate
                }}
              </button>
            </div>
            <p class="text-muted-foreground text-sm" role="status">
              {{
                (recording()
                  ? 'Recording. Play the sentence and repeat along. Recording stops after one minute.'
                  : 'Each recording is sent to your speech-to-text service and checked word by word; the audio is not stored.'
                ) | aioTranslate
              }}
            </p>
            @if (recordingUrl()) {
              <div class="flex min-w-0 flex-col gap-2">
                <span id="shadow-recording-label" class="text-sm font-medium">{{
                  'Your recording — compare it with the speaker' | aioTranslate
                }}</span>
                <audio
                  [src]="recordingUrl()"
                  controls
                  class="h-12 w-full min-w-0"
                  aria-labelledby="shadow-recording-label"
                  (play)="stop()"
                ></audio>
              </div>
            }
            @if (shadowChecking()) {
              <p class="text-muted-foreground text-sm" role="status">
                {{ 'Checking your words…' | aioTranslate }}
              </p>
            } @else if (shadowCheck(); as c) {
              <div
                class="flex min-w-0 flex-col gap-3"
                role="status"
                aria-live="polite"
              >
                <p class="font-semibold">
                  {{
                    'Score for this sentence: {0}/100'
                      | aioTranslate: [number(c.score)]
                  }}
                </p>
                <p dir="ltr" lang="en" class="text-lg leading-9">
                  @for (w of c.words; track $index) {
                    <span
                      [class]="
                        w.status === 'ok'
                          ? ''
                          : w.status === 'missed'
                            ? 'text-destructive decoration-destructive line-through decoration-2'
                            : 'text-destructive decoration-destructive underline decoration-wavy decoration-2'
                      "
                      >{{ w.word }}</span
                    >{{ ' ' }}
                  }
                </p>
                <ul class="flex flex-col gap-1 text-sm">
                  @for (w of c.words; track $index) {
                    @if (w.status === 'wrong') {
                      <li>
                        {{
                          'You said “{0}” instead of “{1}”.'
                            | aioTranslate
                              : [verbatim(w.heard), verbatim(w.word)]
                        }}
                      </li>
                    } @else if (w.status === 'missed') {
                      <li>
                        {{
                          'You skipped “{0}”.'
                            | aioTranslate: [verbatim(w.word)]
                        }}
                      </li>
                    }
                  }
                  @if (c.extra.length) {
                    <li>
                      {{
                        'Extra words: {0}'
                          | aioTranslate: [verbatim(c.extra.join(', '))]
                      }}
                    </li>
                  }
                  @if (c.score === 100) {
                    <li class="text-success">
                      {{ 'Every word was right.' | aioTranslate }}
                    </li>
                  }
                </ul>
                <p class="text-muted-foreground text-xs">
                  {{ 'We heard: “{0}”' | aioTranslate: [verbatim(c.heard)] }}
                </p>
                <p class="text-muted-foreground text-xs">
                  {{
                    'This checks your words from a transcript of your voice: skipped or wrong words, not accent or intonation.'
                      | aioTranslate
                  }}
                </p>
              </div>
            }
            <div class="flex flex-wrap gap-3">
              <button
                aioBtn
                variant="outline"
                [disabled]="
                  shadowIndex() === 0 || recording() || recordingPending()
                "
                (click)="moveShadow(-1)"
              >
                {{ 'Previous sentence' | aioTranslate }}
              </button>
              <button
                aioBtn
                [disabled]="recording() || recordingPending()"
                (click)="moveShadow(1)"
              >
                {{
                  (shadowFinished()
                    ? 'Practise again'
                    : shadowIndex() === dialogue()!.lines.length - 1
                      ? 'Finish practice'
                      : 'Practised; next sentence'
                  ) | aioTranslate
                }}
              </button>
            </div>
          </section>
        }
      } @else if (mode() === 'listening') {
        <button
          size="lg"
          class="h-14 rounded-2xl"
          [disabled]="busy()"
          (click)="newDialogue()"
          aioAsyncButton
          [busy]="busy()"
          [label]="'New dialogue' | aioTranslate"
          [busyLabel]="'Preparing…' | aioTranslate"
          icon="lucideHeadphones"
        ></button>

        @if (dialogue(); as d) {
          <section
            class="lx-glass flex flex-col gap-4 rounded-2xl p-4"
            aria-labelledby="dialogue-title"
          >
            <h2
              id="dialogue-title"
              dir="ltr"
              lang="en"
              class="text-start text-lg font-bold"
            >
              {{ d.title }}
            </h2>
            <div class="flex flex-wrap items-center gap-2">
              <button aioBtn (click)="playAll()">
                <aio-icon
                  [name]="playing() ? 'lucidePause' : 'lucidePlay'"
                  size="sm"
                />
                {{ (playing() ? 'Stop' : 'Play dialogue') | aioTranslate }}
              </button>
              <div
                aioToggleGroup
                type="single"
                variant="outline"
                [value]="speedValue()"
                (valueChange)="setSpeed($event)"
                [attr.aria-label]="'Speed' | aioTranslate"
              >
                <button aioToggleGroupItem value="0.75">
                  {{ 'Slow' | aioTranslate }}
                </button>
                <button aioToggleGroupItem value="1">
                  {{ 'Normal' | aioTranslate }}
                </button>
              </div>
              <button
                aioBtn
                variant="ghost"
                (click)="showText.update((v) => !v)"
              >
                <aio-icon
                  [name]="showText() ? 'lucideEyeOff' : 'lucideEye'"
                  size="sm"
                />
                {{
                  (showText() ? 'Hide transcript' : 'Show transcript')
                    | aioTranslate
                }}
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
                      [attr.aria-label]="
                        'Play sentence ' + l.speaker | aioTranslate
                      "
                    >
                      {{ l.speaker }}:
                    </button>
                    <span>{{ l.text }}</span>
                  </li>
                }
              </ol>
            }
          </section>

          @if (d.questions.length) {
            <section
              class="flex flex-col gap-3"
              aria-labelledby="questions-title"
            >
              <h2 id="questions-title" class="text-lg font-bold">
                {{ 'Questions' | aioTranslate }}
              </h2>
              @for (q of d.questions; track $index; let qi = $index) {
                <div
                  class="lx-glass flex flex-col gap-2 rounded-2xl p-4"
                  role="group"
                  [attr.aria-labelledby]="'q-' + qi"
                >
                  <p
                    [id]="'q-' + qi"
                    dir="ltr"
                    lang="en"
                    class="mb-1 text-start font-semibold"
                  >
                    {{ q.question }}
                  </p>
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
                        <aio-icon
                          name="lucideCheck"
                          size="sm"
                          [aria-label]="'Correct' | aioTranslate"
                        />
                      } @else if (choices()[qi] === oi) {
                        <aio-icon
                          name="lucideX"
                          size="sm"
                          [aria-label]="'Incorrect' | aioTranslate"
                        />
                      }
                    </button>
                  }
                </div>
              }
              @if (listeningResult(); as r) {
                <div class="flex flex-col gap-1" role="status">
                  <p class="text-3xl font-bold">
                    {{ number(r.score)
                    }}<span class="text-muted-foreground text-base font-medium"
                      >/{{ number(100) }}</span
                    >
                  </p>
                  <p class="text-muted-foreground text-sm">
                    {{
                      '{0} of {1} answers right on the first try.'
                        | aioTranslate
                          : [number(r.correct), number(d.questions.length)]
                    }}
                    @if (listeningSaved()) {
                      {{ 'Saved to your progress.' | aioTranslate }}
                    }
                  </p>
                </div>
              }
            </section>
          }
          <ng-container
            *ngTemplateOutlet="phrasesTpl; context: { $implicit: d.phrases }"
          />
        }
      } @else {
        <button
          aioBtn
          size="lg"
          class="h-14 rounded-2xl"
          [disabled]="busy()"
          (click)="newTask()"
        >
          @if (busy() && !current().task) {
            <aio-spinner [aria-label]="'Loading' | aioTranslate" />
            {{ 'Preparing…' | aioTranslate }}
          } @else {
            <aio-icon
              [name]="mode() === 'speaking' ? 'lucideMic' : 'lucidePenLine'"
            />
            {{ 'New exercise' | aioTranslate }}
          }
        </button>

        @if (current().task; as task) {
          <section
            class="lx-glass flex flex-col gap-3 rounded-2xl p-4"
            aria-labelledby="task-title"
          >
            <h2 id="task-title" class="sr-only">
              {{ 'Exercise' | aioTranslate }}
            </h2>
            <p dir="ltr" lang="en" class="text-start">
              {{ task.scenario | aioTranslate }}
            </p>
            @if (task.message) {
              <div
                dir="ltr"
                lang="en"
                class="bg-accent text-accent-foreground flex items-start gap-2 self-start rounded-2xl rounded-ss-sm p-3"
              >
                <aio-icon
                  name="lucideMessageSquare"
                  size="sm"
                  class="mt-1 shrink-0"
                />
                <span>{{ task.message }}</span>
                <button
                  aioBtn
                  variant="ghost"
                  size="icon-sm"
                  (click)="speak(task.message)"
                  [attr.aria-label]="'Listen to message' | aioTranslate"
                >
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
                  <aio-icon
                    [name]="recording() ? 'lucideSquare' : 'lucideMic'"
                  />
                  {{
                    (recording() ? 'Stop recording' : 'Record answer')
                      | aioTranslate
                  }}
                </button>
                @if (transcribing()) {
                  <span
                    class="text-muted-foreground flex items-center gap-2 text-sm"
                    ><aio-spinner [aria-label]="'Loading' | aioTranslate" />
                    {{ 'Transcribing…' | aioTranslate }}</span
                  >
                }
                @if (recordingUrl()) {
                  <audio
                    [src]="recordingUrl()"
                    controls
                    class="h-10 max-w-full"
                  ></audio>
                }
              </div>
            }

            <label for="practice-answer" class="text-sm font-medium">
              {{
                (mode() === 'speaking'
                  ? 'What you said (you can edit it)'
                  : 'Your answer'
                ) | aioTranslate
              }}</label
            >
            <textarea
              aioTextarea
              id="practice-answer"
              dir="ltr"
              lang="en"
              rows="4"
              [value]="current().answer"
              (input)="
                patch({ answer: $any($event.target).value, feedback: null })
              "
            ></textarea>
            <button
              class="self-start"
              [disabled]="busy() || !current().answer.trim()"
              (click)="check()"
              aioAsyncButton
              [busy]="busy()"
              [label]="'Check answer' | aioTranslate"
              icon="lucideCheck"
              iconSize="sm"
            ></button>
          </section>

          @if (current().feedback; as f) {
            <section
              class="lx-glass flex flex-col gap-4 rounded-2xl p-4"
              aria-labelledby="feedback-title"
            >
              <h2 id="feedback-title" class="text-lg font-bold">
                {{ 'Feedback' | aioTranslate }}
              </h2>
              @if (current().score !== null && current().score !== undefined) {
                <div class="flex flex-col gap-1" role="status">
                  <p class="text-3xl font-bold">
                    {{ number(current().score!)
                    }}<span class="text-muted-foreground text-base font-medium"
                      >/{{ number(100) }}</span
                    >
                  </p>
                  <p class="text-muted-foreground text-sm">
                    {{
                      'Strict score: each mistake costs 1.5 words of your answer. Mistakes: {0}.'
                        | aioTranslate: [number(f.mistakes.length)]
                    }}
                    @if (current().saved) {
                      {{ 'Saved to your progress.' | aioTranslate }}
                    }
                  </p>
                </div>
              }
              @if (f.comment) {
                <p
                  dir="ltr"
                  lang="en"
                  class="text-primary text-start font-semibold"
                >
                  {{ f.comment | aioTranslate }}
                </p>
              }
              <div class="flex flex-col gap-1">
                <span class="text-muted-foreground text-sm">{{
                  'Corrected' | aioTranslate
                }}</span>
                <p dir="ltr" lang="en" class="text-start">
                  {{ f.corrected }}
                </p>
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-muted-foreground text-sm">{{
                  'More natural' | aioTranslate
                }}</span>
                <p
                  dir="ltr"
                  lang="en"
                  class="flex items-start gap-2 text-start"
                >
                  {{ f.natural
                  }}<button
                    aioBtn
                    variant="ghost"
                    size="icon-sm"
                    (click)="speak(f.natural)"
                    [attr.aria-label]="'Listening' | aioTranslate"
                  >
                    <aio-icon name="lucideVolume2" size="sm" />
                  </button>
                </p>
              </div>
              @if (f.mistakes.length) {
                <div class="flex flex-col gap-2">
                  <span class="text-muted-foreground text-sm">{{
                    'Corrections' | aioTranslate
                  }}</span>
                  <ul dir="ltr" lang="en" class="flex flex-col gap-2">
                    @for (m of f.mistakes; track $index) {
                      <li class="bg-background/60 rounded-xl p-3 text-start">
                        <span class="text-destructive line-through">{{
                          m.original | aioTranslate
                        }}</span>
                        →
                        <span class="text-success font-semibold">{{
                          m.fix | aioTranslate
                        }}</span>
                        @if (m.why) {
                          <p class="text-muted-foreground text-sm">
                            {{ m.why | aioTranslate }}
                          </p>
                        }
                      </li>
                    }
                  </ul>
                </div>
              }
            </section>
            <ng-container
              *ngTemplateOutlet="phrasesTpl; context: { $implicit: f.phrases }"
            />
          }
        } @else if (!busy()) {
          <div
            class="lx-glass rounded-2xl"
            aioEmptyState
            [title]="
              (mode() === 'speaking' ? 'Answer aloud' : 'Write a short answer')
                | aioTranslate
            "
            [description]="
              'Choose a situation and select “New exercise”. Then check your answer.'
                | aioTranslate
            "
            [level]="2"
          ></div>
        }
      }
    </div>

    <ng-template #phrasesTpl let-phrases>
      @if (phrases.length) {
        <section class="flex flex-col gap-3" aria-labelledby="phrases-title">
          <div class="flex items-center justify-between gap-3">
            <h2 id="phrases-title" class="text-lg font-bold">
              {{ 'Useful phrases' | aioTranslate }}
            </h2>
            @if (decks().length) {
              <div class="w-40 shrink-0">
                <aio-native-select
                  selectId="phrase-deck"
                  [value]="deckId()"
                  (valueChange)="deckId.set($event)"
                >
                  @for (d of decks(); track d.id) {
                    <option aioNativeSelectOption [value]="d.id">
                      {{ d.name }}
                    </option>
                  }
                </aio-native-select>
              </div>
            }
          </div>
          <ul
            class="lx-glass divide-border/60 flex flex-col divide-y rounded-2xl"
          >
            @for (p of phrases; track p.phrase) {
              <li class="flex min-h-14 items-center gap-2 px-3 py-2">
                <span
                  dir="ltr"
                  lang="en"
                  class="flex min-w-0 flex-1 flex-col text-start"
                >
                  <span class="font-semibold">{{
                    p.phrase | aioTranslate
                  }}</span>
                  <span class="text-muted-foreground text-sm">{{
                    p.meaning | aioTranslate
                  }}</span>
                </span>
                <button
                  aioBtn
                  variant="ghost"
                  size="icon"
                  (click)="speak(p.phrase)"
                  [attr.aria-label]="'Pronunciation ' + p.phrase | aioTranslate"
                >
                  <aio-icon name="lucideVolume2" size="sm" />
                </button>
                <button
                  aioBtn
                  variant="outline"
                  size="icon"
                  [disabled]="added().has(p.phrase)"
                  (click)="addPhrase(p)"
                  [attr.aria-label]="
                    'Add ' + p.phrase + ' to deck' | aioTranslate
                  "
                >
                  <aio-icon
                    [name]="
                      added().has(p.phrase) ? 'lucideCheck' : 'lucidePlus'
                    "
                    size="sm"
                  />
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
  protected readonly verbatim = verbatim;
  protected readonly locale = inject(AioLocale);

  private readonly notifications = inject(AioNotifications);

  private readonly api = inject(EnglishApi);
  private readonly tts = inject(Tts);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly modes = MODES;
  protected readonly modeLabels: Record<Mode, string> = {
    writing: 'Writing',
    speaking: 'Speaking',
    listening: 'Listening',
    shadowing: 'Shadowing',
  };
  protected readonly modeIcons: Record<Mode, string> = {
    writing: 'lucidePenLine',
    speaking: 'lucideMic',
    listening: 'lucideHeadphones',
    shadowing: 'lucideVolume2',
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
    return m === 'listening' || m === 'shadowing'
      ? freshTask()
      : this.tasks()[m];
  });

  protected readonly dialogue = signal<Dialogue | null>(null);
  protected readonly shadowIndex = signal(0);
  protected readonly shadowFinished = signal(false);
  protected readonly shadowLine = computed(
    () => this.dialogue()?.lines[this.shadowIndex()],
  );
  /** Latest check of each sentence of the current dialogue (by index). */
  protected readonly shadowChecks = signal<Record<number, ShadowCheck>>({});
  protected readonly shadowChecking = signal(false);
  protected readonly shadowCheck = computed(
    () => this.shadowChecks()[this.shadowIndex()],
  );
  protected readonly shadowAttempted = computed(
    () => Object.keys(this.shadowChecks()).length,
  );
  /** Strict session score: unrecorded sentences count as 0. */
  protected readonly shadowSessionScore = computed(() => {
    const lines = this.dialogue()?.lines.length ?? 0;
    const checks = this.shadowChecks();
    return shadowSessionScore(
      lines,
      Array.from({ length: lines }, (_, i) => checks[i]?.score),
    );
  });
  protected readonly shadowSaved = signal<PracticeScore | null>(null);
  protected readonly listeningSaved = signal<PracticeScore | null>(null);
  /** Score history per mode, loaded when the chart is first opened. */
  protected readonly history = signal<
    Partial<Record<PracticeKind, PracticeScore[]>>
  >({});
  protected readonly modeHistory = computed(
    () => this.history()[MODE_KIND[this.mode()]] ?? null,
  );
  /** Listening: the score once every question has a first pick. */
  protected readonly listeningResult = computed(() => {
    const d = this.dialogue();
    const choices = this.choices();
    if (!d?.questions.length) return null;
    if (d.questions.some((_, i) => !(i in choices))) return null;
    const correct = d.questions.filter(
      (q, i) => choices[i] === q.answer,
    ).length;
    return { correct, score: listeningScore(correct, d.questions.length) };
  });
  protected readonly showProgress = signal(false);
  protected readonly progressChart: Signal<
    AioChartOptions<ProgressPoint, string, number>
  > = computed(() => {
    const rows: ProgressPoint[] = (this.modeHistory() ?? []).map((r, i) => ({
      id: r.id,
      // Point scale needs unique labels: number them, show the date beside.
      label: `${i + 1}. ${this.locale.date(r.createdAt, { day: 'numeric', month: 'short' })}`,
      score: r.score,
    }));
    return {
      definition: defineChart({
        marks: [
          lineY(rows, { x: 'label', y: 'score' }),
          dot(rows, { x: 'label', y: 'score' }),
        ],
        scales: {
          x: { scale: () => scalePoint<string>().padding(0.4) },
          y: {
            // A fixed 0–100 axis: small changes must not look dramatic.
            scale: scaleLinear().domain([0, 100]),
            grid: true,
          },
        },
        tooltip: aioChartTooltip<ProgressPoint, string, number>(),
      }),
      height: 220,
      ariaLabel: this.locale.text('Practice scores over time'),
    };
  });
  protected readonly number = (value: number) => this.locale.number(value);
  private playbackRun = 0;
  protected readonly playing = signal(false);
  protected readonly line = signal(-1);
  protected readonly showText = signal(false);
  protected readonly choices = signal<Record<number, number>>({});
  protected readonly speed = signal(1);
  protected readonly speedValue = computed(() => String(this.speed()));

  protected readonly recording = signal(false);
  protected readonly recordingPending = signal(false);
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
        if (!decks.some((d) => d.id === this.deckId()))
          this.deckId.set(decks[0]?.id ?? '');
      })
      .catch(() => undefined);
  }

  protected patch(change: Partial<TaskState>, mode = this.mode()) {
    if (mode === 'listening' || mode === 'shadowing') return;
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
      (task) =>
        this.patch(
          { task, answer: '', feedback: null, situation, level },
          mode,
        ),
    );
  }

  protected check() {
    const mode = this.mode();
    const state = this.current();
    const answer = state.answer.trim();
    if (!state.task) return;
    if (!answer) {
      this.error.set('Write your answer first.');
      return;
    }
    return this.load(
      () =>
        this.api.writingFeedback(
          state.situation,
          state.level,
          state.task!,
          answer,
        ),
      (feedback) => {
        const score = writingScore(answer, feedback.mistakes.length);
        this.patch({ feedback, score, saved: false }, mode);
        void this.saveScore({
          kind: MODE_KIND[mode],
          title: (state.task!.scenario || 'Practice').slice(0, 200),
          score,
          items: Math.max(answer.split(/\s+/).filter(Boolean).length, 1),
          attempted: Math.max(answer.split(/\s+/).filter(Boolean).length, 1),
          mistakes: feedback.mistakes.length,
        }).then((saved) => saved && this.patch({ saved: true }, mode));
      },
    );
  }

  protected newDialogue() {
    this.cancelRecording();
    return this.load(
      () => this.api.dialogue(this.situation(), this.level()),
      (dialogue) => {
        this.dialogue.set(dialogue);
        this.showText.set(false);
        this.choices.set({});
        this.shadowIndex.set(0);
        this.shadowFinished.set(false);
        this.shadowChecks.set({});
        this.shadowSaved.set(null);
        this.listeningSaved.set(null);
      },
    );
  }

  protected setShadowSpeed(value: unknown) {
    this.stop();
    this.setSpeed(value);
  }

  protected async playShadow() {
    if (this.playing()) return this.stop();
    const sentence = this.shadowLine();
    if (!sentence) return;
    const run = ++this.playbackRun;
    this.tts.rate = this.speed();
    this.playing.set(true);
    try {
      await this.tts.speak(sentence.text, this.speakerVoice(sentence.speaker));
    } finally {
      if (run === this.playbackRun) this.playing.set(false);
    }
  }

  protected moveShadow(direction: number) {
    const lines = this.dialogue()?.lines;
    if (!lines?.length || this.recording() || this.recordingPending()) return;
    this.stop();
    this.cancelRecording();
    if (this.shadowFinished() && direction === 1) {
      this.shadowIndex.set(0);
      this.shadowFinished.set(false);
      this.shadowChecks.set({});
      this.shadowSaved.set(null);
    } else if (this.shadowIndex() + direction >= lines.length) {
      this.shadowFinished.set(true);
      void this.saveShadowSession();
    } else {
      this.shadowIndex.set(Math.max(0, this.shadowIndex() + direction));
      this.shadowFinished.set(false);
    }
  }

  protected setSpeed(value: unknown) {
    const speed = Number(value);
    if (speed === 0.75 || speed === 1) {
      this.speed.set(speed);
      this.tts.rate = speed;
    }
  }

  protected speakerVoice(speaker: string): SpeechVoice {
    return speaker === this.dialogue()?.lines[0]?.speaker
      ? 'primary'
      : 'secondary';
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
    this.playbackRun++;
    this.tts.stop();
    this.tts.rate = 1;
    this.playing.set(false);
    this.line.set(-1);
  }

  protected choose(question: number, option: number) {
    if (question in this.choices()) return;
    this.choices.update((c) => ({ ...c, [question]: option }));
    const result = this.listeningResult();
    const d = this.dialogue();
    if (result && d && this.mode() === 'listening' && !this.listeningSaved())
      void this.saveScore({
        kind: 'LISTENING',
        title: d.title.slice(0, 200) || 'Listening',
        score: result.score,
        items: d.questions.length,
        attempted: d.questions.length,
        mistakes: d.questions.length - result.correct,
      }).then((saved) => saved && this.listeningSaved.set(saved));
  }

  /** Correct answers turn green after a choice; a wrong pick turns red. */
  protected optionClass(
    question: number,
    option: number,
    answer: number,
  ): string {
    const choices = this.choices();
    if (!(question in choices)) return 'border-border hover:bg-accent';
    if (option === answer) return 'border-success bg-success/10 text-success';
    if (choices[question] === option)
      return 'border-destructive bg-destructive/10 text-destructive';
    return 'border-border opacity-60';
  }

  protected async addPhrase(phrase: UsefulPhrase) {
    const deckId = this.deckId();
    if (!deckId) {
      this.notifications.error('Create a deck before saving phrases.');
      return;
    }
    try {
      await this.api.createCard({
        deckId,
        front: phrase.phrase,
        back: phrase.meaning,
      });
      remember(DECK_KEY, deckId);
      this.added.update((set) => new Set(set).add(phrase.phrase));
      const deck = this.decks().find((d) => d.id === deckId);
      this.notifications.success(
        `“${phrase.phrase}” added to ${deck?.name ?? 'deck'}`,
      );
    } catch (error) {
      this.notifications.error(
        apiErrorMessage(error, 'Unable to add the card.'),
      );
    }
  }

  /** Records up to a minute, then sends the audio to speech-to-text. */
  protected async record() {
    if (this.recordingPending()) return;
    if (this.recording()) {
      this.recorder?.stop();
      return;
    }
    const shadowing = this.mode() === 'shadowing';
    const shadowIndex = this.shadowIndex();
    const shadowText = this.shadowLine()?.text ?? '';
    if (!shadowing) this.stop();
    this.error.set('');
    const run = ++this.recordingRun;
    this.recordingPending.set(true);
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined'
      )
        throw new Error(
          'Recording is unavailable in this browser. Type your answer instead.',
        );
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (run !== this.recordingRun) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.clearRecordingUrl();
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ].find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = (this.recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      ));
      const chunks: BlobPart[] = [];
      let bytes = 0;
      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
        bytes += e.data.size;
        if (bytes > MAX_RECORDING - 100 * 1024 && recorder.state !== 'inactive')
          recorder.stop();
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (run !== this.recordingRun) return;
        clearTimeout(this.timer);
        this.recording.set(false);
        if (shadowing) this.stop();
        const audio = new Blob(chunks, { type: recorder.mimeType });
        if (!audio.size || audio.size > MAX_RECORDING) {
          this.error.set('Make a shorter recording and try again.');
          return;
        }
        this.clearRecordingUrl();
        this.recordingUrl.set(URL.createObjectURL(audio));
        if (shadowing) {
          this.checkShadow(run, audio, shadowIndex, shadowText);
          return;
        }
        this.transcribing.set(true);
        this.api
          .transcribe(audio)
          .then((result) => {
            if (run === this.recordingRun)
              this.patch({ answer: result.text, feedback: null }, 'speaking');
          })
          .catch((error) => {
            if (run === this.recordingRun)
              this.error.set(apiErrorMessage(error));
          })
          .finally(() => {
            if (run === this.recordingRun) this.transcribing.set(false);
          });
      };
      recorder.start(1000);
      this.recordingPending.set(false);
      this.recording.set(true);
      this.timer = setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, 60000);
    } catch (error) {
      if (run !== this.recordingRun) return;
      this.error.set(
        (error as { name?: string })?.name === 'NotAllowedError'
          ? 'Allow microphone access or type your answer instead.'
          : ((error as Error)?.message ?? 'The microphone is unavailable.'),
      );
      this.cancelRecording();
    }
  }

  /** Transcribe a shadowing recording and compare it with its sentence. */
  private checkShadow(
    run: number,
    audio: Blob,
    index: number,
    sentence: string,
  ) {
    if (!sentence) return;
    this.shadowChecking.set(true);
    this.api
      .transcribe(audio)
      .then((result) => {
        if (run !== this.recordingRun) return;
        this.shadowChecks.update((c) => ({
          ...c,
          [index]: checkShadowing(sentence, result.text),
        }));
      })
      .catch((error) => {
        if (run === this.recordingRun) this.error.set(apiErrorMessage(error));
      })
      .finally(() => {
        if (run === this.recordingRun) this.shadowChecking.set(false);
      });
  }

  /** Saves the shadowing session score once, when the last sentence is passed. */
  private async saveShadowSession() {
    const d = this.dialogue();
    if (!d || !this.shadowAttempted() || this.shadowSaved()) return;
    const saved = await this.saveScore({
      kind: 'SHADOWING',
      title: d.title.slice(0, 200) || 'Shadowing',
      score: this.shadowSessionScore(),
      items: d.lines.length,
      attempted: this.shadowAttempted(),
    });
    if (saved) this.shadowSaved.set(saved);
  }

  /** Stores a score and adds it to the loaded history of its mode. */
  private async saveScore(
    input: Parameters<EnglishApi['savePracticeScore']>[0],
  ): Promise<PracticeScore | null> {
    try {
      const saved = await this.api.savePracticeScore(input);
      this.history.update((h) =>
        h[saved.kind] ? { ...h, [saved.kind]: [...h[saved.kind]!, saved] } : h,
      );
      return saved;
    } catch (error) {
      this.error.set(apiErrorMessage(error));
      return null;
    }
  }

  protected async toggleProgress() {
    this.showProgress.update((v) => !v);
    const kind = MODE_KIND[this.mode()];
    if (!this.showProgress() || this.history()[kind]) return;
    try {
      const rows = await this.api.practiceScores(kind);
      this.history.update((h) => ({ ...h, [kind]: rows }));
    } catch (error) {
      this.error.set(apiErrorMessage(error));
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
    this.recordingPending.set(false);
    this.transcribing.set(false);
    this.clearRecordingUrl();
  }
}
