import { httpResource } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import {
  type Fast,
  FAST_EDIT_DAYS,
  FASTING_PROTOCOLS,
  type FastingState,
  fastHoursElapsed,
  fastingProtocolLabel,
  MAX_FAST_HOURS,
} from '@all-in-one/applets/health/contracts';
import {
  AioTranslate,
  AioButton,
  AioDateInput,
  AioConfirm,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioFieldDirectives,
  AioIcon,
  AioInput,
  AioProgressDirectives,
  AioSkeleton,
  AioToggleGroupDirectives,
  provideIcons,
  AioFormField,
  AioLocale,
  AioNotifications,
} from '@all-in-one/ui';
import { toIsoDate } from '@all-in-one/shared/schemas';
import { apiErrorMessage } from '@all-in-one/web/shared';
import {
  lucideHistory,
  lucidePencil,
  lucideTimer,
  lucideTrash2,
} from '@ng-icons/lucide';
import { chosenEnd, fastEndError } from './fasting-time';
import { HealthApi } from './health-api';
import {
  clockTime,
  duration,
  fromLocalInput,
  timer,
  toLocalInput,
} from './time-format';

const HOUR = 3_600_000;
const MINUTE = 60_000;

/** Intermittent fasting at a glance: how long the running fast has lasted, start and end. */
@Component({
  selector: 'health-fasting-card',
  host: { class: 'flex min-w-0' },
  imports: [
    AioButton,
    AioDateInput,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioFieldDirectives,
    AioIcon,
    AioInput,
    AioProgressDirectives,
    AioSkeleton,
    AioToggleGroupDirectives,
    AioFormField,
    AioTranslate,
  ],
  providers: [
    provideIcons({ lucideHistory, lucidePencil, lucideTimer, lucideTrash2 }),
  ],
  template: `
    <section
      class="health-metric health-body-card flex-1"
      aria-labelledby="fast-title"
    >
      <div class="flex items-center justify-between gap-2">
        <h2 id="fast-title" class="health-metric-label">
          {{
            (active()
              ? locale.text('در فستینگ، {0}', [
                  protocolLabel(active()!.targetHours),
                ])
              : 'فستینگ'
            ) | aioTranslate
          }}
        </h2>
        <span class="health-icon-disc text-[var(--health-orange)]"
          ><aio-icon name="lucideTimer" size="sm"
        /></span>
      </div>
      @if (state.isLoading() && !state.hasValue()) {
        <div
          aioSkeleton
          class="h-24 rounded-2xl"
          [attr.aria-label]="'در حال دریافت' | aioTranslate"
        ></div>
      } @else if (state.error()) {
        <p class="health-metric-label">
          {{ 'فستینگ دریافت نشد.' | aioTranslate }}
        </p>
        <button aioBtn variant="link" (click)="state.reload()">
          {{ 'تلاش دوباره' | aioTranslate }}
        </button>
      } @else if (active(); as fast) {
        <div class="flex flex-col gap-1">
          <p class="health-number" aria-live="off">
            <bdi dir="ltr">{{ timerLabel() }}</bdi>
          </p>
          <p class="health-metric-label">
            {{
              '{0} از شروع، ساعت {1}'
                | aioTranslate: [duration(elapsed()), clock(fast.startedAt)]
            }}
          </p>
        </div>
        <div
          aioProgress
          class="health-fast-progress"
          [value]="Math.min((elapsed() * 100) / fast.targetHours, 100)"
          [attr.aria-label]="
            'پیشرفت تا ' + fa(fast.targetHours) + ' ساعت' | aioTranslate
          "
        >
          <div aioProgressIndicator></div>
        </div>
        <p class="text-sm">
          @if (elapsed() >= fast.targetHours) {
            <strong>{{
              'به هدف {0} ساعته رسیدی.' | aioTranslate: [fa(fast.targetHours)]
            }}</strong>
            {{ 'هر وقت آماده بودی، فستینگ را تمام کن.' | aioTranslate }}
          } @else {
            {{
              '{0} مانده؛ پایان ساعت {1}'
                | aioTranslate
                  : [duration(fast.targetHours - elapsed()), endClock()]
            }}
          }
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            aioBtn
            class="health-primary-action flex-1"
            [disabled]="busy()"
            (click)="openEnd()"
          >
            {{ 'پایان فستینگ' | aioTranslate }}
          </button>
          <button
            aioBtn
            variant="ghost"
            class="health-soft-action"
            (click)="openEdit(fast)"
          >
            {{ 'ویرایش' | aioTranslate }}
          </button>
        </div>
      } @else {
        <div class="flex flex-col gap-1">
          @if (last(); as fast) {
            <p class="health-small-number">
              {{ duration(hours(fast)) }}
            </p>
            <p class="health-metric-label">
              {{
                'آخرین فستینگ، {0}{1}'
                  | aioTranslate
                    : [
                        dayLabel(fast.endedAt!),
                        hours(fast) >= fast.targetHours ? '، کامل' : '',
                      ]
              }}
            </p>
          } @else {
            <p class="text-lg font-semibold">
              {{ 'آماده‌ی یک فستینگ؟' | aioTranslate }}
            </p>
            <p class="health-metric-label">
              {{
                'شروعش را ثبت کن تا ببینی چند ساعت است که چیزی نخورده‌ای.'
                  | aioTranslate
              }}
            </p>
          }
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            aioBtn
            class="health-primary-action flex-1"
            (click)="openStart()"
          >
            {{ 'شروع فستینگ' | aioTranslate }}
          </button>
          @if (state.value()?.recent?.length) {
            <button
              aioBtn
              variant="ghost"
              size="icon"
              class="health-soft-action size-11"
              [attr.aria-label]="'سابقه فستینگ' | aioTranslate"
              (click)="historyOpen.set(true)"
            >
              <aio-icon name="lucideHistory" size="sm" />
            </button>
          }
        </div>
      }
    </section>

    <aio-dialog
      [open]="sheet() === 'start' || sheet() === 'edit'"
      (openChange)="$event || sheet.set(null)"
      [title]="
        (sheet() === 'edit' ? 'ویرایش فستینگ' : 'شروع فستینگ') | aioTranslate
      "
      [description]="
        'ساعت‌ها بدون غذا؛ آب، چای و قهوه‌ی بدون شکر مجاز است.' | aioTranslate
      "
      contentClass="applet-health health-calm"
    >
      <ng-template aioDialogBody>
        <form
          id="fast-form"
          class="flex flex-col gap-5"
          (submit)="$event.preventDefault(); save()"
        >
          <div aioField>
            <span aioFieldLabel id="fast-hours-label">{{
              'مدت فستینگ' | aioTranslate
            }}</span>
            <div
              aioToggleGroup
              type="single"
              variant="outline"
              class="flex-wrap"
              aria-labelledby="fast-hours-label"
              [value]="'' + targetHours()"
              (valueChange)="pickHours($event)"
            >
              @for (h of protocols; track h) {
                <button
                  aioToggleGroupItem
                  type="button"
                  [value]="'' + h"
                  class="min-w-[4.5rem] flex-1 tabular-nums"
                >
                  {{ protocolLabel(h) | aioTranslate }}
                </button>
              }
            </div>
            <label aioFieldLabel for="fast-hours" class="mt-2">{{
              'یا تعداد ساعت دلخواه' | aioTranslate
            }}</label>
            <input
              aioInput
              id="fast-hours"
              type="number"
              inputmode="numeric"
              min="1"
              [max]="maxHours"
              [value]="targetHours()"
              (input)="typeHours($any($event.target).value)"
            />
            <p aioFieldDescription>
              {{
                '{0}: {1} ساعت فستینگ{2}.'
                  | aioTranslate
                    : [
                        protocolLabel(targetHours()),
                        fa(targetHours()),
                        targetHours() < 24
                          ? '، ' + fa(24 - targetHours()) + ' ساعت پنجره‌ی غذا'
                          : '',
                      ]
              }}
            </p>
          </div>
          <div class="flex flex-col gap-2">
            <div class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <aio-form-field
                [label]="'تاریخ شروع' | aioTranslate"
                controlId="fast-start"
              >
                <aio-date-input
                  contentClass="applet-health"
                  class="min-w-0 max-w-full"
                  inputId="fast-start"
                  [minDate]="minStart().slice(0, 10)"
                  [maxDate]="nowInput().slice(0, 10)"
                  [value]="startInput().slice(0, 10)"
                  (valueChange)="setStartDate($event)"
                />
              </aio-form-field>
              <aio-form-field
                [label]="'ساعت شروع' | aioTranslate"
                controlId="fast-start-time"
              >
                <input
                  aioInput
                  id="fast-start-time"
                  class="w-full min-w-0 max-w-full appearance-none"
                  dir="ltr"
                  lang="fa-IR"
                  type="time"
                  [value]="startInput().slice(11, 16)"
                  (change)="setStartTime($any($event.target).value)"
                  [attr.aria-invalid]="!!startError()"
                  aria-describedby="fast-start-hint"
                />
              </aio-form-field>
              @if (editingFinished()) {
                <aio-form-field
                  [label]="'تاریخ پایان' | aioTranslate"
                  controlId="fast-edit-end"
                >
                  <aio-date-input
                    contentClass="applet-health"
                    class="min-w-0 max-w-full"
                    inputId="fast-edit-end"
                    [minDate]="startInput().slice(0, 10)"
                    [maxDate]="nowInput().slice(0, 10)"
                    [value]="endInput().slice(0, 10)"
                    (valueChange)="setEndDate($event)"
                  />
                </aio-form-field>
                <aio-form-field
                  [label]="'ساعت پایان' | aioTranslate"
                  controlId="fast-edit-end-time"
                >
                  <input
                    aioInput
                    id="fast-edit-end-time"
                    class="w-full min-w-0 max-w-full appearance-none"
                    dir="ltr"
                    lang="fa-IR"
                    type="time"
                    [value]="endInput().slice(11, 16)"
                    (change)="setEndTime($any($event.target).value)"
                    [attr.aria-invalid]="!!endError()"
                    aria-describedby="fast-start-hint"
                  />
                </aio-form-field>
              }
            </div>
            <p
              aioFieldDescription
              id="fast-start-hint"
              [class.text-destructive]="!!sheetError()"
            >
              {{ sheetError() ?? sheetHint() | aioTranslate }}
            </p>
          </div>
        </form>
      </ng-template>
      <ng-template aioDialogActions>
        @if (sheet() === 'edit') {
          <button
            aioBtn
            variant="ghost"
            class="text-destructive"
            [disabled]="busy()"
            (click)="removeActive()"
          >
            {{ 'حذف' | aioTranslate }}
          </button>
        }
        <button aioBtn variant="outline" (click)="sheet.set(null)">
          {{ 'انصراف' | aioTranslate }}
        </button>
        <button
          aioBtn
          type="submit"
          form="fast-form"
          class="health-primary-action"
          [disabled]="busy()"
        >
          {{ (sheet() === 'edit' ? 'ذخیره' : 'شروع') | aioTranslate }}
        </button>
      </ng-template>
    </aio-dialog>

    <aio-dialog
      [open]="sheet() === 'end'"
      (openChange)="$event || sheet.set(null)"
      [title]="'پایان فستینگ' | aioTranslate"
      [description]="
        'اگر زودتر تمام کردی، زمان پایان را تغییر بده.' | aioTranslate
      "
      contentClass="applet-health health-calm"
    >
      <ng-template aioDialogBody>
        <form
          id="fast-end-form"
          class="flex flex-col gap-5"
          (submit)="$event.preventDefault(); saveEnd()"
        >
          @if (active(); as fast) {
            <p class="health-metric-label">
              {{
                'از {0}، ساعت {1}'
                  | aioTranslate
                    : [dayLabel(fast.startedAt), clock(fast.startedAt)]
              }}
            </p>
          }
          <div class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <aio-form-field
              [label]="'تاریخ پایان' | aioTranslate"
              controlId="fast-end"
            >
              <aio-date-input
                contentClass="applet-health"
                class="min-w-0 max-w-full"
                inputId="fast-end"
                [minDate]="endMinDate()"
                [maxDate]="nowInput().slice(0, 10)"
                [value]="endInput().slice(0, 10)"
                (valueChange)="setEndDate($event)"
              />
            </aio-form-field>
            <aio-form-field
              [label]="'ساعت پایان' | aioTranslate"
              controlId="fast-end-time"
            >
              <input
                aioInput
                id="fast-end-time"
                class="w-full min-w-0 max-w-full appearance-none"
                dir="ltr"
                lang="fa-IR"
                type="time"
                [value]="endInput().slice(11, 16)"
                (change)="setEndTime($any($event.target).value)"
                [attr.aria-invalid]="!!endError()"
                aria-describedby="fast-end-hint"
              />
            </aio-form-field>
          </div>
          <p
            id="fast-end-hint"
            class="text-sm tabular-nums"
            [class.text-destructive]="!!endError()"
          >
            {{
              endError() ?? 'مدت فستینگ: {0}'
                | aioTranslate: [duration(endHours())]
            }}
          </p>
        </form>
      </ng-template>
      <ng-template aioDialogActions>
        <button aioBtn variant="outline" (click)="sheet.set(null)">
          {{ 'انصراف' | aioTranslate }}
        </button>
        <button
          aioBtn
          type="submit"
          form="fast-end-form"
          class="health-primary-action"
          [disabled]="busy()"
        >
          {{ 'ثبت پایان' | aioTranslate }}
        </button>
      </ng-template>
    </aio-dialog>

    <aio-dialog
      [(open)]="historyOpen"
      [title]="'سابقه فستینگ' | aioTranslate"
      contentClass="applet-health health-calm"
    >
      <ng-template aioDialogBody>
        <ul class="flex flex-col">
          @for (fast of state.value()?.recent ?? []; track fast.id) {
            <li
              class="flex items-center gap-3 border-b border-border py-3 last:border-0"
            >
              <div class="flex min-w-0 flex-1 flex-col">
                <strong class="text-sm tabular-nums"
                  >{{ duration(hours(fast)) | aioTranslate }}&#32;<span
                    class="font-normal text-muted-foreground"
                    >{{
                      'از {0} ساعت' | aioTranslate: [fa(fast.targetHours)]
                    }}</span
                  ></strong
                >
                <span class="health-metric-label">{{
                  '{0}، ساعت {1} تا {2}'
                    | aioTranslate
                      : [
                          dayLabel(fast.startedAt),
                          clock(fast.startedAt),
                          clock(fast.endedAt!),
                        ]
                }}</span>
              </div>
              <button
                aioBtn
                variant="ghost"
                size="icon"
                class="size-11 shrink-0"
                [attr.aria-label]="
                  'ویرایش فستینگ {0}' | aioTranslate: [dayLabel(fast.startedAt)]
                "
                (click)="openEdit(fast)"
              >
                <aio-icon name="lucidePencil" size="sm" />
              </button>
              <button
                aioBtn
                variant="ghost"
                size="icon"
                class="size-11 shrink-0"
                [attr.aria-label]="
                  'حذف فستینگ {0}' | aioTranslate: [dayLabel(fast.startedAt)]
                "
                (click)="remove(fast)"
              >
                <aio-icon name="lucideTrash2" size="sm" />
              </button>
            </li>
          }
        </ul>
      </ng-template>
    </aio-dialog>
  `,
})
export class FastingCard {
  protected readonly locale = inject(AioLocale);

