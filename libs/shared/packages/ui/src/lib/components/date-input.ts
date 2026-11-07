import { AioLocale, AioTranslate } from '../locale';
import {
  booleanAttribute,
  Component,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import {
  BrnDateAdapterToken,
  BrnJalaliDateAdapter,
  BrnUtcDateAdapter,
  JalaliDate,
  PersianDate,
} from '@spartan-ng/brain/date-time';
import {
  BrnCalendarI18nService,
  BrnCalendarI18nToken,
} from '@spartan-ng/brain/calendar';
import { HlmCalendar } from '@spartan-ng/helm/calendar';
import { lucideCalendarDays } from '@ng-icons/lucide';
import { AioIcon, provideIcons } from './icon';
import { AioButton } from '../spartan/button';
import { AioDialog, AioDialogActions, AioDialogBody } from './dialog';

const MONTHS: [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
] = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];
const WEEKDAYS = [
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
  'شنبه',
];

export function isoToJalali(
  value: string | null | undefined,
): JalaliDate | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value)
    return undefined;
  const [y, m, d] = PersianDate.gregorianToJalali(year, month, day);
  return new JalaliDate(y, m, d);
}
export function jalaliToIso(value: JalaliDate): string {
  const [year, month, day] = PersianDate.jalaliToGregorian(
    value.year,
    value.month,
    value.day,
  );
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The calendar grid inside the picker: Solar Hijri in Persian, Gregorian in
 * English. The parent recreates it when the language changes, so its spartan
 * date adapter always matches. Emits Gregorian ISO days either way.
 */
@Component({
  selector: 'aio-date-calendar',
  imports: [HlmCalendar],
  providers: [
    {
      provide: BrnDateAdapterToken,
      useFactory: () =>
        inject(AioLocale).english()
          ? new BrnUtcDateAdapter()
          : new BrnJalaliDateAdapter(),
    },
    {
      provide: BrnCalendarI18nToken,
      useFactory: () => {
        const locale = inject(AioLocale);
        const service = new BrnCalendarI18nService();
        if (locale.english()) {
          // Gregorian calendar, English names (spartan's defaults, pinned to en-US).
          const en = (date: Date, options: Intl.DateTimeFormatOptions) =>
            date.toLocaleDateString('en-US', { timeZone: 'UTC', ...options });
          service.use({
            formatHeader: (month, year) =>
              en(new Date(Date.UTC(year, month, 15)), {
                month: 'long',
                year: 'numeric',
              }),
            formatMonth: (month) =>
              en(new Date(Date.UTC(2000, month, 15)), { month: 'short' }),
            formatYear: (year) => String(year),
            labelPrevious: () => 'Previous month',
            labelNext: () => 'Next month',
          });
          return service;
        }
        const englishMonths = [
          'Farvardin',
          'Ordibehesht',
          'Khordad',
          'Tir',
          'Mordad',
          'Shahrivar',
          'Mehr',
          'Aban',
          'Azar',
          'Dey',
          'Bahman',
          'Esfand',
        ] as typeof MONTHS;
        const weekdays = [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ];
        const monthName = (month: number) =>
          locale.english() ? englishMonths[month] : MONTHS[month];
        service.use({
          firstDayOfWeek: () => 6,
          months: () => (locale.english() ? englishMonths : MONTHS),
          formatMonth: monthName,
          formatYear: (year) => locale.number(year, { useGrouping: false }),
          formatHeader: (month, year) =>
            `${monthName(month)} ${locale.number(year, { useGrouping: false })}`,
          formatWeekdayName: (day) =>
            locale.english()
              ? weekdays[day].slice(0, 3)
              : WEEKDAYS[day].slice(0, 1),
          labelWeekday: (day) =>
            locale.english() ? weekdays[day] : WEEKDAYS[day],
          labelPrevious: () =>
            locale.english() ? 'Previous month' : 'ماه قبل',
          labelNext: () => (locale.english() ? 'Next month' : 'ماه بعد'),
          years: (start = 1300, end = 1500) =>
            Array.from({ length: end - start + 1 }, (_, i) => start + i),
        });
        return service;
      },
    },
  ],
  styles: `
    .aio-calendar {
      --cell-size: 2.75rem;
    }
  `,
  template: `
    <hlm-calendar
      class="aio-calendar p-0 [&_button]:min-h-11 [&_button]:min-w-11"
      [date]="date()"
      [defaultFocusedDate]="date() ?? today"
      [min]="from(min())"
      [max]="from(max())"
      [disabled]="disabled()"
      captionLayout="dropdown"
      (dateChange)="picked.emit(toIso($event))"
    />
  `,
})
export class AioDateCalendar {
  private readonly english = inject(AioLocale).english();
  readonly value = input('');
  readonly min = input<string>();
  readonly max = input<string>();
  readonly disabled = input(false);
  readonly picked = output<string>();
  protected readonly today = this.from(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()),
  );
  protected readonly date = computed(() => this.from(this.value()));
  // The adapter decides the date type: JalaliDate (Persian) or Date (English).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(iso: string | null | undefined): any {
    const jalali = isoToJalali(iso);
    if (!jalali || !this.english) return jalali;
    return new Date(`${iso}T00:00:00Z`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected toIso(date: any): string {
    if (!date) return '';
    return this.english
      ? (date as Date).toISOString().slice(0, 10)
      : jalaliToIso(date as JalaliDate);
  }
}

/** Date field: Solar Hijri in Persian, Gregorian in English; API/form values stay Gregorian ISO days. */
@Component({
  selector: 'aio-date-input',
  imports: [
    AioIcon,
    AioButton,
    AioDialog,
    AioDialogBody,
    AioDialogActions,
    AioDateCalendar,
    AioTranslate,
  ],
  providers: [provideIcons({ lucideCalendarDays })],
  host: { class: 'block min-w-0 w-full' },
  template: `
    <button
      aioBtn
      type="button"
      variant="outline"
      class="min-h-11 w-full min-w-0 justify-between gap-2 rounded-[12px] font-normal motion-safe:active:scale-[0.96]"
      [id]="inputId()"
      [disabled]="disabled() || readonly()"
      [attr.aria-label]="ariaLabel() || null | aioTranslate"
      [attr.aria-invalid]="invalid()"
      [attr.aria-required]="required()"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      (click)="open.set(true); touched.set(true)"
    >
      <span class="min-w-0 truncate" [class.text-muted-foreground]="!value()">{{
        label() | aioTranslate
      }}</span>
      <aio-icon
        name="lucideCalendarDays"
        size="sm"
        class="text-muted-foreground shrink-0"
      />
    </button>
    <aio-dialog
      [(open)]="open"
      [title]="'انتخاب تاریخ' | aioTranslate"
      [contentClass]="
        'sm:max-w-sm [&_[data-slot=dialog-body]]:px-1 ' + contentClass()
      "
    >
      <ng-template aioDialogBody>
        <div class="flex justify-center" [attr.dir]="locale.direction()">
          <!-- @if per language: a fresh calendar gets the matching date adapter. -->
          @if (locale.english()) {
            <aio-date-calendar
              [value]="value()"
              [min]="minDate()"
              [max]="maxDate()"
              [disabled]="disabled() || readonly()"
              (picked)="select($event)"
            />
          } @else {
            <aio-date-calendar
              [value]="value()"
              [min]="minDate()"
              [max]="maxDate()"
              [disabled]="disabled() || readonly()"
              (picked)="select($event)"
            />
          }
        </div>
      </ng-template>
      @if (!required()) {
        <!-- Closing is the sheet's × (directive 109); only the clear action stays here. -->
        <ng-template aioDialogActions>
          <button
            aioBtn
            type="button"
            variant="ghost"
            (click)="value.set(''); open.set(false); touched.set(true)"
          >
            {{ 'پاک‌کردن تاریخ' | aioTranslate }}
          </button>
        </ng-template>
      }
    </aio-dialog>
  `,
})
export class AioDateInput implements FormValueControl<string> {
  protected readonly locale = inject(AioLocale);
  readonly value = model('');
  readonly touched = model(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly required = input(false, { transform: booleanAttribute });
  readonly invalid = input(false, { transform: booleanAttribute });
  readonly inputId = input('');
  readonly contentClass = input('');
  readonly ariaLabel = input('', { alias: 'aria-label' });
  readonly minDate = input<string>();
  readonly maxDate = input<string>();
  protected readonly open = signal(false);
  protected readonly label = computed(() =>
    isoToJalali(this.value())
      ? this.locale.date(this.value(), {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'انتخاب تاریخ',
  );
  protected select(iso: string) {
    this.value.set(iso);
    this.touched.set(true);
    this.open.set(false);
  }
}
