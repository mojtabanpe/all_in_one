import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, maxLength } from '@angular/forms/signals';
import {
  GROWTH_CAMPAIGN_WINDOWS,
  growthCampaignFilterSchema,
  type GrowthCampaignFilter,
  type GrowthCampaignReport,
} from '@all-in-one/shared/schemas';
import {
  AioButton,
  AioCardDirectives,
  AioCardHeading,
  AioDateInput,
  AioEmptyState,
  AioFormField,
  AioInput,
  AioLocale,
  AioNativeSelect,
  AioNativeSelectOption,
  AioSkeletonRows,
  AioTableDirectives,
  AioTranslate,
} from '@all-in-one/ui';
import { API_BASE_URL } from '@all-in-one/web/shared';

@Component({
  selector: 'admin-campaign-report',
  imports: [
    FormField,
    AioFormField,
    AioInput,
    AioNativeSelect,
    AioNativeSelectOption,
    AioButton,
    AioCardDirectives,
    AioCardHeading,
    AioDateInput,
    AioEmptyState,
    AioSkeletonRows,
    AioTableDirectives,
    AioTranslate,
  ],
  template: `
    <section
      class="flex min-w-0 flex-col gap-4"
      aria-labelledby="campaign-heading"
    >
      <h2 id="campaign-heading" class="text-xl font-semibold">
        {{ 'عملکرد کمپین‌ها' | aioTranslate }}
      </h2>
      <p class="text-sm leading-7 text-muted-foreground">
        {{
          'اولین منبع ثبت‌شدهٔ هر مرورگر در بازهٔ انتخابی، بر اساس روزهای تهران. فیلترها با مقدار کامل و دقیق تطبیق داده می‌شوند؛ خالی یعنی همه. ثبت‌نام و فعالیت بعدی همان مرورگر هم در نتیجه حساب می‌شود.'
            | aioTranslate
        }}
      </p>
      <form class="flex flex-col gap-3" (submit)="apply($event)">
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <aio-form-field label="بازهٔ گزارش کمپین" [controlId]="daysId">
            <aio-native-select
              [selectId]="daysId"
              [value]="model().days"
              (valueChange)="setDays($event)"
            >
              @for (window of windows; track window.days) {
                <option aioNativeSelectOption [value]="window.days">
                  {{ window.label | aioTranslate }}
                </option>
              }
            </aio-native-select>
          </aio-form-field>
          @if (model().days === 'custom') {
            @for (date of dateFields; track date.key) {
              <aio-form-field [label]="date.label" [controlId]="date.id">
                <aio-date-input
                  [inputId]="date.id"
                  [minDate]="oldestDay"
                  [maxDate]="today"
                  [value]="model()[date.key]"
                  (valueChange)="setDate(date.key, $event)"
                  required
                />
              </aio-form-field>
            }
          }
          @for (field of fields; track field.key) {
            <aio-form-field [label]="field.label" [controlId]="field.id">
              <input
                aioInput
                type="text"
                [id]="field.id"
                [formField]="filterForm[field.key]"
                autocomplete="off"
                dir="auto"
              />
            </aio-form-field>
          }
        </div>
        <div class="flex flex-wrap gap-3">
          <button aioBtn type="submit" [disabled]="report.isLoading()">
            {{ 'اعمال فیلتر کمپین' | aioTranslate }}
          </button>
          <button
            aioBtn
            type="button"
            variant="outline"
            [disabled]="report.isLoading()"
            (click)="reset()"
          >
            {{ 'پاک کردن فیلترها' | aioTranslate }}
          </button>
        </div>
        @if (invalid()) {
          <p role="alert" class="text-sm text-destructive">
            {{
              'هر فیلتر باید حداکثر ۲۰۰ نویسه و بدون نویسهٔ کنترلی باشد.'
                | aioTranslate
            }}
          </p>
        }
        @if (invalidRange()) {
          <p role="alert" class="text-sm text-destructive">
            {{
              'تاریخ شروع و پایان را به ترتیب و در ۹۰ روز گذشته انتخاب کن.'
                | aioTranslate
            }}
          </p>
        }
      </form>
      <div class="flex flex-wrap gap-3 text-sm" aria-live="polite">
        @if (filters().from; as from) {
          <span
            >{{ locale.date(from) }} – {{ locale.date(filters().to!) }}</span
          >
        } @else {
          <span>{{ appliedWindowLabel() | aioTranslate }}</span>
        }
        <span>{{ 'فیلترهای اعمال‌شده' | aioTranslate }}:</span>
        @if (hasFilters()) {
          @for (field of fields; track field.key) {
            @if (filters()[field.key]; as value) {
              <span class="min-w-0 max-w-full break-words"
                >{{ field.label | aioTranslate }}:
                <bdi class="break-all">{{ value }}</bdi></span
              >
            }
          }
        } @else {
          <span>{{ 'همهٔ کمپین‌ها' | aioTranslate }}</span>
        }
      </div>
      @if (report.isLoading()) {
        <div
          class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          role="status"
          [attr.aria-label]="'در حال دریافت آمار کمپین' | aioTranslate"
        >
          <div
            aioSkeletonRows
            class="contents"
            [count]="5"
            itemClass="h-20 rounded-xl"
          ></div>
        </div>
      } @else if (report.hasValue()) {
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          @for (tile of tiles(); track tile.label) {
            <section aioCard size="sm">
              <div
                aioCardHeading
                [title]="locale.number(tile.value)"
                [description]="tile.label | aioTranslate"
                [level]="3"
                titleClass="text-2xl"
              ></div>
            </section>
          }
        </div>
        <p class="text-sm leading-7 text-muted-foreground">
          {{
            'شمارنده‌ها شامل همهٔ نتیجه‌های منطبق‌اند؛ جدول فقط ۲۰ ترکیب برتر منبع، رسانه و کمپین را نشان می‌دهد. این اعداد نرخ تبدیل یک گروه ثابت نیستند. منبع ثبت‌نشده با مقدار متنی unknown یا direct یکی نیست.'
              | aioTranslate
          }}
        </p>
        @if (report.value().rows.length) {
          <div>
            <button
              aioBtn
              type="button"
              variant="outline"
              (click)="downloadCsv()"
            >
              {{ 'دانلود جدول کمپین‌ها (CSV)' | aioTranslate }}
            </button>
          </div>
          <div
            aioTableContainer
            class="max-w-full overflow-x-auto"
            tabindex="0"
            [attr.aria-label]="'نتیجهٔ کمپین‌ها' | aioTranslate"
          >
            <table aioTable>
              <caption aioCaption>
                {{
                  'مرورگرهای یکتا؛ فعالیت یعنی ساخت کار، مرور کارت یا ثبت وعده و ورزش موفق. آمار حساب‌ها و هدف‌ها جدا و بدون فیلتر کمپین باقی می‌ماند.'
                    | aioTranslate
                }}
              </caption>
              <thead aioTHead>
                <tr aioTr>
                  <th aioTh scope="col">{{ 'منبع' | aioTranslate }}</th>
                  <th aioTh scope="col">{{ 'رسانه' | aioTranslate }}</th>
                  <th aioTh scope="col">{{ 'کمپین' | aioTranslate }}</th>
                  <th aioTh scope="col">{{ 'بازدید' | aioTranslate }}</th>
                  <th aioTh scope="col">{{ 'شروع ثبت‌نام' | aioTranslate }}</th>
                  <th aioTh scope="col">
                    {{ 'حساب‌های ساخته‌شده' | aioTranslate }}
                  </th>
                  <th aioTh scope="col">
                    {{ 'مرورگرهای دارای فعالیت' | aioTranslate }}
                  </th>
                  <th aioTh scope="col">
                    {{ 'اولین مرور کارت در مرورگر' | aioTranslate }}
                  </th>
                </tr>
              </thead>
              <tbody aioTBody>
                @for (row of report.value().rows; track $index) {
                  <tr aioTr>
                    @for (
                      value of [row.source, row.medium, row.campaign];
                      track $index
                    ) {
                      <td aioTd>
                        <bdi
                          class="inline-block max-w-40 whitespace-normal break-words"
                          >{{ value ?? ('ثبت‌نشده' | aioTranslate) }}</bdi
                        >
                      </td>
                    }
                    <td aioTd>{{ locale.number(row.landingVisitors) }}</td>
                    <td aioTd>{{ locale.number(row.signupVisitors) }}</td>
                    <td aioTd>
                      {{ locale.number(row.completedSignupVisitors) }}
                    </td>
                    <td aioTd>{{ locale.number(row.activeVisitors) }}</td>
                    <td aioTd>{{ locale.number(row.firstReviewVisitors) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div
            aioEmptyState
            [title]="'نتیجه‌ای برای این فیلترها ثبت نشده' | aioTranslate"
            [description]="
              'فیلترها را تغییر بده یا پاک کن تا ورودی‌های دیگر را ببینی.'
                | aioTranslate
            "
          ></div>
        }
      } @else if (report.error()) {
        <section aioCard size="sm">
          <div
            aioCardHeading
            [title]="'آمار کمپین دریافت نشد' | aioTranslate"
            [description]="
              'دریافت نشدن آمار به معنی صفر بودن آن نیست.' | aioTranslate
            "
            [level]="3"
          ></div>
          <div aioCardFooter>
            <button
              aioBtn
              type="button"
              variant="outline"
              (click)="report.reload()"
            >
              {{ 'تلاش دوباره' | aioTranslate }}
            </button>
          </div>
        </section>
      }
    </section>
  `,
})
export class CampaignReport {
  protected readonly locale = inject(AioLocale);
  private readonly api = inject(API_BASE_URL);
  protected readonly model = signal({
    days: '30',
    from: '',
    to: '',
    source: '',
    medium: '',
    campaign: '',
  });
  protected readonly filterForm = form(this.model, (path) => {
    maxLength(path.source, 200);
    maxLength(path.medium, 200);
    maxLength(path.campaign, 200);
  });
  protected readonly filters = signal<GrowthCampaignFilter>({});
  protected readonly invalid = signal(false);
  protected readonly invalidRange = signal(false);
  private readonly dayFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
  });
  protected readonly today = this.dayFormat.format(new Date());
  protected readonly oldestDay = this.dayFormat.format(
    new Date(Date.now() - 89 * 86_400_000),
  );
  protected readonly dateFields = [
    { key: 'from', label: 'شروع بازهٔ کمپین', id: this.locale.controlId() },
    { key: 'to', label: 'پایان بازهٔ کمپین', id: this.locale.controlId() },
  ] as const;
  protected readonly fields = [
    {
      key: 'source',
      label: 'منبع کمپین (utm_source)',
      id: this.locale.controlId(),
    },
    {
      key: 'medium',
      label: 'رسانهٔ کمپین (utm_medium)',
      id: this.locale.controlId(),
    },
    {
      key: 'campaign',
      label: 'نام کمپین (utm_campaign)',
      id: this.locale.controlId(),
    },
  ] as const;
  protected readonly daysId = this.locale.controlId();
  protected readonly windows = [
    ...GROWTH_CAMPAIGN_WINDOWS.map((days) => ({
      days,
      label: { '7': '۷ روز گذشته', '30': '۳۰ روز گذشته', '90': '۹۰ روز گذشته' }[
        days
      ],
    })),
    { days: 'custom', label: 'بازهٔ دلخواه' },
  ];
  protected readonly appliedWindowLabel = computed(
    () =>
      this.windows.find(
        (window) => window.days === (this.filters().days ?? '30'),
      )?.label ?? '',
  );
  protected readonly hasFilters = computed(() =>
    this.fields.some((field) => this.filters()[field.key]),
  );
  protected readonly report = httpResource<GrowthCampaignReport>(() => {
    const params = new URLSearchParams(this.filters());
    return `${this.api}/growth/campaigns${params.size ? '?' + params : ''}`;
  });
  protected readonly tiles = computed(() => {
    const data = this.report.hasValue()
      ? this.report.value().totals
      : undefined;
    return data
      ? [
          { label: 'بازدیدکنندگان کمپین', value: data.landingVisitors },
          { label: 'شروع ثبت‌نام در کمپین', value: data.signupVisitors },
          { label: 'ساخت حساب در کمپین', value: data.completedSignupVisitors },
          { label: 'مرورگرهای دارای فعالیت', value: data.activeVisitors },
          {
            label: 'اولین مرور کارت در مرورگر',
            value: data.firstReviewVisitors,
          },
        ]
      : [];
  });
  protected downloadCsv(): void {
    if (this.report.isLoading() || !this.report.hasValue()) return;
    const { rows, from, to } = this.report.value();
    const { source, medium, campaign } = this.filters();
    if (!rows.length) return;

    const header = [
      'date_from_tehran',
      'date_to_tehran',
      'filter_utm_source',
      'filter_utm_medium',
      'filter_utm_campaign',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'landing_visitors',
      'signup_started_visitors',
      'completed_signup_visitors',
      'active_visitors',
      'first_review_visitors',
    ];
    const records = rows.map((row) => [
      from,
      to,
      source ?? null,
      medium ?? null,
      campaign ?? null,
      row.source,
      row.medium,
      row.campaign,
      row.landingVisitors,
      row.signupVisitors,
      row.completedSignupVisitors,
      row.activeVisitors,
      row.firstReviewVisitors,
    ]);
    const csv = [header, ...records]
      .map((record) => record.map(csvCell).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `campaign-report-${from}_${to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  protected setDays(days: string): void {
    this.model.update((model) => ({ ...model, days }));
  }
  protected setDate(key: 'from' | 'to', value: string): void {
    this.model.update((model) => ({ ...model, [key]: value }));
  }
  protected apply(event: Event): void {
    event.preventDefault();
    const { days, from, to, ...campaign } = this.model();
    const custom = days === 'custom';
    const invalidRange =
      custom &&
      (!from || !to || from > to || from < this.oldestDay || to > this.today);
    this.invalidRange.set(invalidRange);
    this.invalid.set(false);
    if (invalidRange) return;
    const filter = Object.fromEntries(
      Object.entries({
        ...campaign,
        ...(custom ? { from, to } : { days }),
      }).filter(([, value]) => value !== ''),
    );
    const parsed = growthCampaignFilterSchema.safeParse(filter);
    this.invalid.set(!parsed.success);
    if (!parsed.success) return;
    this.setFilters(parsed.data);
  }
  protected reset(): void {
    this.model.set({
      days: '30',
      from: '',
      to: '',
      source: '',
      medium: '',
      campaign: '',
    });
    this.invalid.set(false);
    this.invalidRange.set(false);
    this.setFilters({});
  }
  private setFilters(filter: GrowthCampaignFilter): void {
    if (JSON.stringify(this.filters()) === JSON.stringify(filter))
      this.report.reload();
    else this.filters.set(filter);
  }
}

function csvCell(value: string | number | null): string {
  const text = String(value ?? '');
  // Campaign values are public input. Keep spreadsheet apps from evaluating them.
  const safe = /^[\s\uFEFF]*[=+@-]/u.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
