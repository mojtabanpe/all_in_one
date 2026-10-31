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
    '۱۰ کارت برای لغات سفر بساز',
    'کارت‌های امروزم چندتاست؟',
    'یک متن B1 درباره ورزش بساز و ذخیره کن',
  ],
};

/** The conversation survives closing the sheet and switching pages (not reloads). */
@Injectable({ providedIn: 'root' })
export class AssistantStore {
  readonly messages = signal<Message[]>([]);
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
      aria-label="دستیار هوش مصنوعی"
      (click)="open.set(true)"
    >
      <aio-icon name="lucideSparkles" size="sm" />
      دستیار
    </button>

    <aio-dialog
      [(open)]="open"
      (openChange)="$event || closed()"
      title="دستیار"
      description="بگو چه کار کنم؛ کارها، وعده‌ها، ورزش و کارت‌هایت را خودم تغییر می‌دهم."
      [contentClass]="'sm:max-w-lg ' + accent()"
    >
      <ng-template aioDialogBody>
        @if (status.hasValue() && !status.value().chat) {
          <div
            class="bg-accent text-accent-foreground mb-3 rounded-2xl p-4 text-sm"
          >
            دستیار با سرویس هوش مصنوعی خودت کار می‌کند. اول در
            <a
              class="font-semibold underline"
              routerLink="/account"
              (click)="open.set(false)"
              >حساب کاربری ← هوش مصنوعی</a
            >
            نشانی، مدل و کلید را بگذار.
          </div>
        }
        <div
          #log
          class="flex max-h-[50dvh] min-h-40 flex-col gap-3 overflow-y-auto pb-2"
          aria-live="polite"
        >
          @for (m of store.messages(); track $index) {
            <div
              class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line"
              [class]="
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground self-start'
                  : 'bg-muted self-end'
              "
            >
              {{ m.content }}
              @if (m.actions) {
                <span class="mt-1 block text-xs opacity-70"
                  >{{ fa(m.actions) }} کار انجام شد</span
                >
              }
            </div>
          } @empty {
            <div class="flex flex-col gap-2">
              <span class="text-muted-foreground text-sm">مثلاً:</span>
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
              <aio-spinner /> دارم انجامش می‌دهم…
            </div>
          }
        </div>

        <form
          aioInputGroup
          class="mt-2"
          (submit)="$event.preventDefault(); send(draft())"
        >
          <input
            aioInputGroupInput
            name="assistant-message"
            autocomplete="off"
            enterkeyhint="send"
            placeholder="بنویس یا با میکروفون بگو…"
            aria-label="پیام به دستیار"
            [disabled]="busy()"
            [value]="draft()"
            (input)="draft.set($any($event.target).value)"
          />
          <aio-input-group-addon align="inline-end">
            @if (status.hasValue() && status.value().stt) {
              <button
                aioInputGroupButton
                type="button"
                size="icon-sm"
                class="size-11"
                [attr.aria-label]="recording() ? 'پایان ضبط' : 'گفتن با صدا'"
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
              aria-label="فرستادن"
              [disabled]="busy() || !draft().trim()"
            >
              <aio-icon name="lucideSend" size="sm" />
            </button>
          </aio-input-group-addon>
        </form>
        @if (store.messages().length) {
          <button
            aioBtn
            variant="ghost"
            size="sm"
            class="text-muted-foreground mt-2"
            (click)="store.messages.set([])"
          >
            <aio-icon name="lucideTrash2" size="xs" /> گفتگوی تازه
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

  protected readonly fa = (n: number) => n.toLocaleString('fa-IR');

  protected async send(text: string) {
    const content = text.trim();
    if (!content || this.busy()) return;
    this.draft.set('');
    this.store.messages.update((list) => [...list, { role: 'user', content }]);
    this.busy.set(true);
    this.scroll();
    try {
      const result = await firstValueFrom(
        this.http.post<AssistantReply>(`${this.api}/assistant/chat`, {
          messages: this.store
            .messages()
            .slice(-20)
            .map(({ role, content, log }) => ({
              role,
              content: content.slice(0, 4000),
              log,
            })),
          context: this.context(),
        }),
      );
      if (result.changed) this.changed = true;
      const done = result.actions.filter(
        (a) => a.ok && a.kind !== 'read',
      ).length;
      this.store.messages.update((list) => [
        ...list,
        {
          role: 'assistant',
          content: result.reply,
          actions: done,
          log: result.log,
        },
      ]);
    } catch (error) {
      this.store.messages.update((list) => [
        ...list,
        { role: 'assistant', content: apiErrorMessage(error) },
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
      aioToast.error('به میکروفون دسترسی نداریم.');
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
      aioToast.error(apiErrorMessage(error));
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