  private readonly notifications = inject(AioNotifications);

  private readonly api = inject(HealthApi);
  private readonly confirm = inject(AioConfirm);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly Math = Math;
  protected readonly protocols = FASTING_PROTOCOLS;
  protected readonly maxHours = MAX_FAST_HOURS;
  protected readonly protocolLabel = (hours: number) =>
    this.locale.text(fastingProtocolLabel(hours));
  protected readonly duration = (hours: number) =>
    duration(hours, this.locale.language());
  protected readonly clock = (iso: string) =>
    clockTime(iso, this.locale.language());
  protected readonly fa = (n: number) => this.locale.number(n);
  protected readonly dayLabel = (iso: string) =>
    this.locale.date(toIsoDate(new Date(iso)), {
      day: 'numeric',
      month: 'long',
    });

  protected readonly state = httpResource<FastingState>(
    () => `${this.api.base}/fasting`,
  );
  /** Ticks so the running timer stays current. */
  private readonly now = signal(Date.now());
  protected readonly busy = signal(false);
  protected readonly sheet = signal<'start' | 'edit' | 'end' | null>(null);
  protected readonly historyOpen = signal(false);
  protected readonly targetHours = signal(16);
  protected readonly startInput = signal('');
  protected readonly endInput = signal('');
  private readonly editingFast = signal<Fast | null>(null);
  /** The start and end as the edit sheet opened, to send them only when changed. */
  private originalStart = '';
  private originalEnd = '';
  /** The end the sheet opened with; untouched means "the server's now". */
  private endDefault = '';

