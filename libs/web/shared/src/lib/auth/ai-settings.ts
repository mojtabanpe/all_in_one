import { HttpClient, httpResource } from '@angular/common/http';
import {
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import type {
  AiKind,
  AiSettings,
  AiTestResult,
  UpdateAiSettingsInput,
} from '@all-in-one/shared/schemas';
import {
  AioTranslate,
  AioButton,
  AioCardDirectives,
  AioIcon,
  AioInput,
  provideIcons,
  AioFormField,
  AioAsyncButton,
  AioNotifications,
  verbatim,
} from '@all-in-one/ui';
import {
  lucideCircleCheck,
  lucideCircleDashed,
  lucidePlugZap,
  lucideX,
} from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api/api-base-url';
import { apiErrorMessage } from './auth.guards';

interface Draft {
  url: string;
  model: string;
  model2: string;
  key: string;
}

const SERVICES: {
  kind: AiKind;
  title: string;
  hint: string;
  modelHint: string;
}[] = [
  {
    kind: 'chat',
    title: 'گفتگو (هوش مصنوعی)',
    hint: 'دستیار، کارت‌ساز، متن‌ساز، تخمین کالری و مربی؛ هر سرویس سازگار با OpenAI.',
    modelHint: 'مثلاً gpt-4o-mini',
  },
  {
    kind: 'tts',
    title: 'متن به گفتار',
    hint: 'تلفظ کارت‌ها، خواندن متن و دیالوگ‌های تمرین.',
    modelHint: 'مثلاً tts-1',
  },
  {
    kind: 'stt',
    title: 'گفتار به متن',
    hint: 'حرف زدن با دستیار و تمرین تلفظ و شنیدن.',
    modelHint: 'مثلاً whisper-1',
  },
];

/**
 * The user's own AI services (OpenAI-compatible). Without a url, that AI
 * feature is off for this user. Keys are write-only: the server keeps them
 * encrypted and only says whether one is saved.
 */
@Component({
  selector: 'web-ai-settings',
  imports: [
    AioButton,
    AioCardDirectives,
    AioIcon,
    AioInput,
    AioFormField,
    AioAsyncButton,
    AioTranslate,
  ],
  providers: [
    provideIcons({
      lucideCircleCheck,
      lucideCircleDashed,
      lucidePlugZap,
      lucideX,
    }),
  ],
  template: `
    <section aioCard>
      <div aioCardHeader>
        <h2 aioCardTitle>{{ 'هوش مصنوعی' | aioTranslate }}</h2>
        <p aioCardDescription>
          {{
            'نشانی سرویس‌های خودت را بگذار (سازگار با OpenAI، مثل'
              | aioTranslate
          }}
          <span dir="ltr">
            {{ 'https://api.openai.com/v1' | aioTranslate }} </span
          >{{ '). بدون آن‌ها امکانات هوش مصنوعی خاموش‌اند.' | aioTranslate }}
        </p>
      </div>
      <div aioCardContent class="flex flex-col gap-6">
        @for (s of services; track s.kind) {
          @let d = drafts()[s.kind];
          @let ready = settings.hasValue() && settings.value().ready[s.kind];
          <form
            class="flex flex-col gap-3"
            (submit)="$event.preventDefault(); save(s.kind)"
          >
            <div class="flex items-center gap-2">
              <aio-icon
                [name]="ready ? 'lucideCircleCheck' : 'lucideCircleDashed'"
                size="sm"
                [class]="ready ? 'text-success' : 'text-muted-foreground'"
              />
              <h3 class="font-semibold">{{ s.title | aioTranslate }}</h3>
              <span class="text-muted-foreground text-xs">{{
                (ready ? 'روشن' : 'خاموش') | aioTranslate
              }}</span>
            </div>
            <p class="text-muted-foreground -mt-2 text-xs">
              {{ s.hint | aioTranslate }}
            </p>
            <aio-form-field
              [label]="'نشانی (URL)' | aioTranslate"
              [controlId]="'ai-url-' + s.kind"
            >
              <input
                aioInput
                type="url"
                dir="ltr"
                lang="en"
                inputmode="url"
                placeholder="https://…/v1"
                [id]="'ai-url-' + s.kind"
                [value]="d.url"
                (input)="patch(s.kind, { url: $any($event.target).value })"
              />
            </aio-form-field>
            <div class="grid gap-3" [class.sm:grid-cols-2]="s.kind === 'tts'">
              <aio-form-field
                [label]="
                  (s.kind === 'tts' ? 'صدای اصلی (مدل)' : 'مدل') | aioTranslate
                "
                [controlId]="'ai-model-' + s.kind"
              >
                <input
                  aioInput
                  dir="ltr"
                  lang="en"
                  [placeholder]="s.modelHint | aioTranslate"
                  [id]="'ai-model-' + s.kind"
                  [value]="d.model"
                  (input)="patch(s.kind, { model: $any($event.target).value })"
                />
                @if (saved(s.kind).length) {
                  <div
                    class="flex flex-wrap gap-1.5 pt-1"
                    lang="en"
                    role="group"
                    [attr.aria-label]="'مدل‌های قبلی' | aioTranslate"
                  >
                    @for (m of saved(s.kind); track m) {
                      <span class="inline-flex items-center">
                        <button
                          aioBtn
                          type="button"
                          size="sm"
                          dir="ltr"
                          [variant]="d.model === m ? 'default' : 'outline'"
                          class="min-h-9 rounded-full rounded-e-none pe-2"
                          [attr.aria-pressed]="d.model === m"
                          (click)="patch(s.kind, { model: m })"
                        >
                          {{ m }}
                        </button>
                        <button
                          aioBtn
                          type="button"
                          size="sm"
                          variant="outline"
                          class="text-muted-foreground min-h-9 rounded-full rounded-s-none border-s-0 px-2"
                          [attr.aria-label]="
                            'فراموش کردن {0}' | aioTranslate: [verbatim(m)]
                          "
                          [disabled]="busy() === s.kind"
                          (click)="forget(s.kind, m)"
                        >
                          <aio-icon name="lucideX" size="xs" />
                        </button>
                      </span>
                    }
                  </div>
                }
              </aio-form-field>
              @if (s.kind === 'tts') {
                <aio-form-field
                  [label]="'صدای دوم (دیالوگ‌ها)' | aioTranslate"
                  controlId="ai-model2-tts"
                >
                  <input
                    aioInput
                    dir="ltr"
                    lang="en"
                    id="ai-model2-tts"
                    [placeholder]="'اختیاری' | aioTranslate"
                    [value]="d.model2"
                    (input)="
                      patch(s.kind, { model2: $any($event.target).value })
                    "
                  />
                  @if (saved(s.kind).length) {
                    <div
                      class="flex flex-wrap gap-1.5 pt-1"
                      lang="en"
                      role="group"
                      [attr.aria-label]="'مدل‌های قبلی' | aioTranslate"
                    >
                      @for (m of saved(s.kind); track m) {
                        <span class="inline-flex items-center">
                          <button
                            aioBtn
                            type="button"
                            size="sm"
                            dir="ltr"
                            [variant]="d.model2 === m ? 'default' : 'outline'"
                            class="min-h-9 rounded-full rounded-e-none pe-2"
                            [attr.aria-pressed]="d.model2 === m"
                            (click)="patch(s.kind, { model2: m })"
                          >
                            {{ m }}
                          </button>
                          <button
                            aioBtn
                            type="button"
                            size="sm"
                            variant="outline"
                            class="text-muted-foreground min-h-9 rounded-full rounded-s-none border-s-0 px-2"
                            [attr.aria-label]="
                              'فراموش کردن {0}' | aioTranslate: [verbatim(m)]
                            "
                            [disabled]="busy() === s.kind"
                            (click)="forget(s.kind, m)"
                          >
                            <aio-icon name="lucideX" size="xs" />
                          </button>
                        </span>
                      }
                    </div>
                  }
                </aio-form-field>
              }
            </div>
            <aio-form-field
              [label]="'کلید API' | aioTranslate"
              [controlId]="'ai-key-' + s.kind"
            >
              <input
                aioInput
                type="password"
                dir="ltr"
                lang="en"
                autocomplete="off"
                [placeholder]="
                  (hasKey(s.kind)
                    ? '•••••• ذخیره شده؛ برای عوض کردن بنویس'
                    : 'اگر سرویس کلید می‌خواهد'
                  ) | aioTranslate
                "
                [id]="'ai-key-' + s.kind"
                [value]="d.key"
                (input)="patch(s.kind, { key: $any($event.target).value })"
              />
            </aio-form-field>
            <div class="flex flex-wrap gap-2">
              <button aioBtn type="submit" [disabled]="busy() === s.kind">
                {{ 'ذخیره' | aioTranslate }}
              </button>
              <button
                type="button"
                variant="outline"
                [disabled]="!ready || busy() === s.kind"
                (click)="test(s.kind)"
                aioAsyncButton
                [busy]="testing() === s.kind"
                [label]="'آزمایش اتصال' | aioTranslate"
                icon="lucidePlugZap"
                iconSize="sm"
              ></button>
              @if (hasKey(s.kind)) {
                <button
                  aioBtn
                  type="button"
                  variant="ghost"
                  (click)="clearKey(s.kind)"
                >
                  {{ 'پاک کردن کلید' | aioTranslate }}
                </button>
              }
            </div>
          </form>
        }
        <p class="text-muted-foreground text-xs">
          {{
            'کلیدها رمزگذاری‌شده نگه داشته می‌شوند و دیگر نمایش داده نمی‌شوند. هزینه استفاده با سرویس خودت است.'
              | aioTranslate
          }}
        </p>
      </div>
    </section>
  `,
})
export class AiSettingsCard {
  protected readonly verbatim = verbatim;
  private readonly notifications = inject(AioNotifications);

  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/ai/settings`;

  protected readonly services = SERVICES;
  protected readonly settings = httpResource<AiSettings>(() => this.base);
  protected readonly busy = signal<AiKind | null>(null);
  protected readonly testing = signal<AiKind | null>(null);

  protected readonly drafts = linkedSignal<Record<AiKind, Draft>>(() => {
    const s = this.settings.hasValue() ? this.settings.value() : null;
    const draft = (url = '', model = '', model2 = ''): Draft => ({
      url,
      model,
      model2,
      key: '',
    });
    return {
      chat: draft(s?.chat.url, s?.chat.model),
      tts: draft(s?.tts.url, s?.tts.model, s?.tts.model2),
      stt: draft(s?.stt.url, s?.stt.model),
    };
  });

  private readonly keys = computed(() =>
    this.settings.hasValue()
      ? {
          chat: this.settings.value().chat.hasKey,
          tts: this.settings.value().tts.hasKey,
          stt: this.settings.value().stt.hasKey,
        }
      : { chat: false, tts: false, stt: false },
  );

  protected hasKey(kind: AiKind) {
    return this.keys()[kind];
  }

  protected patch(kind: AiKind, change: Partial<Draft>) {
    this.drafts.update((all) => ({
      ...all,
      [kind]: { ...all[kind], ...change },
    }));
  }

  private async put(input: UpdateAiSettingsInput, kind: AiKind, done: string) {
    this.busy.set(kind);
    try {
      this.settings.set(
        await firstValueFrom(this.http.put<AiSettings>(this.base, input)),
      );
      this.notifications.success(done);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(null);
    }
  }

  protected save(kind: AiKind) {
    const d = this.drafts()[kind];
    const service = {
      url: d.url.trim(),
      model: d.model.trim(),
      ...(d.key.trim() ? { key: d.key.trim() } : {}),
      ...(kind === 'tts' ? { model2: d.model2.trim() } : {}),
    };
    if (kind === 'chat' && service.url && !service.model) {
      this.notifications.error('نام مدل گفتگو را هم بنویس.');
      return;
    }
    void this.put({ [kind]: service }, kind, 'ذخیره شد');
  }

  /** Model names used before; the current one is included. Tap to use, × to forget. */
  protected saved(kind: AiKind): string[] {
    return this.settings.hasValue()
      ? (this.settings.value().savedModels?.[kind] ?? [])
      : [];
  }

  protected forget(kind: AiKind, model: string) {
    void this.put({ forgetModel: { kind, model } }, kind, 'از فهرست حذف شد');
  }

  protected clearKey(kind: AiKind) {
    void this.put({ [kind]: { key: '' } }, kind, 'کلید پاک شد');
  }

  protected async test(kind: AiKind) {
    this.testing.set(kind);
    try {
      const result = await firstValueFrom(
        this.http.post<AiTestResult>(`${this.base}/test`, { kind }),
      );
      if (result.ok) this.notifications.success(result.message);
      else this.notifications.error(result.message);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.testing.set(null);
    }
  }
}
