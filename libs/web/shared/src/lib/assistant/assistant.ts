import { HttpClient, httpResource } from '@angular/common/http';
import {
  Component,
  computed,
  ElementRef,
  inject,
  Injectable,
  input,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type {
  AiStatus,
  AssistantContext,
  AssistantReply,
} from '@all-in-one/shared/schemas';
import {
  AioButton,
  AioDialog,
  AioDialogBody,
  AioIcon,
  AioInputGroupDirectives,
  AioSpinner,
  aioToast,
  provideIcons,
} from '@all-in-one/ui';
import {
  lucideMic,
  lucideSend,
  lucideSparkles,
  lucideSquare,
  lucideTrash2,
} from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api/api-base-url';
import { apiErrorMessage } from '../auth/auth.guards';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** Tools the assistant used for this answer */
  actions?: number;
  /** The server's tool log for this answer: sent back so the assistant remembers what it did. */
  log?: string;
}

const SUGGESTIONS: Record<AssistantContext, string[]> = {
  home: [
    'امروز چه کارهایی دارم؟',
    'ناهار امروز: قورمه‌سبزی با برنج',
    'برای امشب ۳۰ دقیقه پیاده‌روی ثبت کن',
  ],
  planner: [
    'کارهای امروزم را بگو',
    'فردا ساعت ۱۰ جلسه با تیم، اولویت بالا',
    'کارهای عقب‌افتاده را به فردا ببر',
  ],
  health: [
    'ناهار امروزم را عوض کن به چلوکباب',
    'امروز چقدر کالری خوردم؟',
    '۴۵ دقیقه باشگاه با شدت زیاد ثبت کن',
  ],
  english: [
    'Create 10 cards for travel vocabulary',
    'How many cards are due today?',
    'Create and save a B1 reading about sports',
  ],
};

/** The conversation survives closing the sheet and switching pages (not reloads). */
@Injectable({ providedIn: 'root' })
export class AssistantStore {
  readonly messages = signal<Message[]>([]);
  readonly englishMessages = signal<Message[]>([]);
}

/**
 * The in-app AI assistant: a header button and a chat sheet. It runs on the
 * user's own AI (profile settings) with the same tools as the ChatGPT
 * connection, so it can change tasks, meals, cards and more.
 */