  protected readonly active = computed(
    () => this.state.value()?.active ?? null,
  );
  protected readonly last = computed(
    () => this.state.value()?.recent[0] ?? null,
  );
  protected readonly elapsed = computed(() => {
    const fast = this.active();
    return fast ? fastHoursElapsed(fast, new Date(this.now())) : 0;
  });
  protected readonly timerLabel = computed(() =>
    timer(this.elapsed(), this.locale.language()),
  );
  protected readonly endClock = computed(() => {
    const fast = this.active();
    return fast
      ? this.clock(
          new Date(
            Date.parse(fast.startedAt) + fast.targetHours * HOUR,
          ).toISOString(),
        )
      : '';
  });
  protected readonly nowInput = computed(() =>
    toLocalInput(new Date(this.now())),
  );
  protected readonly editingFinished = computed(
    () => this.sheet() === 'edit' && !!this.editingFast()?.endedAt,
  );
  protected readonly minStart = computed(() => {
    const days = this.editingFinished() ? FAST_EDIT_DAYS : MAX_FAST_HOURS / 24;
    return toLocalInput(new Date(this.now() - days * 24 * HOUR));
  });
  protected readonly endMinDate = computed(() => {
    const start = this.endStartIso();
    return start ? toLocalInput(new Date(start)).slice(0, 10) : '';
  });
  /** The start an end time is measured from: the running fast, or the edited start. */
  private readonly endStartIso = computed(() => {
    const sheet = this.sheet();
    const fast = sheet === 'end' ? this.active() : this.editingFast();
    if (!fast) return null;
    if (sheet === 'edit') {
      const at = fromLocalInput(this.startInput());
      return at ? at.toISOString() : fast.startedAt;
    }
    return fast.startedAt;
  });
  protected readonly startError = computed(() => {
    const at = fromLocalInput(this.startInput());
    if (!at) return null;
    const time = at.getTime();
    const now = this.now();
    if (time > now + MINUTE) return 'شروع نمی‌تواند در آینده باشد.';
    const finished = this.editingFinished();
    // An untouched start of a finished fast may be older than the edit window;
    // the server keeps it when only the end or target changes.
    const changed = !finished || this.startInput() !== this.originalStart;
    const limit = (finished ? FAST_EDIT_DAYS * 24 : MAX_FAST_HOURS) * HOUR;
    if (changed && now - time > limit)
      return finished
        ? 'فقط فستینگ‌های ۹۰ روز اخیر ویرایش می‌شوند.'
        : 'حداکثر ۷۲ ساعت قبل را می‌شود انتخاب کرد.';
    const end = fromLocalInput(this.endInput());
    if (finished && end && end.getTime() <= time)
      return 'پایان باید بعد از شروع باشد.';
    return null;
  });
  protected readonly endError = computed(() => {
    const start = this.endStartIso();
    return start ? fastEndError(start, this.endInput(), this.now()) : null;
  });
  protected readonly sheetError = computed(
    () => this.startError() ?? this.endError(),
  );
  protected readonly sheetHint = computed(() => {
    if (this.sheet() !== 'edit')
      return 'اگر همین الان شروع می‌کنی، دست نزن؛ حداکثر ۷۲ ساعت قبل.';
    return this.editingFinished()
      ? 'شروع و پایان را می‌توانی تغییر بدهی؛ فقط فستینگ‌های ۹۰ روز اخیر.'
      : 'شروع را می‌توانی تا ۷۲ ساعت قبل تغییر بدهی.';
  });
  protected readonly endHours = computed(() => {
    const start = this.endStartIso();
    const at = fromLocalInput(this.endInput());
    if (!start || !at) return 0;
    return Math.max(0, (at.getTime() - Date.parse(start)) / HOUR);
  });

