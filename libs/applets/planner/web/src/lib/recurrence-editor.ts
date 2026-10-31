import {
  Component,
  computed,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import {
  type CreateTaskInput,
  isRepeatRule,
  validTimeZone,
} from '@all-in-one/applets/planner/contracts';
import {
  AioButton,
  AioDateInput,
  AioCheckbox,
  AioFieldDirectives,
  AioInput,
  AioNativeSelect,
  AioNativeSelectDirectives,
} from '@all-in-one/ui';

type Settings = Pick<
  CreateTaskInput,
  | 'repeatRule'
  | 'repeatFrom'
  | 'recurrenceEnd'
  | 'recurrenceTimezone'
  | 'durationMin'
>;
const days = [
  ['SA', 'شنبه'],
  ['SU', 'یکشنبه'],
  ['MO', 'دوشنبه'],
  ['TU', 'سه‌شنبه'],
  ['WE', 'چهارشنبه'],
  ['TH', 'پنجشنبه'],
  ['FR', 'جمعه'],
];
/** Recognize only rules the preset controls can reproduce without losing clauses. */
export function recurrencePreset(rule: string | null | undefined): string {
  if (!rule) return 'NONE';
  const parts = Object.fromEntries(
    rule
      .replace(/^RRULE:/, '')
      .split(';')
      .map((part) => part.split('=')),
  );
  if (
    Object.keys(parts).some(
      (key) => !['FREQ', 'INTERVAL', 'BYDAY', 'COUNT'].includes(key),
    ) ||
    (parts['INTERVAL'] && parts['INTERVAL'] !== '1')
  )
    return 'CUSTOM';
  const frequency = parts['FREQ'];
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(frequency))
    return 'CUSTOM';
  if (parts['BYDAY']) {
    if (
      frequency !== 'WEEKLY' ||
      !/^(SA|SU|MO|TU|WE|TH|FR)(,(SA|SU|MO|TU|WE|TH|FR))*$/.test(parts['BYDAY'])
    )
      return 'CUSTOM';
    if (parts['BYDAY'].split(',').sort().join(',') === 'MO,SA,SU,TU,WE')
      return 'WORKDAYS';
  }
  return frequency;
}

