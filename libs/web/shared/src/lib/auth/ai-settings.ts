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
  AiPresetView,
} from '@all-in-one/shared/schemas';
import { DEFAULT_AI_PROXY } from '@all-in-one/shared/schemas';
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
  AioTableDirectives,
  AioCheckbox,
} from '@all-in-one/ui';
import {
  lucideCircleCheck,
  lucideCircleDashed,
  lucideBookmarkPlus,
  lucidePlugZap,
  lucideTrash2,
} from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api/api-base-url';
import { apiErrorMessage } from './auth.guards';

interface Draft {
  url: string;
  model: string;
  model2: string;
  key: string;
  proxy: boolean;
  proxyUrl: string;
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
    AioTableDirectives,
    AioButton,
    AioCardDirectives,
    AioIcon,
    AioInput,
    AioFormField,
    AioAsyncButton,
    AioTranslate,
    AioCheckbox,
  ],
  providers: [
    provideIcons({
      lucideCircleCheck,
      lucideCircleDashed,
      lucideBookmarkPlus,
      lucidePlugZap,
      lucideTrash2,
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
            class="border-border/70 bg-muted/30 flex flex-col gap-3 rounded-2xl border p-4 sm:p-5"
            [attr.aria-label]="s.title | aioTranslate"
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
            <div class="flex flex-col gap-2">
              <label
                class="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-medium"
                [for]="'ai-proxy-on-' + s.kind"
              >
                <aio-checkbox
                  [inputId]="'ai-proxy-on-' + s.kind"
                  [checked]="d.proxy"
                  (checkedChange)="patch(s.kind, { proxy: $event })"
                />
                {{ 'پراکسی' | aioTranslate }}
              </label>
              @if (d.proxy) {
                <aio-form-field
                  [label]="'نشانی پراکسی' | aioTranslate"
                  [controlId]="'ai-proxy-' + s.kind"
                >
                  <input
                    aioInput
                    type="url"
                    dir="ltr"
                    lang="en"
                    inputmode="url"
                    placeholder="http://127.0.0.1:7890"
                    [id]="'ai-proxy-' + s.kind"
                    [value]="d.proxyUrl"
                    (input)="
                      patch(s.kind, { proxyUrl: $any($event.target).value })
                    "
                  />
                </aio-form-field>
              }
            </div>
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
              <button
                aioBtn
                type="button"
                variant="outline"
                [disabled]="busy() === s.kind || !d.url.trim()"
                (click)="savePreset(s.kind)"
              >
                <aio-icon name="lucideBookmarkPlus" size="sm" />
                {{ 'ذخیره در فهرست' | aioTranslate }}
              </button>
            </div>
            @if (presetsOf(s.kind).length) {
              <div aioTableContainer class="rounded-xl border">
                <table aioTable lang="en" dir="ltr" class="text-xs">
                  <thead aioTHead>
                    <tr aioTr>
                      <th aioTh>Model / URL</th>
                      <th aioTh>Key</th>
                      <th aioTh><span class="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody aioTBody>
                    @for (p of presetsOf(s.kind); track p.id) {
                      <tr aioTr [class.bg-accent]="isCurrent(p)">
                        <td aioTd class="w-full max-w-0">
                          <div class="truncate font-medium">
                            {{ p.model || '—' }}
                            @if (p.model2) {
                              <span class="text-muted-foreground">
                                / {{ p.model2 }}</span
                              >
                            }
                          </div>
                          <div
                            class="text-muted-foreground truncate"
                            [title]="p.url"
                          >
                            {{ p.url }}
                          </div>
                          @if (p.proxy) {
                            <div
                              class="text-muted-foreground truncate"
                              dir="ltr"
                              [title]="p.proxy"
                            >
                              proxy: {{ p.proxy }}
                            </div>
                          }
                        </td>
                        <td aioTd class="font-mono">{{ p.keyHint || '—' }}</td>
                        <td aioTd class="whitespace-nowrap">
                          <button
                            aioBtn
                            type="button"
                            size="sm"
                            [variant]="isCurrent(p) ? 'ghost' : 'default'"
                            [disabled]="busy() === s.kind || isCurrent(p)"
                            (click)="applyPreset(p)"
                          >
                            {{
                              (isCurrent(p) ? 'فعال' : 'استفاده') | aioTranslate
                            }}
                          </button>
                          <button
                            aioBtn
                            type="button"
                            size="sm"
                            variant="ghost"
                            class="text-destructive"
                            [attr.aria-label]="'حذف از فهرست' | aioTranslate"
                            [disabled]="busy() === s.kind"
                            (click)="removePreset(p)"
                          >
                            <aio-icon name="lucideTrash2" size="xs" />
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
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
  private readonly notifications = inject(AioNotifications);

  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/ai/settings`;

  protected readonly services = SERVICES;
  protected readonly settings = httpResource<AiSettings>(() => this.base);
  protected readonly busy = signal<AiKind | null>(null);
  protected readonly testing = signal<AiKind | null>(null);

  protected readonly drafts = linkedSignal<Record<AiKind, Draft>>(() => {
    const s = this.settings.hasValue() ? this.settings.value() : null;
    const draft = (
      v:
        | { url: string; model: string; proxy: boolean; proxyUrl: string }
        | undefined,
      model2 = '',
    ): Draft => ({
      url: v?.url ?? '',
      model: v?.model ?? '',
      model2,
      key: '',
      proxy: v?.proxy ?? false,
      proxyUrl: v?.proxyUrl || DEFAULT_AI_PROXY,
    });
    return {
      chat: draft(s?.chat),
      tts: draft(s?.tts, s?.tts.model2),
      stt: draft(s?.stt),
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
      proxy: d.proxy,
      proxyUrl: d.proxyUrl.trim(),
    };
    if (kind === 'chat' && service.url && !service.model) {
      this.notifications.error('نام مدل گفتگو را هم بنویس.');
      return;
    }
    void this.put({ [kind]: service }, kind, 'ذخیره شد');
  }

  protected presetsOf(kind: AiKind): AiPresetView[] {
    return this.settings.hasValue()
      ? (this.settings.value().presets ?? []).filter((p) => p.kind === kind)
      : [];
  }

  /** The row matching the service's current url and model(s). */
  protected isCurrent(p: AiPresetView): boolean {
    if (!this.settings.hasValue()) return false;
    const v = this.settings.value();
    const cur = v[p.kind];
    return (
      cur.url === p.url &&
      cur.model === p.model &&
      (cur.proxy ? cur.proxyUrl : '') === p.proxy &&
      (p.kind !== 'tts' || v.tts.model2 === p.model2)
    );
  }

  /** Save the section as typed (an empty key field = the stored key) as a new row. */
  protected async savePreset(kind: AiKind) {
    const d = this.drafts()[kind];
    this.busy.set(kind);
    try {
      this.settings.set(
        await firstValueFrom(
          this.http.post<AiSettings>(`${this.base}/presets`, {
            kind,
            url: d.url.trim(),
            model: d.model.trim(),
            ...(kind === 'tts' ? { model2: d.model2.trim() } : {}),
            ...(d.key.trim() ? { key: d.key.trim() } : {}),
            ...(d.proxy ? { proxy: d.proxyUrl.trim() } : {}),
          }),
        ),
      );
      this.notifications.success('در فهرست ذخیره شد');
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(null);
    }
  }

  protected async applyPreset(p: AiPresetView) {
    this.busy.set(p.kind);
    try {
      this.settings.set(
        await firstValueFrom(
          this.http.post<AiSettings>(`${this.base}/presets/${p.id}/apply`, {}),
        ),
      );
      this.notifications.success('این تنظیم فعال شد');
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(null);
    }
  }

  protected async removePreset(p: AiPresetView) {
    this.busy.set(p.kind);
    try {
      this.settings.set(
        await firstValueFrom(
          this.http.delete<AiSettings>(`${this.base}/presets/${p.id}`),
        ),
      );
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(null);
    }
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
