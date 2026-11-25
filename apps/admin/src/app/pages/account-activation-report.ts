import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
import {
  AioButton,
  AioCardDirectives,
  AioDateInput,
  AioEmptyState,
  AioFormField,
  AioLocale,
  AioSkeletonRows,
  AioTableDirectives,
  AioTranslate,
} from '@all-in-one/ui';
import type {
  GrowthAccountActivationReport,
  GrowthAccountActivationSource,
} from '@all-in-one/shared/schemas';
import { API_BASE_URL } from '@all-in-one/web/shared';

const MAX_RANGE_DAYS = 90;

function tehranToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(
    new Date(),
  );
}

/** Raw campaign tags stay as recorded; only the fixed values are translated. */
function sourceLabel(source: GrowthAccountActivationSource | null): {
  label: string;
  translate: boolean;
} {
  switch (source) {
    case null:
      return { label: 'ثبت‌نشده (حساب قدیمی/بدون رضایت)', translate: true };
    case 'unknown':
      return { label: 'نامشخص', translate: true };
    case 'direct':
      return { label: 'مستقیم', translate: true };
    case 'other':
      return { label: 'سایر', translate: true };
    default:
      return { label: source, translate: false };
  }
}

@Component({
  selector: 'admin-account-activation-report',
  imports: [
    FormField,
    AioButton,
    AioCardDirectives,
    AioDateInput,
    AioEmptyState,
    AioFormField,
    AioSkeletonRows,
    AioTableDirectives,
    AioTranslate,
  ],
  template: `
    <section
      id="account-activation"
      class="flex min-w-0 flex-col gap-4"
      aria-labelledby="account-activation-heading"
    >
      <div>
        <h2 id="account-activation-heading" class="text-xl font-semibold">
          {{ 'فعال‌سازی و بازگشت حساب‌ها' | aioTranslate }}
        </h2>
        <p class="mt-2 text-sm leading-7 text-muted-foreground">
          {{
            'حساب‌ها بر اساس روز ثبت‌نام به وقت تهران در گزارش می‌آیند. هر دو روز شروع و پایان در بازه حساب می‌شوند.'
              | aioTranslate
          }}
        </p>
      </div>

      <form
        class="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
        (submit)="apply($event)"
        (focusin)="refreshToday()"
      >
        @for (field of dateFields; track field.key) {
          <aio-form-field [label]="field.label" [controlId]="field.id">
            <aio-date-input
              [inputId]="field.id"
              [aria-label]="field.label"
              [maxDate]="today()"
              [formField]="rangeForm[field.key]"
            />
          </aio-form-field>
        }
        <button aioBtn type="submit" class="min-h-11">
          {{ 'نمایش گزارش حساب‌ها' | aioTranslate }}
        </button>
        @if (invalidRange()) {
          <p role="alert" class="text-sm text-destructive sm:col-span-3">
            {{
              'تاریخ شروع و پایان را به ترتیب انتخاب کن. پایان حداکثر امروز تهران و شروع حداکثر ۹۰ روز اخیر، با احتساب امروز، باشد.'
                | aioTranslate
            }}
          </p>
        }
      </form>

      <div class="space-y-1 text-sm leading-7 text-muted-foreground">
        <p>
          {{
            'اولین اقدام یعنی نخستین فعالیت ثبت‌شده پس از ثبت‌نام، مثل ساخت کار، مرور کارت یا ثبت وعده یا ورزش. میانه، زمان ثبت‌نام تا اولین اقدام را برای حساب‌هایی نشان می‌دهد که اقدام کرده‌اند.'
              | aioTranslate
          }}
        </p>
        <p>
          {{
            'بازگشت D1 و D7 یعنی فعالیت دقیقاً در روز تقویمی ۱ یا ۷ پس از روز ثبت‌نام به وقت تهران. روز ثبت‌نام روز صفر است. مخرج هر نرخ فقط حساب‌هایی را شامل می‌شود که روز مربوط برایشان به پایان رسیده است.'
              | aioTranslate
          }}
        </p>
      </div>

      <p class="text-sm leading-7 text-muted-foreground">
        {{
          'اولین اقدام یعنی اقدام در روز ثبت‌نام به وقت تهران. حساب‌های تست حذف می‌شوند: ادمین، برچسب QA و ایمیل‌های دامنهٔ رزرو (example و test). حساب تست قدیمی بدون این نشانه، و حساب فقط پیامکی، تشخیص‌پذیر نیست.'
            | aioTranslate
        }}
      </p>

      @if (report.isLoading()) {
        <div role="status" class="space-y-2">
          <p class="text-sm text-muted-foreground">
            {{ 'در حال دریافت گزارش فعال‌سازی حساب‌ها…' | aioTranslate }}
          </p>
          <div aioSkeletonRows [count]="3" itemClass="h-20 rounded-xl"></div>
        </div>
      } @else if (report.error()) {
        <div aioCard size="sm">
          <div aioCardContent class="flex flex-wrap items-center gap-3">
            @if (badRequest()) {
              <p role="alert">
                {{
                  'بازهٔ انتخاب‌شده پذیرفته نشد. بازه را در ۹۰ روز گذشته و تا امروز تهران انتخاب کن.'
                    | aioTranslate
                }}
              </p>
            } @else {
              <p role="alert">
                {{ 'گزارش فعال‌سازی حساب‌ها دریافت نشد.' | aioTranslate }}
              </p>
              <button
                aioBtn
                type="button"
                variant="outline"
                class="min-h-11"
                (click)="report.reload()"
              >
                {{ 'تلاش دوباره' | aioTranslate }}
              </button>
            }
          </div>
        </div>
      } @else if (report.hasValue()) {
        @let data = report.value();
        <p class="text-sm text-muted-foreground">
          {{
            'بازهٔ گزارش حساب‌ها از {0} تا {1}'
              | aioTranslate: [formatDay(data.from), formatDay(data.to)]
          }}
        </p>
        @let coverage = data.coverage;
        <div class="space-y-1 text-sm leading-7 text-muted-foreground">
          <p>
            {{
              'حساب‌های گزارش: {0}. حساب تست حذف‌شده: {1}. حساب فقط پیامکی (بدون بررسی دامنهٔ تست): {2}.'
                | aioTranslate
                  : [
                      locale.number(coverage.accounts),
                      locale.number(coverage.excludedTestAccounts),
                      locale.number(coverage.phoneOnlyAccounts),
                    ]
            }}
          </p>
          @if (coverage.untimedReviewAccounts > 0) {
            <p role="status" class="font-medium text-foreground">
              {{
                'هشدار: ممکن است کم‌شمارش باشد. برای {0} حساب، مرور کارتِ بدون زمان ثبت‌شده در روز ۰ تا ۷ وجود دارد و در نرخ‌ها نیامده است.'
                  | aioTranslate
                    : [locale.number(coverage.untimedReviewAccounts)]
              }}
            </p>
          }
        </div>
        @if (empty()) {
          <div
            aioEmptyState
            [title]="
              'برای این بازه داده‌ای از ثبت‌نام حساب‌ها وجود ندارد.'
                | aioTranslate
            "
            [description]="
              'برای بررسی ثبت‌نام‌های دیگر، بازه را تغییر بده.' | aioTranslate
            "
          ></div>
        } @else {
          <p class="text-sm text-muted-foreground">
            {{
              'هر نرخ همراه تعداد حساب‌های موفق از حساب‌های واجد شرایط است.'
                | aioTranslate
            }}
          </p>
          @for (group of groups(); track group.title) {
            <section aioCard size="sm">
              <div aioCardContent>
                <div class="overflow-x-auto">
                  <table aioTable>
                    <caption class="mb-3 text-start font-semibold">
                      {{
                        group.title | aioTranslate
                      }}
                    </caption>
                    <thead aioTHead>
                      <tr aioTr>
                        <th aioTh scope="col">
                          {{ group.heading | aioTranslate }}
                        </th>
                        @for (metric of rateColumns; track metric.key) {
                          <th aioTh scope="col">
                            {{ metric.label | aioTranslate }}
                          </th>
                        }
                        <th aioTh scope="col">
                          {{ 'میانه تا اولین اقدام' | aioTranslate }}
                        </th>
                      </tr>
                    </thead>
                    <tbody aioTBody>
                      @for (row of group.rows; track row.key) {
                        <tr aioTr>
                          <th aioTh scope="row" class="font-medium">
                            <bdi
                              class="inline-block max-w-40 whitespace-normal break-words"
                              >{{
                                row.translate
                                  ? (row.label | aioTranslate)
                                  : row.label
                              }}</bdi
                            >
                          </th>
                          @for (column of rateColumns; track column.key) {
                            @let rate = row.metrics[column.key];
                            <td aioTd>
                              @if (rate.eligible === 0) {
                                {{ 'حساب واجد شرایط ندارد' | aioTranslate }}
                              } @else if (rate.percent === null) {
                                {{ 'غیرقابل محاسبه' | aioTranslate }}
                              } @else {
                                {{ percent(rate.percent) }}
                              }
                              <bdi
                                dir="ltr"
                                class="block text-xs text-muted-foreground"
                              >
                                {{ locale.number(rate.successful) }}/{{
                                  locale.number(rate.eligible)
                                }}
                              </bdi>
                            </td>
                          }
                          <td aioTd>
                            @let median = row.metrics.medianFirstActionMinutes;
                            @if (median === null) {
                              {{ 'غیرقابل محاسبه' | aioTranslate }}
                            } @else if (median <= 60) {
                              {{
                                '{0} دقیقه'
                                  | aioTranslate
                                    : [
                                        locale.number(median, {
                                          maximumFractionDigits: 1,
                                        }),
                                      ]
                              }}
                            } @else {
                              {{
                                longMedian(median)
                                  | aioTranslate: longArgs(median)
                              }}
                            }
                          </td>
                        </tr>
                      } @empty {
                        <tr aioTr>
                          <td aioTd colspan="5">
                            {{ 'داده‌ای برای این تفکیک نیست.' | aioTranslate }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          }
        }
      }
    </section>
  `,
})
export class AccountActivationReport {
  readonly platformLabel = input.required<(value: string) => string>();
  protected readonly locale = inject(AioLocale);
  private readonly api = inject(API_BASE_URL);
  protected readonly today = signal(tehranToday());

