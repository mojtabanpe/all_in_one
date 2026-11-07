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
  AiScopeProvider,
  AiScopeTestResult,
  AiQuotas,
  AiQuotaTier,
  AiUsageOverview,
  AiPrices,
  AiCostReport,
  AiHealthReport,
  AiAlert,
} from '@all-in-one/shared/schemas';
import {
  AI_USER_CONCURRENCY,
  DEFAULT_AI_PROXY,
  DEFAULT_AI_QUOTAS,
  DEFAULT_AI_PRICES,
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
  AioSkeletonRows,
  AioNotifications,
  AioTableDirectives,
  AioCheckbox,
  AioNativeSelect,
  AioNativeSelectOption,
  AioLocale,
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
    AioNativeSelect,
    AioNativeSelectOption,
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
      <section aioCard class="mt-6" aria-labelledby="ai-health-heading">
        <div aioCardHeader>
          <h2 aioCardTitle id="ai-health-heading">
            {{ 'پایداری و هشدارها' | aioTranslate }}
          </h2>
          <p aioCardDescription>
            {{
              'اگر سرویس اصلی قطع، شلوغ یا کلیدش نامعتبر باشد، درخواست یک بار به سرویس جایگزین می‌رود. هر کاربر حداکثر {0} درخواست هم‌زمان دارد.'
                | aioTranslate: [locale.number(concurrency)]
            }}
          </p>
        </div>
        <div aioCardContent class="flex flex-col gap-5">
          @if (health.hasValue()) {
            @let h = health.value();
            @if (h.alerts.length) {
              <ul
                class="border-destructive/40 bg-destructive/5 flex flex-col gap-1 rounded-xl border p-3 text-sm"
                role="alert"
              >
                @for (alert of h.alerts; track $index) {
                  <li>{{ alertText(alert) }}</li>
                }
              </ul>
            } @else {
              <p class="text-sm" role="status">
                {{ 'هشداری نیست.' | aioTranslate }}
              </p>
            }
            <div
              aioTableContainer
              class="max-w-full overflow-x-auto"
              tabindex="0"
              [attr.aria-label]="'وضعیت سرویس‌ها' | aioTranslate"
            >
              <table aioTable>
                <thead aioTHead>
                  <tr aioTr>
                    <th aioTh scope="col">{{ 'سرویس' | aioTranslate }}</th>
                    <th aioTh scope="col">
                      {{ 'یک ساعت اخیر' | aioTranslate }}
                    </th>
                    <th aioTh scope="col">
                      {{ '۲۴ ساعت اخیر' | aioTranslate }}
                    </th>
                    <th aioTh scope="col">
                      {{ 'آخرین خطا' | aioTranslate }}
                    </th>
                  </tr>
                </thead>
                <tbody aioTBody>
                  @for (kind of quotaKinds; track kind.id) {
                    <tr aioTr>
                      <th aioTh scope="row">
                        {{ serviceNames[kind.id] | aioTranslate }}
                      </th>
                      <td aioTd>{{ healthText(h.hour[kind.id]) }}</td>
                      <td aioTd>{{ healthText(h.day[kind.id]) }}</td>
                      <td aioTd class="text-xs">
                        @if (h.lastError[kind.id]; as error) {
                          <bdi dir="ltr">{{ error.message }}</bdi>
                          <span class="text-muted-foreground block">{{
                            locale.date(error.at, {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          }}</span>
                        } @else {
                          —
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="text-muted-foreground text-xs">
              {{
                'از راه‌اندازی سرور در {0}؛ با هر انتشار از صفر شروع می‌شود. هزینهٔ امروز: {1}'
                  | aioTranslate
                    : [
                        locale.date(h.since, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }),
                        money(h.todayUsd),
                      ]
              }}
            </p>
          } @else if (health.error()) {
            <p role="alert" class="text-sm">
              {{ 'وضعیت سرویس‌ها دریافت نشد.' | aioTranslate }}
            </p>
          } @else {
            <div aioSkeletonRows [count]="2" itemClass="h-10 rounded-lg"></div>
          }
          <form
            class="flex flex-col gap-4"
            (submit)="$event.preventDefault(); saveResilience()"
          >
            <div class="grid gap-3 sm:grid-cols-3">
              @for (kind of quotaKinds; track kind.id) {
                <aio-form-field
                  [label]="
                    'جایگزین {0}'
                      | aioTranslate: [serviceNames[kind.id] | aioTranslate]
                  "
                  [controlId]="'fallback-' + kind.id"
                >
                  <aio-native-select
                    [attr.lang]="fallbackDraft()[kind.id] ? 'en' : null"
                    [selectId]="'fallback-' + kind.id"
                    [value]="fallbackDraft()[kind.id] ?? ''"
                    (valueChange)="setFallback(kind.id, $any($event))"
                  >
                    <option aioNativeSelectOption value="">
                      {{ 'بدون جایگزین' | aioTranslate }}
                    </option>
                    @for (preset of presetsOf(kind.id); track preset.id) {
                      <option
                        aioNativeSelectOption
                        lang="en"
                        [value]="preset.id"
                      >
                        {{ presetLabel(preset) }}
                      </option>
                    }
                  </aio-native-select>
                </aio-form-field>
              }
            </div>
            <p class="text-muted-foreground -mt-2 text-xs">
              {{
                'جایگزین از «تنظیمات ذخیره‌شده» همان سرویس انتخاب می‌شود. اگر تنظیمی نیست، اول آن را با «ذخیره در فهرست» ذخیره کن.'
                  | aioTranslate
              }}
            </p>
            <aio-form-field
              class="sm:max-w-xs"
              [label]="
                'سقف هزینهٔ روزانه برای هشدار (دلار، ۰ = بدون هشدار)'
                  | aioTranslate
              "
              controlId="ai-daily-budget"
            >
              <input
                aioInput
                id="ai-daily-budget"
                type="number"
                inputmode="decimal"
                min="0"
                step="any"
                dir="ltr"
                lang="en"
                [value]="budgetDraft()"
                (input)="
                  budgetDraft.set(budgetValue($any($event.target).value))
                "
              />
            </aio-form-field>
            <button
              aioAsyncButton
              type="submit"
              class="min-h-11 self-start"
              [busy]="savingResilience()"
              [label]="'ذخیرهٔ جایگزین‌ها و سقف هزینه' | aioTranslate"
            ></button>
          </form>
        </div>
      </section>
    }
    @if (settings.hasValue()) {
      @let sc = scope();
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
              [checked]="sc.on"
              (checkedChange)="patchScope({ on: $event })"
            />
            {{ 'بررسی حوزه روشن باشد' | aioTranslate }}
          </label>
          <aio-form-field
            [label]="'مدل تصمیم‌گیر' | aioTranslate"
            controlId="ai-scope-provider"
          >
            <aio-native-select
              selectId="ai-scope-provider"
              [value]="sc.provider"
              (valueChange)="patchScope({ provider: $any($event) })"
            >
              <option aioNativeSelectOption value="local">
                {{ 'مدل محلی روی سرور (رایگان)' | aioTranslate }}
              </option>
              <option aioNativeSelectOption value="chat">
                {{ 'یک مدل روی سرویس گفتگو' | aioTranslate }}
              </option>
              <option aioNativeSelectOption value="jev">
                {{ 'Jev (TypeSafe)، فقط با پراکسی' | aioTranslate }}
              </option>
            </aio-native-select>
          </aio-form-field>
          @if (sc.provider === 'local') {
            <p class="text-muted-foreground -mt-2 text-xs">
              {{
                'یک مدل کوچک چندزبانه روی همین سرور: درخواست جایی فرستاده نمی‌شود و هزینه‌ای ندارد. درخواست را با نمونه‌های در حوزه و بیرون از حوزه مقایسه می‌کند.'
                  | aioTranslate
              }}
            </p>
          } @else if (sc.provider === 'jev') {
            <p class="text-muted-foreground -mt-2 text-xs">
              {{
                'Jev متن تولید نمی‌کند؛ فقط احتمال «در حوزه بودن» را برمی‌گرداند و فقط توکن ورودی حساب می‌شود. کلید را از typesafe.ai بگیر.'
                  | aioTranslate
              }}
            </p>
            <aio-form-field
              [label]="'کلید API' | aioTranslate"
              controlId="ai-scope-key"
            >
              <input
                aioInput
                id="ai-scope-key"
                type="password"
                dir="ltr"
                lang="en"
                autocomplete="off"
                [placeholder]="
                  settings.value().scope.hasKey
                    ? ('ذخیره شده؛ برای تغییر بنویس' | aioTranslate)
                    : ''
                "
                [value]="sc.key"
                (input)="patchScope({ key: $any($event.target).value })"
              />
            </aio-form-field>
            <aio-form-field
              [label]="'نشانی (URL)' | aioTranslate"
              controlId="ai-scope-url"
            >
              <input
                aioInput
                id="ai-scope-url"
                type="url"
                dir="ltr"
                lang="en"
                placeholder="https://api.typesafe.ai"
                [value]="sc.url"
                (input)="patchScope({ url: $any($event.target).value })"
              />
            </aio-form-field>
            <label
              class="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-medium"
              for="ai-scope-proxy-on"
            >
              <aio-checkbox
                inputId="ai-scope-proxy-on"
                [checked]="sc.proxy"
                (checkedChange)="patchScope({ proxy: $event })"
              />
              {{ 'پراکسی' | aioTranslate }}
            </label>
            @if (sc.proxy) {
              <aio-form-field
                [label]="'نشانی پراکسی' | aioTranslate"
                controlId="ai-scope-proxy"
              >
                <input
                  aioInput
                  id="ai-scope-proxy"
                  dir="ltr"
                  lang="en"
                  [value]="sc.proxyUrl"
                  (input)="patchScope({ proxyUrl: $any($event.target).value })"
                />
              </aio-form-field>
            }
          } @else {
            <aio-form-field
              [label]="'مدل' | aioTranslate"
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
                [value]="sc.model"
                (input)="patchScope({ model: $any($event.target).value })"
              />
            </aio-form-field>
            <p class="text-muted-foreground -mt-2 text-xs">
              {{
                'روی همان سرویس گفتگو؛ خالی = همان مدل گفتگو. یک مدل کوچک و ارزان کافی است.'
                  | aioTranslate
              }}
            </p>
          }
          <button
            aioAsyncButton
            type="submit"
            class="min-h-11 self-start"
            [busy]="savingScope()"
            [label]="'ذخیرهٔ بررسی حوزه' | aioTranslate"
          ></button>
        </form>
        <form
          aioCardFooter
          class="flex flex-col items-stretch gap-3"
          (submit)="$event.preventDefault(); testScope(probe.value)"
        >
          <aio-form-field
            [label]="'یک جمله را امتحان کن' | aioTranslate"
            controlId="ai-scope-probe"
          >
            <input
              aioInput
              #probe
              id="ai-scope-probe"
              maxlength="2000"
              required
              [placeholder]="'مثلاً: یک کد پایتون بنویس' | aioTranslate"
            />
          </aio-form-field>
          <button
            aioAsyncButton
            type="submit"
            class="min-h-11 self-start"
            [busy]="probing()"
            [label]="'بررسی' | aioTranslate"
          ></button>
          @if (probeResult(); as r) {
            <p role="status" class="text-sm font-medium">
              {{
                (r.inScope ? 'در حوزهٔ اپ است' : 'بیرون از حوزه؛ رد می‌شود')
                  | aioTranslate
              }}
              @if (r.probability !== null) {
                <span dir="ltr" lang="en" class="text-muted-foreground">
                  ({{ (r.probability * 100).toFixed(0) }}%)</span
                >
              }
            </p>
          }
        </form>
      </section>
    }
    @if (settings.hasValue()) {
      <section aioCard class="mt-6" aria-labelledby="ai-quota-heading">
        <div aioCardHeader>
          <h2 aioCardTitle id="ai-quota-heading">
            {{ 'سهمیهٔ روزانهٔ هوش مصنوعی' | aioTranslate }}
          </h2>
          <p aioCardDescription>
            {{
              'سقف مصرف هر روز (به وقت تهران) برای هر نوع دسترسی. گفتگو بر حسب توکن، متن به گفتار بر حسب کاراکتر و گفتار به متن بر حسب تعداد ضبط. مدیرها محدودیتی ندارند.'
                | aioTranslate
            }}
          </p>
        </div>
        <form
          aioCardContent
          class="flex flex-col gap-5"
          (submit)="$event.preventDefault(); saveQuotas()"
        >
          @for (tier of quotaTiers; track tier.id) {
            <fieldset class="flex min-w-0 flex-col gap-3">
              <legend class="mb-2 text-sm font-semibold">
                {{ tier.label | aioTranslate }}
              </legend>
              <div class="grid gap-3 sm:grid-cols-3">
                @for (kind of quotaKinds; track kind.id) {
                  <aio-form-field
                    [label]="kind.label | aioTranslate"
                    [controlId]="'quota-' + tier.id + '-' + kind.id"
                  >
                    <input
                      aioInput
                      type="number"
                      inputmode="numeric"
                      min="0"
                      step="1"
                      dir="ltr"
                      lang="en"
                      required
                      [id]="'quota-' + tier.id + '-' + kind.id"
                      [value]="quotaDraft()[tier.id][kind.id]"
                      (input)="
                        setQuota(tier.id, kind.id, $any($event.target).value)
                      "
                    />
                  </aio-form-field>
                }
              </div>
            </fieldset>
          }
          <button
            aioAsyncButton
            type="submit"
            class="min-h-11 self-start"
            [busy]="savingQuotas()"
            [label]="'ذخیرهٔ سهمیه‌ها' | aioTranslate"
          ></button>
        </form>
        @if (overview.hasValue()) {
          <div aioCardFooter class="flex flex-col items-stretch gap-2">
            <h3 class="text-sm font-semibold">
              {{ 'مصرف امروز همهٔ کاربران' | aioTranslate }}
            </h3>
            <ul class="flex flex-col gap-1 text-sm">
              @for (kind of quotaKinds; track kind.id) {
                @let row = overview.value().kinds[kind.id];
                <li class="flex flex-wrap justify-between gap-x-3">
                  <span class="font-medium">{{
                    kind.label | aioTranslate
                  }}</span>
                  <span class="text-muted-foreground">{{
                    '{0} کاربر، {1} درخواست، {2} واحد'
                      | aioTranslate
                        : [
                            locale.number(row.users),
                            locale.number(row.calls),
                            locale.number(row.units),
                          ]
                  }}</span>
                </li>
              }
            </ul>
          </div>
        }
      </section>
    }
    @if (settings.hasValue()) {
      <section aioCard class="mt-6" aria-labelledby="ai-cost-heading">
        <div aioCardHeader>
          <h2 aioCardTitle id="ai-cost-heading">
            {{ 'هزینهٔ هوش مصنوعی' | aioTranslate }}
          </h2>
          <p aioCardDescription>
            {{
              'قیمت سرویس‌ها را به دلار (همان‌طور که ارائه‌دهنده حساب می‌کند) وارد کن تا هزینهٔ ۳۰ روز اخیر به تفکیک سرویس و نوع دسترسی محاسبه شود. قیمت‌ها برای مدل فعلی هر سرویس است و هزینه‌ها برآوردی‌اند.'
                | aioTranslate
            }}
          </p>
        </div>
        <form
          aioCardContent
          class="flex flex-col gap-4"
          (submit)="$event.preventDefault(); savePrices()"
        >
          <div class="grid gap-3 sm:grid-cols-2">
            @for (field of priceFields; track field.id) {
              <aio-form-field
                [label]="field.label | aioTranslate"
                [controlId]="'price-' + field.id"
              >
                <input
                  aioInput
                  type="number"
                  inputmode="decimal"
                  min="0"
                  step="any"
                  dir="ltr"
                  lang="en"
                  required
                  [id]="'price-' + field.id"
                  [value]="priceDraft()[field.id]"
                  (input)="setPrice(field.id, $any($event.target).value)"
                />
              </aio-form-field>
            }
          </div>
          <button
            aioAsyncButton
            type="submit"
            class="min-h-11 self-start"
            [busy]="savingPrices()"
            [label]="'ذخیرهٔ قیمت‌ها' | aioTranslate"
          ></button>
        </form>
        @if (costs.hasValue()) {
          @let report = costs.value();
          <div aioCardFooter class="flex flex-col items-stretch gap-4">
            @if (!report.priced) {
              <p class="text-muted-foreground text-sm">
                {{
                  'تا قیمت‌ها وارد نشوند، هزینه صفر نشان داده می‌شود.'
                    | aioTranslate
                }}
              </p>
            }
            <p class="text-sm font-semibold">
              {{
                'هزینهٔ ۳۰ روز اخیر: {0}'
                  | aioTranslate: [money(report.totalUsd)]
              }}
            </p>
            <ul class="flex flex-col gap-1 text-sm">
              @for (kind of quotaKinds; track kind.id) {
                <li class="flex flex-wrap justify-between gap-x-3">
                  <span class="font-medium">{{
                    kind.label | aioTranslate
                  }}</span>
                  <span class="text-muted-foreground">{{
                    money(report.kinds[kind.id].usd)
                  }}</span>
                </li>
              }
            </ul>
            @if (report.tiers.length) {
              <div
                aioTableContainer
                class="max-w-full overflow-x-auto"
                tabindex="0"
                [attr.aria-label]="'هزینه به تفکیک نوع دسترسی' | aioTranslate"
              >
                <table aioTable>
                  <thead aioTHead>
                    <tr aioTr>
                      <th aioTh scope="col">
                        {{ 'نوع دسترسی' | aioTranslate }}
                      </th>
                      <th aioTh scope="col">
                        {{ 'کاربران' | aioTranslate }}
                      </th>
                      <th aioTh scope="col">{{ 'هزینه' | aioTranslate }}</th>
                      <th aioTh scope="col">
                        {{ 'هر کاربر در ماه' | aioTranslate }}
                      </th>
                    </tr>
                  </thead>
                  <tbody aioTBody>
                    @for (row of report.tiers; track row.tier) {
                      <tr aioTr>
                        <th aioTh scope="row">
                          {{ tierLabels[row.tier] | aioTranslate }}
                        </th>
                        <td aioTd>{{ locale.number(row.users) }}</td>
                        <td aioTd>{{ money(row.usd) }}</td>
                        <td aioTd>{{ money(row.usdPerUserMonth) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }
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
  protected readonly locale = inject(AioLocale);
  protected readonly quotaTiers: { id: AiQuotaTier; label: string }[] = [
    { id: 'trial', label: 'دورهٔ آزمایشی' },
    { id: 'earned', label: 'هدیه' },
    { id: 'paid', label: 'پولی' },
  ];
  protected readonly quotaKinds: { id: AiKind; label: string }[] = [
    { id: 'chat', label: 'گفتگو (توکن)' },
    { id: 'tts', label: 'متن به گفتار (کاراکتر)' },
    { id: 'stt', label: 'گفتار به متن (ضبط)' },
  ];
  protected readonly quotaDraft = linkedSignal<AiQuotas>(() =>
    structuredClone(
      this.settings.hasValue()
        ? this.settings.value().quotas
        : DEFAULT_AI_QUOTAS,
    ),
  );
  protected readonly savingQuotas = signal(false);
  protected readonly priceFields: { id: keyof AiPrices; label: string }[] = [
    { id: 'chatInput', label: 'گفتگو: دلار برای هر میلیون توکن ورودی' },
    { id: 'chatOutput', label: 'گفتگو: دلار برای هر میلیون توکن خروجی' },
    { id: 'tts', label: 'متن به گفتار: دلار برای هر میلیون کاراکتر' },
    { id: 'stt', label: 'گفتار به متن: دلار برای هر ضبط' },
    { id: 'usdToToman', label: 'نرخ دلار (تومان)' },
  ];
  protected readonly tierLabels: Record<
    AiCostReport['tiers'][number]['tier'],
    string
  > = {
    paid: 'پولی',
    trial: 'دورهٔ آزمایشی',
    earned: 'هدیه',
    staff: 'مدیر',
    unknown: 'نامشخص (پیش از ثبت نوع)',
  };
  protected readonly priceDraft = linkedSignal<AiPrices>(() => ({
    ...(this.settings.hasValue()
      ? this.settings.value().prices
      : DEFAULT_AI_PRICES),
  }));
  protected readonly savingPrices = signal(false);
  protected readonly concurrency = AI_USER_CONCURRENCY;
  protected readonly serviceNames: Record<AiKind, string> = {
    chat: 'گفتگو',
    tts: 'متن به گفتار',
    stt: 'گفتار به متن',
  };
  protected readonly health = httpResource<AiHealthReport>(
    () => `${this.base}/health`,
  );
  protected readonly fallbackDraft = linkedSignal<
    Record<AiKind, string | null>
  >(() =>
    this.settings.hasValue()
      ? { ...this.settings.value().fallbacks }
      : { chat: null, tts: null, stt: null },
  );
  protected readonly budgetDraft = linkedSignal(() =>
    this.settings.hasValue() ? this.settings.value().dailyBudgetUsd : 0,
  );
  protected readonly savingResilience = signal(false);

  /** «model — host» (technical names stay as written). */
  protected presetLabel(preset: AiPresetView): string {
    let host = preset.url;
    try {
      host = new URL(preset.url).host;
    } catch {
      /* A provider default (empty url) keeps the raw value. */
    }
    const provider = preset.elevenlabs
      ? 'ElevenLabs'
      : preset.deepgram
        ? 'Deepgram'
        : host;
    return `${preset.model}${provider ? ` — ${provider}` : ''}${preset.active ? ' ✓' : ''}`;
  }

  protected setFallback(kind: AiKind, id: string) {
    this.fallbackDraft.update((all) => ({ ...all, [kind]: id || null }));
  }

  protected budgetValue(value: string): number {
    return Math.min(100_000, Math.max(0, Number(value) || 0));
  }

  protected healthText(health: {
    calls: number;
    failed: number;
    fellBack: number;
  }): string {
    return this.locale.text('{0} درخواست، {1} خطا، {2} با جایگزین', [
      this.locale.number(health.calls),
      this.locale.number(health.failed),
      this.locale.number(health.fellBack),
    ]);
  }

  protected alertText(alert: AiAlert): string {
    switch (alert.kind) {
      case 'errors':
        return this.locale.text(
          '{0}: {1} خطا از {2} درخواست در یک ساعت اخیر.',
          [
            this.locale.text(this.serviceNames[alert.service]),
            this.locale.number(alert.failed),
            this.locale.number(alert.calls),
          ],
        );
      case 'fallback':
        return this.locale.text(
          '{0}: سرویس اصلی خطا می‌دهد و {1} درخواست در یک ساعت اخیر به جایگزین رفت.',
          [
            this.locale.text(this.serviceNames[alert.service]),
            this.locale.number(alert.fellBack),
          ],
        );
      case 'budget':
        return this.locale.text(
          'هزینهٔ امروز ({0}) از سقف روزانه ({1}) گذشته است.',
          [this.money(alert.todayUsd), this.money(alert.budgetUsd)],
        );
      case 'budget-near':
        return this.locale.text(
          'هزینهٔ امروز ({0}) به ۸۰٪ سقف روزانه ({1}) رسیده است.',
          [this.money(alert.todayUsd), this.money(alert.budgetUsd)],
        );
    }
  }

  protected async saveResilience() {
    this.savingResilience.set(true);
    try {
      this.settings.set(
        await firstValueFrom(
          this.http.put<AiSettings>(this.base, {
            fallbacks: this.fallbackDraft(),
            dailyBudgetUsd: this.budgetDraft(),
          } satisfies UpdateAiSettingsInput),
        ),
      );
      this.health.reload();
      this.notifications.success('ذخیره شد');
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.savingResilience.set(false);
    }
  }
  protected readonly costs = httpResource<AiCostReport>(
    () => `${this.base}/costs`,
  );

  /** Dollars, plus Toman when the rate is set: «۱٫۲۴ دلار (۱۲۴٬۰۰۰ تومان)». */
  protected money(usd: number): string {
    const rate = this.costs.hasValue() ? this.costs.value().usdToToman : 0;
    const dollars = this.locale.number(usd, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: usd < 1 ? 4 : 2,
    });
    return rate
      ? `${dollars} (${this.locale.number(Math.round(usd * rate))} ${this.locale.text('تومان')})`
      : dollars;
  }

  protected setPrice(field: keyof AiPrices, value: string) {
    const amount = Math.max(0, Number(value) || 0);
    this.priceDraft.update((all) => ({ ...all, [field]: amount }));
  }

  protected async savePrices() {
    this.savingPrices.set(true);
    try {
      this.settings.set(
        await firstValueFrom(
          this.http.put<AiSettings>(this.base, {
            prices: this.priceDraft(),
          } satisfies UpdateAiSettingsInput),
        ),
      );
      this.costs.reload();
      this.notifications.success('ذخیره شد');
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.savingPrices.set(false);
    }
  }
  protected readonly overview = httpResource<AiUsageOverview>(
    () => `${this.base}/usage`,
  );

  protected setQuota(tier: AiQuotaTier, kind: AiKind, value: string) {
    const amount = Math.max(0, Math.floor(Number(value) || 0));
    this.quotaDraft.update((all) => ({
      ...all,
      [tier]: { ...all[tier], [kind]: amount },
    }));
  }

  protected async saveQuotas() {
    this.savingQuotas.set(true);
    try {
      this.settings.set(
        await firstValueFrom(
          this.http.put<AiSettings>(this.base, {
            quotas: this.quotaDraft(),
          } satisfies UpdateAiSettingsInput),
        ),
      );
      this.notifications.success('ذخیره شد');
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.savingQuotas.set(false);
    }
  }
  protected readonly probing = signal(false);
  protected readonly probeResult = signal<AiScopeTestResult | null>(null);
  /** The scope form; `key` is only what the admin typed (the stored key never comes back). */
  protected readonly scope = linkedSignal(() => {
    const s = this.settings.hasValue() ? this.settings.value().scope : null;
    return {
      on: s?.on ?? true,
      provider: s?.provider ?? ('local' as AiScopeProvider),
      model: s?.model ?? '',
      url: s?.url ?? '',
      key: '',
      proxy: s?.proxy ?? false,
      proxyUrl: s?.proxyUrl || DEFAULT_AI_PROXY,
    };
  });

  protected patchScope(change: Partial<ReturnType<typeof this.scope>>) {
    this.scope.update((value) => ({ ...value, ...change }));
  }

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
    const { key, ...form } = this.scope();
    this.savingScope.set(true);
    try {
      this.settings.set(
        await firstValueFrom(
          this.http.put<AiSettings>(this.base, {
            scope: {
              ...form,
              model: form.model.trim(),
              url: form.url.trim(),
              proxyUrl: form.proxyUrl.trim(),
              ...(key.trim() ? { key: key.trim() } : {}),
            },
          } satisfies UpdateAiSettingsInput),
        ),
      );
      this.probeResult.set(null);
      this.notifications.success('ذخیره شد');
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.savingScope.set(false);
    }
  }

  protected async testScope(text: string) {
    if (!text.trim()) return;
    this.probing.set(true);
    try {
      this.probeResult.set(
        await firstValueFrom(
          this.http.post<AiScopeTestResult>(`${this.base}/scope-test`, {
            text: text.trim(),
          }),
        ),
      );
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.probing.set(false);
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