  constructor() {
    afterNextRender(() => {
      const id = setInterval(() => this.now.set(Date.now()), 15_000);
      this.destroyRef.onDestroy(() => clearInterval(id));
    });
  }

  protected hours(fast: Fast) {
    return fastHoursElapsed(fast, new Date(this.now()));
  }

  protected pickHours(value: unknown) {
    const n = Number(value);
    if (n) this.targetHours.set(n);
  }

  protected typeHours(value: string) {
    const n = Math.round(Number(value));
    if (n >= 1 && n <= MAX_FAST_HOURS) this.targetHours.set(n);
  }

  protected setStartDate(day: string) {
    this.startInput.update((value) => day + value.slice(10));
  }

  protected setStartTime(time: string) {
    this.startInput.update((value) => value.slice(0, 11) + time);
  }

  protected setEndDate(day: string) {
    this.endInput.update((value) => day + value.slice(10));
  }

  protected setEndTime(time: string) {
    this.endInput.update((value) => value.slice(0, 11) + time);
  }

  protected openStart() {
    this.editingFast.set(null);
    this.targetHours.set(this.last()?.targetHours ?? 16);
    this.now.set(Date.now());
    this.startInput.set(toLocalInput(new Date()));
    this.originalStart = '';
    this.originalEnd = '';
    this.endInput.set('');
    this.sheet.set('start');
  }