  protected refreshToday(): void {
    this.today.set(tehranToday());
  }

  // Shift a Tehran calendar day, independent of browser timezone.
  private priorDay(offset: number): string {
    const day = new Date(this.today());
    day.setUTCDate(day.getUTCDate() - offset);
    return day.toISOString().slice(0, 10);
  }

  private readonly range = signal({
    from: this.priorDay(30),
    to: this.priorDay(1),
  });
  protected readonly rangeForm = form(this.range, (path) => {
    required(path.from);
    required(path.to);
  });
  protected readonly dateFields = [
    { key: 'from', label: 'شروع بازهٔ حساب‌ها', id: this.locale.controlId() },
    { key: 'to', label: 'پایان بازهٔ حساب‌ها', id: this.locale.controlId() },
  ] as const;
  protected readonly invalidRange = signal(false);
  private readonly appliedRange = signal(this.range(), {
    equal: (a, b) => a.from === b.from && a.to === b.to,
  });

  protected readonly report = httpResource<GrowthAccountActivationReport>(
    () =>
      `${this.api}/growth/account-activation?${new URLSearchParams(this.appliedRange())}`,
  );

  protected readonly badRequest = computed(() => {
    const error = this.report.error();
    return error instanceof HttpErrorResponse && error.status === 400;
  });

