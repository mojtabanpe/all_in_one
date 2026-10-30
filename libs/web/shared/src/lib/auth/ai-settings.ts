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
  AioButton,
  AioCardDirectives,
  AioFieldDirectives,
  AioIcon,
  AioInput,
  AioSpinner,
  aioToast,
  provideIcons,
} from '@all-in-one/ui';
import {
  lucideCircleCheck,
  lucideCircleDashed,
  lucidePlugZap,
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
    AioFieldDirectives,
    AioIcon,
    AioInput,
    AioSpinner,
  ],
  providers: [
    provideIcons({ lucideCircleCheck, lucideCircleDashed, lucidePlugZap }),
  ],
  template: `
    <section aioCard>
      <div aioCardHeader>
        <h2 aioCardTitle>هوش مصنوعی</h2>
        <p aioCardDescription>
          نشانی سرویس‌های خودت را بگذار (سازگار با OpenAI، مثل
          <span dir="ltr">https://api.openai.com/v1</span>). بدون آن‌ها امکانات
          هوش مصنوعی خاموش‌اند.
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
              <h3 class="font-semibold">{{ s.title }}</h3>
              <span class="text-muted-foreground text-xs">{{
                ready ? 'روشن' : 'خاموش'
              }}</span>
            </div>
            <p class="text-muted-foreground -mt-2 text-xs">{{ s.hint }}</p>
            <div aioField>
              <label aioFieldLabel [for]="'ai-url-' + s.kind"
                >نشانی (URL)</label
              >
              <input
                aioInput
                type="url"
                dir="ltr"
                inputmode="url"
                placeholder="https://…/v1"
                [id]="'ai-url-' + s.kind"
                [value]="d.url"
                (input)="patch(s.kind, { url: $any($event.target).value })"
              />
            </div>
            <div class="grid gap-3" [class.sm:grid-cols-2]="s.kind === 'tts'">
              <div aioField>
                <label aioFieldLabel [for]="'ai-model-' + s.kind">
                  {{ s.kind === 'tts' ? 'صدای اصلی (مدل)' : 'مدل' }}
                </label>
                <input
                  aioInput
                  dir="ltr"
                  [placeholder]="s.modelHint"
                  [id]="'ai-model-' + s.kind"
                  [value]="d.model"
                  (input)="patch(s.kind, { model: $any($event.target).value })"
                />
              </div>
              @if (s.kind === 'tts') {
                <div aioField>
                  <label aioFieldLabel for="ai-model2-tts"
                    >صدای دوم (دیالوگ‌ها)</label
                  >
                  <input
                    aioInput
                    dir="ltr"
                    id="ai-model2-tts"
                    placeholder="اختیاری"
                    [value]="d.model2"
                    (input)="
                      patch(s.kind, { model2: $any($event.target).value })
                    "
                  />
                </div>
              }
            </div>
            <div aioField>
              <label aioFieldLabel [for]="'ai-key-' + s.kind">کلید API</label>
              <input
                aioInput
                type="password"
                dir="ltr"
                autocomplete="off"
                [placeholder]="
                  hasKey(s.kind)
                    ? '•••••• ذخیره شده؛ برای عوض کردن بنویس'
                    : 'اگر سرویس کلید می‌خواهد'
                "
                [id]="'ai-key-' + s.kind"
                [value]="d.key"
                (input)="patch(s.kind, { key: $any($event.target).value })"
              />
            </div>
            <div class="flex flex-wrap gap-2">
              <button aioBtn type="submit" [disabled]="busy() === s.kind">
                ذخیره
              </button>
              <button
                aioBtn
                type="button"
                variant="outline"
                [disabled]="!ready || busy() === s.kind"
                (click)="test(s.kind)"
              >
                @if (testing() === s.kind) {
                  <aio-spinner />
                } @else {
                  <aio-icon name="lucidePlugZap" size="sm" />
                }
                آزمایش اتصال
              </button>
              @if (hasKey(s.kind)) {
                <button
                  aioBtn
                  type="button"
                  variant="ghost"
                  (click)="clearKey(s.kind)"
                >
                  پاک کردن کلید
                </button>
              }
            </div>
          </form>
        }
        <p class="text-muted-foreground text-xs">
          کلیدها رمزگذاری‌شده نگه داشته می‌شوند و دیگر نمایش داده نمی‌شوند.
          هزینه استفاده با سرویس خودت است.
        </p>
      </div>
    </section>
  `,
})
export class AiSettingsCard {
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
      aioToast.success(done);
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
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
      aioToast.error('نام مدل گفتگو را هم بنویس.');
      return;
    }
    void this.put({ [kind]: service }, kind, 'ذخیره شد');
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
      if (result.ok) aioToast.success(result.message);
      else aioToast.error(result.message);
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.testing.set(null);
    }
  }
}