  protected openEdit(fast: Fast) {
    this.historyOpen.set(false);
    this.editingFast.set(fast);
    this.targetHours.set(fast.targetHours);
    this.now.set(Date.now());
    this.originalStart = toLocalInput(new Date(fast.startedAt));
    this.startInput.set(this.originalStart);
    this.originalEnd = fast.endedAt ? toLocalInput(new Date(fast.endedAt)) : '';
    this.endInput.set(this.originalEnd);
    this.sheet.set('edit');
  }

  protected openEnd() {
    this.now.set(Date.now());
    this.endDefault = toLocalInput(new Date());
    this.endInput.set(this.endDefault);
    this.sheet.set('end');
  }

  protected async save() {
    if (this.sheetError()) return;
    const at = fromLocalInput(this.startInput());
    // An untouched "now" (same minute) starts at the exact current time.
    const startedAt =
      at && Date.now() - at.getTime() > MINUTE ? at.toISOString() : undefined;
    const editedStart =
      at && this.startInput() !== this.originalStart
        ? at.toISOString()
        : undefined;
    const end = fromLocalInput(this.endInput());
    const editedEnd =
      this.editingFinished() && end && this.endInput() !== this.originalEnd
        ? end.toISOString()
        : undefined;
    const editing = this.editingFast();
    await this.run(async () => {
      const state = editing
        ? await this.api.updateFast(editing.id, {
            targetHours: this.targetHours(),
            startedAt: editedStart,
            endedAt: editedEnd,
          })
        : await this.api.startFast({
            targetHours: this.targetHours(),
            startedAt,
          });
      this.state.set(state);
      this.sheet.set(null);
      if (!editing)
        this.notifications.success(
          'فستینگ شروع شد',
          `${fastingProtocolLabel(this.targetHours())}؛ موفق باشی!`,
        );
    });
  }