  protected readonly rateColumns = [
    { key: 'firstAction', label: 'اولین اقدام' },
    { key: 'd1', label: 'بازگشت روز ۱ (D1)' },
    { key: 'd7', label: 'بازگشت روز ۷ (D7)' },
  ] as const;

  protected readonly empty = computed(() => {
    if (!this.report.hasValue()) return false;
    const { overall, bySource, bySignupPlatform } = this.report.value();
    return (
      !bySource.length &&
      !bySignupPlatform.length &&
      overall.medianFirstActionMinutes === null &&
      this.rateColumns.every(({ key }) => overall[key].eligible === 0)
    );
  });

  protected readonly groups = computed(() => {
    if (!this.report.hasValue()) return [];
    const { overall, bySource, bySignupPlatform } = this.report.value();
    return [
      {
        title: 'کل حساب‌ها در بازه',
        heading: 'حساب‌ها',
        rows: [
          {
            key: 'overall',
            label: 'همهٔ حساب‌ها',
            translate: true,
            metrics: overall,
          },
        ],
      },
      {
        title: 'به تفکیک منبع جذب',
        heading: 'منبع جذب',
        rows: bySource.map(({ source, metrics }) => ({
          key: source,
          ...sourceLabel(source),
          metrics,
        })),
      },
      {
        title: 'به تفکیک بستر ثبت‌نام',
        heading: 'بستر ثبت‌نام',
        rows: bySignupPlatform.map(({ signupPlatform, metrics }) => ({
          key: signupPlatform,
          ...(signupPlatform === null
            ? { label: 'نامشخص', translate: true }
            : signupPlatform === 'other'
              ? { label: 'سایر', translate: true }
              : {
                  label: this.platformLabel()(signupPlatform),
                  translate: true,
                }),
          metrics,
        })),
      },
    ];
  });

  protected formatDay(day: string): string {
    return this.locale.date(day, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  protected longMedian(minutes: number): string {
    return Math.round(minutes) % 60 === 0 ? '{0} ساعت' : '{0} ساعت و {1} دقیقه';
  }

  protected longArgs(minutes: number): string[] {
    const total = Math.round(minutes);
    return [
      this.locale.number(Math.floor(total / 60)),
      this.locale.number(total % 60),
    ];
  }

  protected percent(value: number): string {
    return this.locale.number(value / 100, {
      style: 'percent',
      maximumFractionDigits: 1,
    });
  }

  protected apply(event: Event): void {
    event.preventDefault();
    const range = this.range();
    this.refreshToday();
    const valid =
      this.rangeForm().valid() &&
      range.from <= range.to &&
      range.to <= this.today() &&
      range.from >= this.priorDay(MAX_RANGE_DAYS - 1);
    this.invalidRange.set(!valid);
    if (valid) this.appliedRange.set(range);
  }
}
