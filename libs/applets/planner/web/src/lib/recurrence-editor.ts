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
  template: ` <div class="bg-muted/40 flex flex-col gap-3 rounded-2xl p-4">
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
    @if (preset() !== 'NONE') {
      @if (preset() === 'CUSTOM') {
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
        <label aioFieldLabel [for]="prefix() + 'interval'">هر چند واحد؟</label>
        <input
          aioInput
          type="number"
          min="1"
          max="10000"
          [id]="prefix() + 'interval'"
          [value]="interval()"
          (input)="interval.set(+$any($event.target).value); raw.set('')"
        />
      }
      @if (
        preset() === 'WEEKLY' ||
        (preset() === 'CUSTOM' && frequency() === 'WEEKLY')
      ) {
        <span class="text-sm">روزهای هفته (انتخاب خالی: روز تاریخ شروع)</span>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          @for (d of weekdays; track d[0]) {
            <label
              [for]="prefix() + 'day-' + d[0]"
              class="flex min-h-11 items-center gap-2"
              ><aio-checkbox
                [inputId]="prefix() + 'day-' + d[0]"
                [checked]="selectedDays().includes(d[0])"
                (checkedChange)="toggleDay(d[0], $event)"
                [aria-label]="d[1]"
              />{{ d[1] }}</label
            >
          }
        </div>
      }
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
      <label aioFieldLabel [for]="prefix() + 'zone'">منطقه زمانی برنامه</label>
      <input
        aioInput
        dir="ltr"
        [id]="prefix() + 'zone'"
        [value]="zone()"
        (input)="zone.set($any($event.target).value)"
      />
      <p class="text-muted-foreground text-xs">
        تاریخ و ساعت شروع سری در این منطقه است؛ نمایش روزانه با زمان تهران
        هماهنگ می‌شود.
      </p>
      @if (preset() === 'CUSTOM') {
        <label aioFieldLabel [for]="prefix() + 'rule'"
          >قانون پیشرفته RRULE (اختیاری)</label
        >
        <input
          aioInput
          dir="ltr"
          [id]="prefix() + 'rule'"
          [value]="raw()"
          (input)="raw.set($any($event.target).value)"
          placeholder="RRULE:FREQ=MONTHLY;BYDAY=-1FR"
        />
      }
    }
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
    @if (error()) {
      <p role="alert" class="text-destructive text-sm">{{ error() }}</p>
    }
    <button
      aioBtn
      type="button"
      variant="outline"
      [disabled]="!!error()"
      (click)="apply()"
    >
      ثبت تنظیمات تکرار
    </button>
  </div>`,
})
export class RecurrenceEditor {
  readonly value = input<Settings>({});
  readonly prefix = input('repeat-');
  readonly changed = output<Settings>();
  protected readonly weekdays = days;
  protected readonly preset = linkedSignal<string>(() =>
    this.value().repeatRule ? 'CUSTOM' : 'NONE',
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