/** Feature form composed entirely from existing UI wrappers; emits one validated patch. */
@Component({
  selector: 'planner-recurrence-editor',
  imports: [
    AioButton,
    AioDateInput,
    AioCheckbox,
    AioFieldDirectives,
    AioInput,
    AioNativeSelect,
    AioNativeSelectDirectives,
  ],
  host: { class: 'block min-w-0 w-full' },
  template: `
    <fieldset aioFieldSet class="min-w-0 gap-4 border-t border-border pt-5">
      <div aioField class="min-w-0 gap-2">
        <label aioFieldLabel [for]="prefix() + 'preset'">تکرار</label>
        <aio-native-select
          [selectId]="prefix() + 'preset'"
          [value]="preset()"
          (valueChange)="preset.set($event)"
        >
          <option aioNativeSelectOption value="NONE">تکرار نمی‌شود</option>
          <option aioNativeSelectOption value="DAILY">هر روز</option>
          <option aioNativeSelectOption value="WORKDAYS">
            روزهای کاری (شنبه تا چهارشنبه)
          </option>
          <option aioNativeSelectOption value="WEEKLY">هر هفته</option>
          <option aioNativeSelectOption value="MONTHLY">هر ماه</option>
          <option aioNativeSelectOption value="YEARLY">هر سال</option>
          <option aioNativeSelectOption value="CUSTOM">دلخواه</option>
        </aio-native-select>
      </div>
      @if (preset() !== 'NONE') {
        @if (preset() === 'CUSTOM') {
          <div class="grid min-w-0 grid-cols-2 gap-3">
            <div aioField class="min-w-0 gap-2">
              <label aioFieldLabel [for]="prefix() + 'freq'">واحد تکرار</label>
              <aio-native-select
                [selectId]="prefix() + 'freq'"
                [value]="frequency()"
                (valueChange)="frequency.set($event); raw.set('')"
              >
                <option aioNativeSelectOption value="DAILY">روز</option>
                <option aioNativeSelectOption value="WEEKLY">هفته</option>
                <option aioNativeSelectOption value="MONTHLY">ماه</option>
                <option aioNativeSelectOption value="YEARLY">سال</option>
              </aio-native-select>
            </div>
            <div aioField class="min-w-0 gap-2">
              <label aioFieldLabel [for]="prefix() + 'interval'"
                >فاصلهٔ تکرار</label
              >
              <input
                aioInput
                type="number"
                min="1"
                max="10000"
                [id]="prefix() + 'interval'"
                [value]="interval()"
                (input)="interval.set(+$any($event.target).value); raw.set('')"
              />
            </div>
          </div>
        }
        @if (
          preset() === 'WEEKLY' ||
          (preset() === 'CUSTOM' && frequency() === 'WEEKLY')
        ) {
          <fieldset aioFieldSet class="min-w-0 gap-2">
            <legend aioFieldLegend class="text-sm">روزهای هفته</legend>
            <p class="text-muted-foreground text-xs">
              اگر روزی انتخاب نکنی، روز تاریخ شروع تکرار می‌شود.
            </p>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              @for (d of weekdays; track d[0]) {
                <label
                  [for]="prefix() + 'day-' + d[0]"
                  class="flex min-h-11 items-center gap-2"
                >
                  <aio-checkbox
                    [inputId]="prefix() + 'day-' + d[0]"
                    [checked]="selectedDays().includes(d[0])"
                    (checkedChange)="toggleDay(d[0], $event)"
                    [aria-label]="d[1]"
                  />{{ d[1] }}
                </label>
              }
            </div>
          </fieldset>
        }
        <div aioField class="min-w-0 gap-2">
          <label aioFieldLabel [for]="prefix() + 'end'">پایان تکرار</label>
          <aio-native-select
            [selectId]="prefix() + 'end'"
            [value]="ending()"
            (valueChange)="ending.set($event); endTouched.set(true)"
          >
            <option aioNativeSelectOption value="NEVER">بدون پایان</option>
            <option aioNativeSelectOption value="DATE">در تاریخ</option>
            <option aioNativeSelectOption value="COUNT">پس از چند نوبت</option>
          </aio-native-select>
          @if (ending() === 'DATE') {
            <aio-date-input
              contentClass="applet-planner"
              aria-label="تاریخ پایان تکرار"
              [value]="until()"
              (valueChange)="until.set($event)"
            />
          }
          @if (ending() === 'COUNT') {
            <input
              aioInput
              type="number"
              aria-label="تعداد نوبت‌ها"
              min="1"
              max="10000"
              [value]="count()"
              (input)="count.set(+$any($event.target).value)"
            />
          }
        </div>
      }
      <button
        aioBtn
        type="button"
        variant="ghost"
        class="min-w-0 self-start px-0 text-muted-foreground"
        [attr.aria-expanded]="advanced()"
        [attr.aria-controls]="prefix() + 'advanced'"
        (click)="advanced.set(!advanced())"
      >
        {{ advanced() ? 'بستن تنظیمات پیشرفته' : 'تنظیمات پیشرفته' }}
      </button>
      @if (advanced()) {
        <div [id]="prefix() + 'advanced'" class="flex min-w-0 flex-col gap-4">
          @if (preset() !== 'NONE') {
            <div aioField class="min-w-0 gap-2">
              <label aioFieldLabel [for]="prefix() + 'from'">مبنای تکرار</label>
              <aio-native-select
                [selectId]="prefix() + 'from'"
                [value]="repeatFrom()"
                (valueChange)="repeatFrom.set($event)"
              >
                <option aioNativeSelectOption value="SCHEDULE">
                  تاریخ برنامه‌ریزی‌شده
                </option>
                <option aioNativeSelectOption value="COMPLETION">
                  زمان انجام نوبت قبلی
                </option>
              </aio-native-select>
            </div>
            <div aioField class="min-w-0 gap-2">
              <label aioFieldLabel [for]="prefix() + 'zone'"
                >منطقهٔ زمانی</label
              >
              <input
                aioInput
                dir="ltr"
                [id]="prefix() + 'zone'"
                [value]="zone()"
                (input)="zone.set($any($event.target).value)"
              />
              <p aioFieldDescription>
                زمان شروع بر اساس این منطقه است. نمایش روزانه با تهران هماهنگ
                می‌شود.
              </p>
            </div>
            @if (preset() === 'CUSTOM') {
              <div aioField class="min-w-0 gap-2">
                <label aioFieldLabel [for]="prefix() + 'rule'"
                  >قانون RRULE (اختیاری)</label
                >
                <input
                  aioInput
                  dir="ltr"
                  [id]="prefix() + 'rule'"
                  [value]="raw()"
                  (input)="raw.set($any($event.target).value)"
                  placeholder="RRULE:FREQ=MONTHLY;BYDAY=-1FR"
                />
              </div>
            }
          }
          <div aioField class="min-w-0 gap-2">
            <label aioFieldLabel [for]="prefix() + 'duration'"
              >مدت کار (دقیقه، اختیاری)</label
            >
            <input
              aioInput
              type="number"
              min="1"
              max="10080"
              [id]="prefix() + 'duration'"
              [value]="duration() ?? ''"
              (input)="
                duration.set(
                  $any($event.target).value ? +$any($event.target).value : null
                )
              "
            />
          </div>
        </div>
      }
      @if (error()) {
        <p role="alert" class="text-destructive text-sm">{{ error() }}</p>
      }
      <button
        aioBtn
        type="button"
        variant="outline"
        class="w-full min-w-0"
        [disabled]="!!error()"
        (click)="apply()"
      >
        ثبت تنظیمات تکرار
      </button>
    </fieldset>
  `,
})
export class RecurrenceEditor {
  readonly value = input<Settings>({});
  readonly prefix = input('repeat-');
  readonly changed = output<Settings>();
  protected readonly weekdays = days;
  protected readonly advanced = signal(false);
  protected readonly preset = linkedSignal<string>(() =>
    recurrencePreset(this.value().repeatRule),
  );
  protected readonly raw = linkedSignal(() => this.value().repeatRule ?? '');
  protected readonly frequency = linkedSignal(
    () =>
      this.value().repeatRule?.match(
        /FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/,
      )?.[1] ?? 'DAILY',
  );
  protected readonly interval = linkedSignal(
    () => +(this.value().repeatRule?.match(/INTERVAL=(\d+)/)?.[1] ?? 1),
  );
  protected readonly selectedDays = linkedSignal<string[]>(
    () =>
      this.value()
        .repeatRule?.match(/BYDAY=([^;]+)/)?.[1]
        .split(',') ?? [],
  );
  protected readonly ending = linkedSignal<string>(() =>
    this.value().recurrenceEnd
      ? 'DATE'
      : /COUNT=/.test(this.value().repeatRule ?? '')
        ? 'COUNT'
        : 'NEVER',
  );
  protected readonly until = linkedSignal(
    () => this.value().recurrenceEnd ?? '',
  );
  protected readonly count = linkedSignal(
    () => +(this.value().repeatRule?.match(/COUNT=(\d+)/)?.[1] ?? 10),
  );
  protected readonly repeatFrom = linkedSignal<string>(
    () => this.value().repeatFrom ?? 'SCHEDULE',
  );
  protected readonly zone = linkedSignal(
    () => this.value().recurrenceTimezone ?? 'Asia/Tehran',
  );
  protected readonly duration = linkedSignal(
    () => this.value().durationMin ?? null,
  );
  protected readonly endTouched = signal(false);
  private readonly rule = computed(() => {
    const p = this.preset();
    if (p === 'NONE') return null;
    if (p === 'CUSTOM' && this.raw().trim()) {
      let rule = this.raw().trim();
      if (this.endTouched() || this.ending() === 'COUNT')
        rule = rule.replace(/;COUNT=[^;]+|;UNTIL=[^;]+/g, '');
      if (this.ending() === 'COUNT') rule += ';COUNT=' + this.count();
      return rule;
    }
    const freq =
      p === 'WORKDAYS' ? 'WEEKLY' : p === 'CUSTOM' ? this.frequency() : p;
    let rule = 'RRULE:FREQ=' + freq;
    if (p === 'CUSTOM') rule += ';INTERVAL=' + this.interval();
    if (p === 'WORKDAYS') rule += ';BYDAY=SA,SU,MO,TU,WE';
    else if (freq === 'WEEKLY' && this.selectedDays().length)
      rule += ';BYDAY=' + this.selectedDays().join(',');
    if (this.ending() === 'COUNT') rule += ';COUNT=' + this.count();
    return rule;
  });
  protected readonly error = computed(() => {
    if (this.rule() && !isRepeatRule(this.rule()!))
      return 'قانون تکرار معتبر نیست.';
    if (this.rule() && !validTimeZone(this.zone()))
      return 'منطقه زمانی معتبر نیست.';
    if (
      this.rule() &&
      this.ending() === 'DATE' &&
      !/^\d{4}-\d{2}-\d{2}$/.test(this.until())
    )
      return 'تاریخ پایان را انتخاب کن.';
    if (
      this.duration() !== null &&
      (!Number.isInteger(this.duration()) ||
        this.duration()! < 1 ||
        this.duration()! > 10080)
    )
      return 'مدت کار معتبر نیست.';
    return '';
  });
  protected toggleDay(day: string, on: boolean) {
    this.selectedDays.update((v) =>
      on ? [...new Set([...v, day])] : v.filter((d) => d !== day),
    );
    this.raw.set('');
  }
  protected apply() {
    if (this.error()) return;
    this.changed.emit({
      repeatRule: this.rule(),
      repeatFrom: this.repeatFrom() as 'SCHEDULE' | 'COMPLETION',
      recurrenceEnd: this.ending() === 'DATE' ? this.until() : null,
      recurrenceTimezone: this.zone(),
      durationMin: this.duration(),
    });
  }
}
