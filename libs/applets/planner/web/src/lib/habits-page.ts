import { httpResource } from '@angular/common/http';
import {
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import {
  addDays,
  type CreateHabitInput,
  type HabitSection,
  habitDueOn,
  type PlannerColor,
  type PlannerHabit,
  toIsoDate,
} from '@all-in-one/applets/planner/contracts';
import {
  AioButton,
  AioConfirm,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioEmptyDirectives,
  AioFieldDirectives,
  AioIcon,
  AioInput,
  AioNativeSelect,
  AioNativeSelectDirectives,
  AioSkeleton,
  aioToast,
  AioToggleGroupDirectives,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage, faDate, faNumber } from '@all-in-one/web/shared';
import {
  lucideApple,
  lucideBedDouble,
  lucideBike,
  lucideBookOpen,
  lucideBrain,
  lucideCheck,
  lucideDumbbell,
  lucideFlame,
  lucideFootprints,
  lucideGlassWater,
  lucideLanguages,
  lucideMinus,
  lucidePencil,
  lucidePill,
  lucidePlus,
  lucideSparkles,
  lucideSunrise,
} from '@ng-icons/lucide';
import { ColorPicker } from './color-picker';
import { TONE } from './colors';
import { PlannerApi } from './planner-api';

const HABIT_ICONS = {
  lucideSparkles,
  lucideGlassWater,
  lucideBookOpen,
  lucideDumbbell,
  lucideFootprints,
  lucideBike,
  lucideApple,
  lucideBrain,
  lucidePill,
  lucideBedDouble,
  lucideSunrise,
  lucideLanguages,
};
const ICON_NAMES = Object.keys(HABIT_ICONS);

/** Saturday-first week, as in Iran; values are JS weekdays (0 = Sunday). */
const WEEK = [
  { day: 6, label: 'ش' },
  { day: 0, label: 'ی' },
  { day: 1, label: 'د' },
  { day: 2, label: 'س' },
  { day: 3, label: 'چ' },
  { day: 4, label: 'پ' },
  { day: 5, label: 'ج' },
];

interface Draft {
  id?: string;
  name: string;
  icon: string;
  color: PlannerColor;
  goal: number;
  unit: string;
  weekdays: number[];
  sectionId: string;
  newSection: string;
  reminders: string[];
  reminderMetadata: string[];
}

const emptyDraft = (): Draft => ({
  name: '',
  icon: 'lucideSparkles',
  color: 'sage',
  goal: 1,
  unit: '',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  sectionId: '',
  newSection: '',
  reminders: [],
  reminderMetadata: [],
});

/** TickTick habits: a week strip, check-ins in one tap, streak flames, sections. */
@Component({
  selector: 'planner-habits-page',
  imports: [
    AioButton,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioEmptyDirectives,
    AioFieldDirectives,
    AioIcon,
    AioInput,
    AioNativeSelect,
    AioNativeSelectDirectives,
    AioSkeleton,
    AioToggleGroupDirectives,
    ColorPicker,
  ],
  providers: [
    provideIcons({
      ...HABIT_ICONS,
      lucideCheck,
      lucideFlame,
      lucideMinus,
      lucidePencil,
      lucidePlus,
    }),
  ],
  host: { class: 'flex flex-col gap-5' },
  template: `
    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">عادت‌ها</h1>
        <p class="text-muted-foreground text-sm">{{ summary() }}</p>
      </div>
      <button aioBtn (click)="openNew()">
        <aio-icon name="lucidePlus" size="sm" />
        عادت تازه
      </button>
    </header>

    <div
      class="glass grid grid-cols-7 gap-1 rounded-2xl p-1"
      role="radiogroup"
      aria-label="روز"
    >
      @for (d of days; track d) {
        <button
          type="button"
          role="radio"
          class="flex h-14 flex-col items-center justify-center rounded-xl text-xs"
          [class]="
            d === day()
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted/60'
          "
          [attr.aria-checked]="d === day()"
          [attr.aria-label]="dateLabel(d)"
          (click)="day.set(d)"
        >
          <span>{{ weekdayLetter(d) }}</span>
          <span class="text-base font-semibold">{{ dayNumber(d) }}</span>
        </button>
      }
    </div>

    @if (res.isLoading() && !res.hasValue()) {
      <div aioSkeleton class="h-20 rounded-2xl"></div>
      <div aioSkeleton class="h-20 rounded-2xl"></div>
    } @else {
      @for (group of groups(); track group.key) {
        <section class="flex flex-col gap-2" [attr.aria-label]="group.label">
          @if (group.label) {
            <h2 class="text-muted-foreground px-1 text-sm font-semibold">
              {{ group.label }}
            </h2>
          }
          @for (h of group.habits; track h.id) {
            @let v = value(h);
            @let due = isDue(h);
            <article
              class="glass flex items-center gap-3 rounded-2xl p-3"
              [class.opacity-60]="!due"
            >
              <span
                [class]="
                  'grid size-12 shrink-0 place-items-center rounded-2xl ' +
                  tone(h).soft +
                  ' ' +
                  tone(h).text
                "
              >
                <aio-icon [name]="h.icon" />
              </span>
              <button
                type="button"
                class="flex min-w-0 flex-1 flex-col items-start text-start"
                (click)="openEdit(h)"
              >
                <span class="line-clamp-2 w-full font-semibold wrap-anywhere">
                  <bdi dir="auto">{{ h.name }}</bdi>
                </span>
                <span
                  dir="rtl"
                  class="text-muted-foreground flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-relaxed"
                >
                  <span
                    class="inline-flex min-w-0 flex-wrap items-baseline gap-x-1"
                  >
                    @if (!due) {
                      امروز لازم نیست
                    } @else if (h.goal > 1) {
                      <span class="whitespace-nowrap"
                        >{{ fa(v) }} از {{ fa(h.goal) }}</span
                      >
                      @if (h.unit) {
                        <bdi dir="auto" class="wrap-anywhere">{{ h.unit }}</bdi>
                      }
                    } @else {
                      {{ v >= 1 ? 'انجام شد' : 'هنوز نه' }}
                    }
                  </span>
                  @if (h.streak) {
                    <span
                      class="inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <aio-icon
                        name="lucideFlame"
                        size="xs"
                        class="text-[var(--streak)]"
                      />
                      <span>{{ fa(h.streak) }} روز پیاپی</span>
                    </span>
                  }
                </span>
              </button>
              @if (h.goal > 1) {
                <button
                  aioBtn
                  variant="outline"
                  size="icon"
                  [disabled]="v === 0"
                  [attr.aria-label]="'یکی کمتر: ' + h.name"
                  (click)="set(h, v - 1)"
                >
                  <aio-icon name="lucideMinus" size="sm" />
                </button>
              }
              <button
                aioBtn
                size="icon"
                class="size-12 rounded-full"
                [variant]="v >= h.goal ? 'default' : 'outline'"
                [attr.aria-pressed]="v >= h.goal"
                [attr.aria-label]="
                  (h.goal > 1 ? 'یکی بیشتر: ' : 'انجام شد: ') + h.name
                "
                (click)="set(h, h.goal > 1 ? v + 1 : v >= 1 ? 0 : 1)"
              >
                <aio-icon
                  [name]="
                    h.goal > 1 && v < h.goal ? 'lucidePlus' : 'lucideCheck'
                  "
                />
              </button>
            </article>
          }
        </section>
      } @empty {
        <div aioEmpty class="glass rounded-2xl">
          <div aioEmptyHeader>
            <div aioEmptyMedia variant="icon" class="text-primary">
              <aio-icon name="lucideSparkles" />
            </div>
            <h2 aioEmptyTitle>هنوز عادتی نساخته‌ای</h2>
            <p aioEmptyDescription>
              آب خوردن، کتاب خواندن یا پیاده‌روی؛ هر روز یک تیک.
            </p>
          </div>
          <div aioEmptyContent>
            <button aioBtn (click)="openNew()">اولین عادت</button>
          </div>
        </div>
      }
    }

    <aio-dialog
      [(open)]="editing"
      [title]="draft().id ? 'ویرایش عادت' : 'عادت تازه'"
      contentClass="applet-planner sm:max-w-md"
    >
      <ng-template aioDialogBody>
        @let d = draft();
        <form
          id="habit-form"
          class="flex flex-col gap-4 pb-2"
          (submit)="$event.preventDefault(); save()"
        >
          <div aioField>
            <label aioFieldLabel for="habit-name">نام</label>
            <input
              aioInput
              id="habit-name"
              placeholder="مثلاً: آب خوردن"
              [value]="d.name"
              (input)="patch({ name: $any($event.target).value })"
            />
          </div>
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium">نماد</span>
            <div
              class="grid grid-cols-6 gap-1"
              role="radiogroup"
              aria-label="نماد"
            >
              @for (icon of icons; track icon) {
                <button
                  type="button"
                  role="radio"
                  class="grid h-11 place-items-center rounded-xl"
                  [class]="
                    d.icon === icon
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted/60'
                  "
                  [attr.aria-checked]="d.icon === icon"
                  [attr.aria-label]="icon.replace('lucide', '')"
                  (click)="patch({ icon })"
                >
                  <aio-icon [name]="icon" size="sm" />
                </button>
              }
            </div>
          </div>
          <planner-color-picker
            [value]="d.color"
            (valueChange)="patch({ color: $event })"
          />
          <div class="grid grid-cols-2 gap-3">
            <div aioField>
              <label aioFieldLabel for="habit-goal">هدف روزانه</label>
              <input
                aioInput
                id="habit-goal"
                type="number"
                min="1"
                max="100"
                inputmode="numeric"
                [value]="d.goal"
                (input)="patch({ goal: +$any($event.target).value || 1 })"
              />
            </div>
            <div aioField>
              <label aioFieldLabel for="habit-unit">واحد</label>
              <input
                aioInput
                id="habit-unit"
                placeholder="لیوان، صفحه…"
                [value]="d.unit"
                (input)="patch({ unit: $any($event.target).value })"
              />
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium">روزها</span>
            <div
              aioToggleGroup
              type="multiple"
              variant="outline"
              class="w-full"
              [value]="weekdayValues()"
              (valueChange)="setWeekdays($event)"
            >
              @for (w of week; track w.day) {
                <button
                  aioToggleGroupItem
                  [value]="'' + w.day"
                  class="h-11 flex-1"
                >
                  {{ w.label }}
                </button>
              }
            </div>
          </div>
          <div class="flex min-w-0 flex-col gap-3">
            <h3 class="text-sm font-medium">یادآوری‌ها</h3>
            <p class="text-muted-foreground text-xs" id="habit-reminder-help">
              ساعت‌ها به وقت تهران و برای روزهای انتخاب‌شده‌اند. بعد از رسیدن به
              هدف روزانه، یادآوری‌های همان روز متوقف می‌شوند.
            </p>
            @for (time of d.reminders; track $index; let i = $index) {
              <div
                class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3"
              >
                <div aioField class="min-w-0 gap-2">
                  <label aioFieldLabel [for]="'habit-reminder-' + i"
                    >ساعت یادآوری {{ fa(i + 1) }}</label
                  >
                  <input
                    aioInput
                    type="time"
                    required
                    class="w-full min-w-0 max-w-full appearance-none"
                    [id]="'habit-reminder-' + i"
                    [value]="time"
                    aria-describedby="habit-reminder-help"
                    (input)="setReminder(i, $any($event.target).value)"
                  />
                </div>
                <button
                  aioBtn
                  type="button"
                  variant="outline"
                  class="h-11 min-w-16 shrink-0 px-3"
                  [attr.aria-label]="'حذف یادآوری ' + fa(i + 1)"
                  (click)="removeReminder(i)"
                >
                  حذف
                </button>
              </div>
            } @empty {
              <p class="text-muted-foreground text-sm">یادآوری ندارد.</p>
            }
            <button
              aioBtn
              type="button"
              variant="outline"
              class="min-h-11 self-start"
              [disabled]="d.reminders.length + d.reminderMetadata.length >= 30"
              (click)="addReminder()"
            >
              افزودن ساعت یادآوری
            </button>
            <p class="text-muted-foreground text-xs">
              دریافت اعلان را از حساب کاربری، بخش اعلان‌ها فعال کن.
            </p>
          </div>
          <div aioField>
            <label aioFieldLabel for="habit-section">بخش</label>
            <aio-native-select
              selectId="habit-section"
              [value]="d.sectionId"
              (valueChange)="patch({ sectionId: $event })"
            >
              <option aioNativeSelectOption value="">بدون بخش</option>
              @for (s of sections(); track s.id) {
                <option aioNativeSelectOption [value]="s.id">
                  {{ s.name }}
                </option>
              }
              <option aioNativeSelectOption value="new">+ بخش تازه…</option>
            </aio-native-select>
            @if (d.sectionId === 'new') {
              <input
                aioInput
                placeholder="نام بخش، مثلاً «صبح»"
                aria-label="نام بخش تازه"
                [value]="d.newSection"
                (input)="patch({ newSection: $any($event.target).value })"
              />
            }
          </div>
          @if (d.id) {
            <div class="flex gap-2">
              <button
                aioBtn
                type="button"
                variant="outline"
                class="flex-1"
                (click)="archive()"
              >
                بایگانی
              </button>
              <button
                aioBtn
                type="button"
                variant="ghost"
                class="text-destructive flex-1"
                (click)="remove()"
              >
                حذف
              </button>
            </div>
          }
        </form>
      </ng-template>
      <ng-template aioDialogActions>
        <button aioBtn variant="outline" (click)="editing.set(false)">
          انصراف
        </button>
        <button aioBtn type="submit" form="habit-form" [disabled]="saving()">
          ذخیره
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class HabitsPage {
  private readonly api = inject(PlannerApi);
  private readonly confirm = inject(AioConfirm);

  protected readonly today = toIsoDate(new Date());
  private readonly weekStart = addDays(
    this.today,
    -((new Date(`${this.today}T12:00:00Z`).getUTCDay() + 1) % 7),
  );
  protected readonly days = Array.from({ length: 7 }, (_, i) =>
    addDays(this.weekStart, i),
  );
  protected readonly day = signal(this.today);
  protected readonly week = WEEK;
  protected readonly icons = ICON_NAMES;

  protected readonly res = httpResource<PlannerHabit[]>(
    () => `${this.api.base}/habits`,
  );
  private readonly sectionsRes = httpResource<HabitSection[]>(
    () => `${this.api.base}/habit-sections`,
  );
  protected readonly habits = linkedSignal(() =>
    this.res.hasValue() ? this.res.value() : [],
  );
  protected readonly sections = computed(() =>
    this.sectionsRes.hasValue() ? this.sectionsRes.value() : [],
  );

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly draft = signal<Draft>(emptyDraft());

  protected readonly groups = computed(() => {
    const habits = this.habits();
    const groups = [
      { key: 'none', label: '', habits: habits.filter((h) => !h.sectionId) },
    ];
    for (const s of this.sections())
      groups.push({
        key: s.id,
        label: s.name,
        habits: habits.filter((h) => h.sectionId === s.id),
      });
    return groups.filter((g) => g.habits.length);
  });

  protected readonly summary = computed(() => {
    const due = this.habits().filter((h) => this.isDue(h));
    const done = due.filter((h) => this.value(h) >= h.goal).length;
    if (!due.length) return 'برای این روز عادتی نیست';
    return `${faNumber(done)} از ${faNumber(due.length)} عادت انجام شده`;
  });

  protected readonly weekdayValues = computed(() =>
    this.draft().weekdays.map(String),
  );

  protected readonly fa = (n: number) => faNumber(n);
  protected readonly tone = (h: PlannerHabit) => TONE[h.color];

  protected isDue(h: PlannerHabit) {
    return habitDueOn(h, this.day());
  }

  protected value(h: PlannerHabit) {
    return h.checkins.find((c) => c.date === this.day())?.value ?? 0;
  }

  protected dateLabel(iso: string) {
    return faDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });
  }
  protected weekdayLetter(iso: string) {
    return (
      WEEK.find((w) => w.day === new Date(`${iso}T00:00:00Z`).getUTCDay())
        ?.label ?? ''
    );
  }
  protected dayNumber(iso: string) {
    return faDate(iso, { day: 'numeric' });
  }

  protected async set(h: PlannerHabit, value: number) {
    const day = this.day();
    const optimistic = {
      ...h,
      checkins: [
        ...h.checkins.filter((c) => c.date !== day),
        ...(value > 0 ? [{ date: day, value }] : []),
      ],
    };
    this.replace(optimistic);
    try {
      const saved = await this.api.checkin(h.id, { date: day, value });
      this.replace(saved);
      if (value === h.goal && day === this.today && saved.streak > 1)
        aioToast.success(`${faNumber(saved.streak)} روز پیاپی! 🔥`);
    } catch (error) {
      this.replace(h);
      aioToast.error(apiErrorMessage(error));
    }
  }

  private replace(h: PlannerHabit) {
    this.habits.update((list) => list.map((x) => (x.id === h.id ? h : x)));
  }

  protected openNew() {
    this.draft.set(emptyDraft());
    this.editing.set(true);
  }

  protected openEdit(h: PlannerHabit) {
    this.draft.set({
      id: h.id,
      name: h.name,
      icon: h.icon in HABIT_ICONS ? h.icon : 'lucideSparkles',
      color: h.color,
      goal: h.goal,
      unit: h.unit,
      weekdays: h.weekdays,
      sectionId: h.sectionId ?? '',
      newSection: '',
      reminders: h.reminders.filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)),
      reminderMetadata: h.reminders.filter(
        (t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t),
      ),
    });
    this.editing.set(true);
  }

  protected patch(change: Partial<Draft>) {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  protected setWeekdays(value: unknown) {
    if (Array.isArray(value) && value.length)
      this.patch({ weekdays: value.map(Number).sort() });
  }

  protected addReminder() {
    this.patch({ reminders: [...this.draft().reminders, '09:00'] });
  }
  protected setReminder(index: number, value: string) {
    this.patch({
      reminders: this.draft().reminders.map((time, i) =>
        i === index ? value : time,
      ),
    });
  }
  protected removeReminder(index: number) {
    this.patch({
      reminders: this.draft().reminders.filter((_, i) => i !== index),
    });
  }

  protected async save() {
    const d = this.draft();
    if (!d.name.trim()) {
      aioToast.error('نام عادت را بنویس.');
      return;
    }
    if (d.reminders.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
      aioToast.error('ساعت هر یادآوری را مشخص کن.');
      return;
    }
    if (new Set(d.reminders).size !== d.reminders.length) {
      aioToast.error('ساعت‌های یادآوری نباید تکراری باشند.');
      return;
    }
    this.saving.set(true);
    try {
      let sectionId: string | null = d.sectionId || null;
      if (sectionId === 'new') {
        sectionId = d.newSection.trim()
          ? (await this.createSection(d.newSection.trim())).id
          : null;
      }
      const input: CreateHabitInput = {
        name: d.name.trim(),
        icon: d.icon,
        color: d.color,
        goal: Math.min(100, Math.max(1, Math.round(d.goal))),
        unit: d.unit.trim(),
        weekdays: d.weekdays,
        reminders: [...d.reminders.sort(), ...d.reminderMetadata],
        sectionId,
      };
      if (d.id) this.replace(await this.api.updateHabit(d.id, input));
      else {
        const habit = await this.api.createHabit(input);
        this.habits.update((list) => [...list, habit]);
      }
      this.editing.set(false);
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private async createSection(name: string) {
    const section = await this.api.createHabitSection(name);
    this.sectionsRes.reload();
    return section;
  }

  protected async archive() {
    const id = this.draft().id;
    if (!id) return;
    try {
      await this.api.updateHabit(id, { archived: true });
      this.habits.update((list) => list.filter((h) => h.id !== id));
      this.editing.set(false);
      aioToast.success('بایگانی شد');
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

  protected async remove() {
    const id = this.draft().id;
    if (!id) return;
    this.editing.set(false);
    const ok = await this.confirm.ask({
      title: `«${this.draft().name}» حذف شود؟`,
      description: 'همه تیک‌های این عادت هم پاک می‌شوند.',
      confirmText: 'حذف',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.api.removeHabit(id);
      this.habits.update((list) => list.filter((h) => h.id !== id));
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }
}