@Component({
  selector: 'web-assistant',
  imports: [
    AioButton,
    AioDialog,
    AioDialogBody,
    AioIcon,
    AioInputGroupDirectives,
    AioSpinner,
    RouterLink,
  ],
  providers: [
    provideIcons({
      lucideMic,
      lucideSend,
      lucideSparkles,
      lucideSquare,
      lucideTrash2,
    }),
  ],
  template: `
    <button
      aioBtn
      variant="ghost"
      class="text-primary h-11"
      [attr.aria-label]="copy('دستیار هوش مصنوعی', 'AI assistant')"
      (click)="open.set(true)"
    >
      <aio-icon name="lucideSparkles" size="sm" />
      <span class="hidden sm:inline">{{ copy('دستیار', 'Assistant') }}</span>
    </button>

    <aio-dialog
      [(open)]="open"
      (openChange)="$event || closed()"
      [title]="copy('دستیار', 'Assistant')"
      [language]="english() ? 'en' : 'fa'"
      [description]="
        copy(
          'بگو چه کار کنم؛ کارها، وعده‌ها، ورزش و کارت‌هایت را خودم تغییر می‌دهم.',
          'Ask me to manage tasks, meals, workouts and flashcards.'
        )
      "
      [contentClass]="'sm:max-w-lg ' + accent()"
    >
      <ng-template aioDialogBody>
        @if (status.hasValue() && !status.value().chat) {
          <div
            class="bg-accent text-accent-foreground mb-3 rounded-2xl p-4 text-sm"
          >
            {{
              copy(
                'دستیار با سرویس هوش مصنوعی خودت کار می‌کند. اول در',
                'The assistant uses your own AI service. Open'
              )
            }}
            <a
              class="font-semibold underline"
              routerLink="/account"
              (click)="open.set(false)"
              >{{ copy('حساب کاربری ← هوش مصنوعی', 'Account → AI') }}</a
            >
            {{
              copy(
                'نشانی، مدل و کلید را بگذار.',
                'and configure your URL, model and API key.'
              )
            }}
          </div>
        }
        <div
          #log
          class="flex max-h-[50dvh] min-h-40 flex-col gap-3 overflow-y-auto pb-2"
          aria-live="polite"
        >
          @for (m of conversation(); track $index) {
            <div
              class="min-w-0 max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap wrap-anywhere"
              [class]="
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground self-start'
                  : 'bg-muted self-end'
              "
            >
              {{ m.content }}
              @if (m.actions) {
                <span class="mt-1 block text-xs opacity-70"
                  >{{ fa(m.actions) }}
                  {{ copy('کار انجام شد', 'actions completed') }}</span
                >
              }
            </div>
          } @empty {
            <div class="flex flex-col gap-2">
              <span class="text-muted-foreground text-sm">{{
                copy('مثلاً:', 'Try asking:')
              }}</span>
              @for (s of suggestions(); track s) {
                <button
                  aioBtn
                  variant="outline"
                  class="h-auto min-h-11 justify-start whitespace-normal text-start"
                  (click)="send(s)"
                >
                  {{ s }}
                </button>
              }
            </div>
          }
          @if (busy()) {
            <div
              class="bg-muted text-muted-foreground flex items-center gap-2 self-end rounded-2xl px-4 py-2.5 text-sm"
            >
              <aio-spinner [aria-label]="copy('در حال بارگذاری', 'Loading')" />
              {{ copy('دارم انجامش می‌دهم…', 'Working…') }}
            </div>
          }
        </div>

        <form
          aioInputGroup
          class="mt-2 h-auto! min-w-0 flex-col items-stretch"
          (submit)="$event.preventDefault(); send(draft())"
        >
          <textarea
            aioInputGroupTextarea
            id="assistant-message"
            name="assistant-message"
            class="min-h-24 max-h-48 w-full min-w-0 resize-none overflow-x-hidden overflow-y-auto whitespace-pre-wrap wrap-anywhere [field-sizing:content]"
            rows="3"
            wrap="soft"
            autocomplete="off"
            enterkeyhint="enter"
            [placeholder]="
              copy('بنویس یا با میکروفون بگو…', 'Type or use the microphone…')
            "
            [attr.aria-label]="copy('پیام به دستیار', 'Message the assistant')"
            [disabled]="busy()"
            [value]="draft()"
            (input)="draft.set($any($event.target).value)"
          ></textarea>
          <aio-input-group-addon align="block-end" class="justify-end">
            @if (status.hasValue() && status.value().stt) {
              <button
                aioInputGroupButton
                type="button"
                size="icon-sm"
                class="size-11"
                [attr.aria-label]="
                  recording()
                    ? copy('پایان ضبط', 'Stop recording')
                    : copy('گفتن با صدا', 'Speak')
                "
                [attr.aria-pressed]="recording()"
                [disabled]="busy()"
                (click)="recording() ? stopRecording() : startRecording()"
              >
                <aio-icon
                  [name]="recording() ? 'lucideSquare' : 'lucideMic'"
                  size="sm"
                  [class.text-destructive]="recording()"
                />
              </button>
            }
            <button
              aioInputGroupButton
              type="submit"
              size="icon-sm"
              class="size-11"
              [attr.aria-label]="copy('فرستادن', 'Send')"
              [disabled]="busy() || !draft().trim()"
            >
              <aio-icon name="lucideSend" size="sm" />
            </button>
          </aio-input-group-addon>
        </form>
        @if (conversation().length) {
          <button
            aioBtn
            variant="ghost"
            size="sm"
            class="text-muted-foreground mt-2"
            (click)="conversation.set([])"
          >
            <aio-icon name="lucideTrash2" size="xs" />
            {{ copy('گفتگوی تازه', 'New conversation') }}
          </button>
        }
      </ng-template>
    </aio-dialog>
  `,
})
export class Assistant implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly api = inject(API_BASE_URL);
  protected readonly store = inject(AssistantStore);

  /** Which part of the app the user is in (focuses the assistant). */
  readonly context = input<AssistantContext>('home');

  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly draft = signal('');
  protected readonly recording = signal(false);
  private changed = false;
  private recorder: MediaRecorder | null = null;
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');

  protected readonly status = httpResource<AiStatus>(() =>
    this.open() ? `${this.api}/ai/status` : undefined,
  );
  protected readonly suggestions = computed(() => SUGGESTIONS[this.context()]);
  protected readonly accent = computed(
    () =>
      ({
        planner: 'applet-planner',
        health: 'applet-health',
        english: 'applet-english',
        home: '',
      })[this.context()],
  );

  protected readonly english = computed(() => this.context() === 'english');
  protected copy(fa: string, en: string): string {
    return this.english() ? en : fa;
  }
  protected get conversation() {
    return this.english() ? this.store.englishMessages : this.store.messages;
  }
  protected readonly fa = (n: number) =>
    n.toLocaleString(this.english() ? 'en-US' : 'fa-IR');
  private errorMessage(error: unknown): string {
    return this.english()
      ? 'Unable to complete the request. Check your AI settings and try again.'
      : apiErrorMessage(error);
  }

  protected async send(text: string) {
    const content = text.trim();
    if (!content || this.busy()) return;
    const conversation = this.conversation;
    const context = this.context();
    this.draft.set('');
    conversation.update((list) => [...list, { role: 'user', content }]);
    this.busy.set(true);
    this.scroll();
    try {
      const result = await firstValueFrom(
        this.http.post<AssistantReply>(`${this.api}/assistant/chat`, {
          messages: conversation()
            .slice(-20)
            .map(({ role, content, log }) => ({
              role,
              content: content.slice(0, 4000),
              log,
            })),
          context,
        }),
      );
      if (result.changed) this.changed = true;
      const done = result.actions.filter(
        (a) => a.ok && a.kind !== 'read',
      ).length;
      conversation.update((list) => [
        ...list,
        {
          role: 'assistant',
          content: result.reply,
          actions: done,
          log: result.log,
        },
      ]);
    } catch (error) {
      conversation.update((list) => [
        ...list,
        { role: 'assistant', content: this.errorMessage(error) },
      ]);
    } finally {
      this.busy.set(false);
      this.scroll();
    }
  }

  /** After changes, re-open the current page so it shows the new data. */
  protected closed() {
    this.stopRecording();
    if (!this.changed) return;
    this.changed = false;
    const url = this.router.url;
    void this.router
      .navigateByUrl('/', { skipLocationChange: true })
      .then(() => this.router.navigateByUrl(url));
  }

  protected async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type =
        ['audio/webm', 'audio/mp4', 'audio/ogg'].find((t) =>
          MediaRecorder.isTypeSupported(t),
        ) ?? '';
      const recorder = new MediaRecorder(
        stream,
        type ? { mimeType: type } : undefined,
      );
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void this.transcribe(
          new Blob(chunks, {
            type: recorder.mimeType.split(';')[0] || 'audio/webm',
          }),
        );
      };
      recorder.start();
      this.recorder = recorder;
      this.recording.set(true);
      // Recordings are capped on the server (~1.5 MB): stop after 60 s.
      setTimeout(() => this.stopRecording(), 60_000);
    } catch {
      aioToast.error(
        this.copy(
          'به میکروفون دسترسی نداریم.',
          'Unable to access the microphone.',
        ),
      );
    }
  }

  protected stopRecording() {
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.recorder = null;
    this.recording.set(false);
  }

  private async transcribe(audio: Blob) {
    if (!audio.size) return;
    this.busy.set(true);
    try {
      const { text } = await firstValueFrom(
        this.http.post<{ text: string }>(
          `${this.api}/assistant/transcribe`,
          audio,
          {
            headers: { 'Content-Type': audio.type },
          },
        ),
      );
      this.busy.set(false);
      await this.send(text);
    } catch (error) {
      this.busy.set(false);
      aioToast.error(this.errorMessage(error));
    }
  }

  private scroll() {
    setTimeout(() => {
      const el = this.log()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  ngOnDestroy() {
    this.stopRecording();
  }
}