  protected async saveEnd() {
    const fast = this.active();
    if (!fast || this.endError()) return;
    const endedAt =
      this.endInput() === this.endDefault
        ? undefined
        : chosenEnd(this.endInput(), Date.now());
    await this.run(async () => {
      const state = await this.api.endFast(endedAt ? { endedAt } : {});
      this.state.set(state);
      this.sheet.set(null);
      const done = state.recent.find((f) => f.id === fast.id);
      const lasted = done ? this.duration(this.hours(done)) : '';
      this.notifications.action(`فستینگ تمام شد: ${lasted}`, 'برگرداندن', () =>
        this.reopen(fast.id),
      );
    });
  }

  private async reopen(id: string) {
    await this.run(async () =>
      this.state.set(await this.api.updateFast(id, { endedAt: null })),
    );
  }

  protected async removeActive() {
    const fast = this.editingFast();
    if (!fast) return;
    const ok = await this.confirm.ask({
      title: 'این فستینگ حذف شود؟',
      description: 'زمان شروعش از سابقه پاک می‌شود.',
      confirmText: 'حذف',
      destructive: true,
    });
    if (!ok) return;
    await this.run(async () => {
      this.state.set(await this.api.removeFast(fast.id));
      this.sheet.set(null);
    });
  }

  protected async remove(fast: Fast) {
    const ok = await this.confirm.ask({
      title: 'این فستینگ حذف شود؟',
      confirmText: 'حذف',
      destructive: true,
    });
    if (!ok) return;
    await this.run(async () => {
      const state = await this.api.removeFast(fast.id);
      this.state.set(state);
      if (!state.recent.length) this.historyOpen.set(false);
    });
  }

  private async run(work: () => Promise<void>) {
    this.busy.set(true);
    try {
      await work();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
