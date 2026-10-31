import {
  booleanAttribute,
  Component,
  computed,
  input,
  model,
  signal,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import {
  BrnJalaliDateAdapter,
  JalaliDate,
  PersianDate,
  provideDateAdapter,
} from '@spartan-ng/brain/date-time';
import { provideBrnCalendarI18n } from '@spartan-ng/brain/calendar';
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

/** Spartan calendar with Solar Hijri dates; API/form values stay Gregorian ISO days. */
@Component({
  selector: 'aio-date-input',
  imports: [
    AioIcon,
    AioButton,
    AioDialog,
    AioDialogBody,
    AioDialogActions,
    HlmCalendar,
  ],
  providers: [
    provideIcons({ lucideCalendarDays }),
    provideDateAdapter(BrnJalaliDateAdapter),
    provideBrnCalendarI18n({
      firstDayOfWeek: () => 6,
      months: () => MONTHS,
      formatMonth: (month) => MONTHS[month],
      formatYear: (year) =>
        year.toLocaleString('fa-IR', { useGrouping: false }),
      formatHeader: (month, year) =>
        `${MONTHS[month]} ${year.toLocaleString('fa-IR', { useGrouping: false })}`,
      formatWeekdayName: (day) => WEEKDAYS[day].slice(0, 1),
      labelWeekday: (day) => WEEKDAYS[day],
      labelPrevious: () => 'ماه قبل',
      labelNext: () => 'ماه بعد',
      years: (start = 1300, end = 1500) =>
        Array.from({ length: end - start + 1 }, (_, i) => start + i),
    }),
  ],
  host: { class: 'block min-w-0 w-full' },
  styles: `
    .jalali-calendar {
      --cell-size: 2.25rem;
    }
    @media (min-width: 360px) {
      .jalali-calendar {
        --cell-size: 2.75rem;
      }
    }
  `,
  template: `
    <button
      aioBtn
      type="button"
      variant="outline"
      class="min-h-11 w-full min-w-0 justify-between gap-2 font-normal motion-safe:active:scale-[0.96]"
      [id]="inputId()"
      [disabled]="disabled() || readonly()"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-invalid]="invalid()"
      [attr.aria-required]="required()"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      (click)="open.set(true); touched.set(true)"
    >
      <span class="min-w-0 truncate" [class.text-muted-foreground]="!value()">{{
        label()
      }}</span>
      <aio-icon
        name="lucideCalendarDays"
        size="sm"
        class="text-muted-foreground shrink-0"
      />
    </button>
    <aio-dialog
      [(open)]="open"
      title="انتخاب تاریخ شمسی"
      contentClass="sm:max-w-sm"
    >
      <ng-template aioDialogBody>
        <div class="flex justify-center" dir="rtl">
          <hlm-calendar
            class="jalali-calendar"
            [date]="date()"
            [defaultFocusedDate]="date() ?? today"
            [min]="parsedMin()"
            [max]="parsedMax()"
            [disabled]="disabled() || readonly()"
            captionLayout="dropdown"
            (dateChange)="select($event)"
          />
        </div>
      </ng-template>
      <ng-template aioDialogActions>
        @if (!required()) {
          <button
            aioBtn
            type="button"
            variant="ghost"
            (click)="value.set(''); open.set(false); touched.set(true)"
          >
            پاک‌کردن تاریخ
          </button>
        }
        <button
          aioBtn
          type="button"
          variant="outline"
          (click)="open.set(false)"
        >
          بستن
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class AioDateInput implements FormValueControl<string> {
  readonly value = model('');
  readonly touched = model(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly required = input(false, { transform: booleanAttribute });
  readonly invalid = input(false, { transform: booleanAttribute });
  readonly inputId = input('');
  readonly ariaLabel = input('', { alias: 'aria-label' });
  readonly minDate = input<string>();
  readonly maxDate = input<string>();
  protected readonly open = signal(false);
  protected readonly date = computed(() => isoToJalali(this.value()));
  protected readonly parsedMin = computed(() => isoToJalali(this.minDate()));
  protected readonly parsedMax = computed(() => isoToJalali(this.maxDate()));
  protected readonly today = isoToJalali(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()),
  );
  protected readonly label = computed(() =>
    this.date()
      ? new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${this.value()}T12:00:00Z`))
      : 'انتخاب تاریخ',
  );
  protected select(date: JalaliDate | null | undefined) {
    this.value.set(date ? jalaliToIso(date) : '');
    this.touched.set(true);
    this.open.set(false);
  }
}
