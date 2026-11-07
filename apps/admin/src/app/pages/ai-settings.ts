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
  AioSkeletonRows,
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
import { API_BASE_URL, apiErrorMessage } from '@all-in-one/web/shared';

interface Draft {
  url: string;
  model: string;
  model2: string;
  key: string;
  proxy: boolean;
  proxyUrl: string;
  elevenlabs: boolean;
  deepgram: boolean;
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

/** Operator-managed AI settings for the whole platform. */
@Component({
  selector: 'admin-ai-settings',
  imports: [
    AioTableDirectives,
    AioButton,
    AioCardDirectives,
    AioIcon,
    AioInput,
    AioFormField,
    AioAsyncButton,
    AioSkeletonRows,
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
        <h1 aioCardTitle>{{ 'مدیریت هوش مصنوعی' | aioTranslate }}</h1>
        <p aioCardDescription>
          {{
            'تنظیمات فعال این صفحه برای همهٔ کاربران دارای دسترسی اعمال می‌شود.'
              | aioTranslate
          }}
        </p>
      </div>
      <div aioCardContent class="flex flex-col gap-6">
        @if (settings.isLoading()) {
          <div
            aioSkeletonRows
            [count]="3"
            itemClass="h-24 rounded-xl"
            role="status"
            [attr.aria-label]="
              'در حال دریافت تنظیمات هوش مصنوعی' | aioTranslate
            "
          ></div>
        } @else if (!settings.hasValue()) {
          <button
            aioBtn
            type="button"
            variant="outline"
            class="self-start"
            (click)="settings.reload()"
          >
            {{ 'دریافت دوباره تنظیمات' | aioTranslate }}
          </button>
        } @else {
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
                    (s.kind === 'tts' ? 'صدای اصلی (مدل)' : 'مدل')
                      | aioTranslate
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
                    (input)="
                      patch(s.kind, { model: $any($event.target).value })
                    "
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
              @if (s.kind !== 'chat') {
                <label
                  class="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-medium"
                  [for]="'ai-eleven-' + s.kind"
                >
                  <aio-checkbox
                    [inputId]="'ai-eleven-' + s.kind"
                    [checked]="d.elevenlabs"
                    (checkedChange)="
                      patch(s.kind, {
                        elevenlabs: $event,
                        deepgram: $event ? false : d.deepgram,
                      })
                    "
                  />
                  ElevenLabs
                </label>
                <label
                  class="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-medium"
                  [for]="'ai-deepgram-' + s.kind"
                >
                  <aio-checkbox
                    [inputId]="'ai-deepgram-' + s.kind"
                    [checked]="d.deepgram"
                    (checkedChange)="
                      patch(s.kind, {
                        deepgram: $event,
                        elevenlabs: $event ? false : d.elevenlabs,
                      })
                    "
                  />
                  Deepgram
                </label>
                @if (d.deepgram) {
                  <p class="text-muted-foreground -mt-2 text-xs">
                    {{
                      (s.kind === 'tts'
                        ? 'Deepgram: نشانی خالی = api.deepgram.com؛ در «مدل» نام صدا را بنویس (مثلاً aura-2-thalia-en).'
                        : 'Deepgram: نشانی خالی = api.deepgram.com؛ مدل خالی = nova-3.'
                      ) | aioTranslate
                    }}
                  </p>
                }
                @if (d.elevenlabs) {
                  <p class="text-muted-foreground -mt-2 text-xs">
                    {{
                      (s.kind === 'tts'
                        ? 'ElevenLabs: نشانی خالی = api.elevenlabs.io؛ در «مدل» شناسهٔ صدا (voice id) را بنویس.'
                        : 'ElevenLabs: نشانی خالی = api.elevenlabs.io؛ مدل خالی = scribe_v1.'
                      ) | aioTranslate
                    }}
                  </p>
                }
              }
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
                  [disabled]="
                    busy() === s.kind ||
                    (!d.url.trim() && !d.elevenlabs && !d.deepgram)
                  "
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
                        <tr aioTr [class.bg-accent]="p.active">
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
                            @if (p.elevenlabs || p.deepgram) {
                              <div class="text-muted-foreground" dir="ltr">
                                {{ p.elevenlabs ? 'ElevenLabs' : 'Deepgram' }}
                              </div>
                            }
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
                          <td aioTd class="font-mono">
                            {{ p.keyHint || '—' }}
                          </td>
                          <td aioTd class="whitespace-nowrap">
                            <button
                              aioBtn
                              type="button"
                              size="sm"
                              [variant]="p.active ? 'ghost' : 'default'"
                              [disabled]="busy() === s.kind || p.active"
                              (click)="applyPreset(p)"
                            >
                              {{
                                (p.active ? 'فعال' : 'استفاده') | aioTranslate
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
              'کلیدها روی سرور رمزگذاری می‌شوند و در پنل نمایش داده نمی‌شوند.'
                | aioTranslate
            }}
          </p>
        }
      </div>
    </section>
    @if (settings.hasValue()) {
      <section aioCard class="mt-6" aria-labelledby="ai-scope-heading">
        <div aioCardHeader>
          <h2 aioCardTitle id="ai-scope-heading">
            {{ 'بررسی حوزهٔ درخواست' | aioTranslate }}
          </h2>
          <p aioCardDescription>
            {{
              'پیش از هر درخواست آزاد (دستیار و پاسخ کارت)، یک مدل تصمیم‌گیر بررسی می‌کند که درخواست به برنامه‌ریزی، انگلیسی یا سلامت مربوط باشد، تا کسی از هوش مصنوعی برنامه برای کار دیگری استفاده نکند.'
                | aioTranslate
            }}
          </p>
        </div>
        <form
          aioCardContent
          class="flex flex-col gap-4"
          (submit)="$event.preventDefault(); saveScope()"
        >
          <label
            class="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-medium"
            for="ai-scope-on"
          >
            <aio-checkbox
              inputId="ai-scope-on"
              [checked]="scope().on"
              (checkedChange)="scope.set({ on: $event, model: scope().model })"
            />
            {{ 'بررسی حوزه روشن باشد' | aioTranslate }}
          </label>
          <aio-form-field
            [label]="'مدل تصمیم‌گیر' | aioTranslate"
            controlId="ai-scope-model"
          >
            <input
              aioInput
              id="ai-scope-model"
              dir="ltr"
              lang="en"
              autocomplete="off"
              maxlength="100"
              [placeholder]="settings.value().chat.model || 'gpt-4o-mini'"
              [value]="scope().model"
              (input)="
                scope.set({
                  on: scope().on,
                  model: $any($event.target).value,
                })
              "
            />
          </aio-form-field>
          <p class="text-muted-foreground -mt-2 text-xs">
            {{
              'روی همان سرویس گفتگو؛ خالی = همان مدل گفتگو. یک مدل کوچک و ارزان کافی است.'
                | aioTranslate
            }}
          </p>
          <button
            aioAsyncButton
            type="submit"
            class="min-h-11 self-start"
            [busy]="savingScope()"
            [label]="'ذخیرهٔ بررسی حوزه' | aioTranslate"
          ></button>
        </form>
      </section>
    }
  `,
})
export class AiSettingsPage {
  private readonly notifications = inject(AioNotifications);

  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/ai/admin/settings`;

  protected readonly services = SERVICES;
  protected readonly settings = httpResource<AiSettings>(() => this.base);
  protected readonly busy = signal<AiKind | null>(null);
  protected readonly testing = signal<AiKind | null>(null);
  protected readonly savingScope = signal(false);
  protected readonly scope = linkedSignal(() =>
    this.settings.hasValue()
      ? { ...this.settings.value().scope }
      : { on: true, model: '' },
  );

  protected readonly drafts = linkedSignal<Record<AiKind, Draft>>(() => {
    const s = this.settings.hasValue() ? this.settings.value() : null;
    const draft = (
      v:
        | {
            url: string;
            model: string;
            proxy: boolean;
            proxyUrl: string;
            elevenlabs: boolean;
            deepgram: boolean;
          }
        | undefined,
      model2 = '',
    ): Draft => ({
      url: v?.url ?? '',
      model: v?.model ?? '',
      model2,
      key: '',
      proxy: v?.proxy ?? false,
      proxyUrl: v?.proxyUrl || DEFAULT_AI_PROXY,
      elevenlabs: v?.elevenlabs ?? false,
      deepgram: v?.deepgram ?? false,
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
      ...(kind !== 'chat'
        ? { elevenlabs: d.elevenlabs, deepgram: d.deepgram }
        : {}),
    };
    if (kind === 'chat' && service.url && !service.model) {
      this.notifications.error('نام مدل گفتگو را هم بنویس.');
      return;
    }
    void this.put({ [kind]: service }, kind, 'ذخیره شد');
  }

  protected async saveScope() {
    const { on, model } = this.scope();
    this.savingScope.set(true);
    try {
      this.settings.set(
        await firstValueFrom(
          this.http.put<AiSettings>(this.base, {
            scope: { on, model: model.trim() },
          } satisfies UpdateAiSettingsInput),
        ),
      );
      this.notifications.success('ذخیره شد');
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.savingScope.set(false);
    }
  }

  protected presetsOf(kind: AiKind): AiPresetView[] {
    return this.settings.hasValue()
      ? (this.settings.value().presets ?? []).filter((p) => p.kind === kind)
      : [];
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
            ...(d.elevenlabs && kind !== 'chat' ? { elevenlabs: true } : {}),
            ...(d.deepgram && kind !== 'chat' ? { deepgram: true } : {}),
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
