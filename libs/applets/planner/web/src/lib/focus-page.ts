import { httpResource } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  inject,
  Injectable,
  linkedSignal,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  addDays,
  type FocusKind,
  FOCUS_KIND_LABELS,
  type FocusSummary,
  type PlannerFocus,
  type PlannerTask,
  toIsoDate,
} from '@all-in-one/applets/planner/contracts';
import {
  AioButton,
  AioSkeleton,
  AioConfirm,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioIcon,
  AioTextarea,
  aioToast,
  AioToggleGroupDirectives,
  provideIcons,
  AioFormField,
  AioSectionHeading,
  AioSelectField,
} from '@all-in-one/ui';
import { apiErrorMessage, faDate, faNumber } from '@all-in-one/web/shared';
import {
  lucidePause,
  lucidePlay,
  lucideRotateCcw,
  lucideSquare,
  lucideTrash2,
} from '@ng-icons/lucide';
import { PlannerApi } from './planner-api';

const POMODORO_MINUTES = [15, 25, 45, 60];

/**
 * The running timer lives in a root service so switching tabs does not stop
 * it. Paused time is not counted: the saved record ends now and starts the
 * focused minutes earlier.
 */
@Injectable({ providedIn: 'root' })
export class FocusTimer {
  readonly kind = signal<FocusKind>('POMODORO');
  readonly minutes = signal(25);
  readonly taskId = signal('');
  readonly running = signal(false);
  /** Focused milliseconds before the current run. */
  readonly banked = signal(0);
  readonly runStart = signal(0);
  readonly now = signal(Date.now());
  private tick: ReturnType<typeof setInterval> | null = null;
  /** Called when a Pomodoro reaches zero. */
  onFinish: (() => void) | null = null;

  readonly elapsed = computed(
    () => this.banked() + (this.running() ? this.now() - this.runStart() : 0),
  );
  readonly remaining = computed(() =>
    Math.max(0, this.minutes() * 60_000 - this.elapsed()),
  );
  readonly started = computed(() => this.running() || this.banked() > 0);

  start() {
    if (this.running()) return;
    this.runStart.set(Date.now());
    this.now.set(Date.now());
    this.running.set(true);
    this.tick ??= setInterval(() => {
      this.now.set(Date.now());
      if (
        this.kind() === 'POMODORO' &&
        this.running() &&
        this.remaining() === 0
      ) {
        this.pause();
        this.onFinish?.();
      }
    }, 250);
  }

  pause() {
    if (!this.running()) return;
    this.banked.update((ms) => ms + Date.now() - this.runStart());
    this.running.set(false);
  }

  reset() {
    this.running.set(false);
    this.banked.set(0);
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
  }
}

/** TickTick focus: Pomodoro or stopwatch, linked to a task, with the record history. */
@Component({
  selector: 'planner-focus-page',
  imports: [
    AioButton,
    AioSkeleton,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioIcon,
    AioTextarea,
    AioToggleGroupDirectives,
    AioFormField,
    AioSectionHeading,
    AioSelectField,
  ],
  providers: [
    provideIcons({
      lucidePause,
      lucidePlay,
      lucideRotateCcw,
      lucideSquare,
      lucideTrash2,
    }),
  ],
  host: { class: 'flex flex-col gap-5' },
  template: `
    <header
      aioSectionHeading
      title="تمرکز"
      [description]="
        'امروز ' +
        fa(todayMin()) +
        ' دقیقه، این هفته ' +
        fa(weekMin()) +
        ' دقیقه'
      "
      [loading]="res.isLoading() && !res.hasValue()"
      [level]="1"
      titleClass="text-2xl font-bold"
      descriptionClass="text-muted-foreground min-h-6 text-sm"
      textClass="flex flex-col gap-1"
    ></header>

    <section class="glass flex flex-col items-center gap-5 rounded-3xl p-5">
      <div
        aioToggleGroup
        type="single"
        variant="outline"
        class="w-full"
        [value]="timer.kind()"
        (valueChange)="setKind($event)"
      >
        @for (k of kinds; track k) {
          <button
            aioToggleGroupItem
            [value]="k"
            class="h-11 flex-1"
            [disabled]="timer.started()"
          >
            {{ kindLabels[k] }}
          </button>
        }
      </div>

      <div class="relative grid size-60 place-items-center">
        <svg
          viewBox="0 0 120 120"
          class="absolute inset-0 -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke-width="8"
            class="stroke-muted"
          />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke-width="8"
            stroke-linecap="round"
            class="stroke-primary transition-[stroke-dashoffset] duration-300"
            [attr.stroke-dasharray]="circumference"
            [attr.stroke-dashoffset]="circumference * (1 - progress())"
          />
        </svg>
        <div class="flex flex-col items-center" role="timer" aria-live="off">
          <span class="text-5xl font-bold tabular-nums" dir="ltr">{{
            clock()
          }}</span>
          <span class="text-muted-foreground text-sm">{{ status() }}</span>
        </div>
      </div>

      @if (timer.kind() === 'POMODORO' && !timer.started()) {
        <div class="flex gap-2" role="radiogroup" aria-label="مدت">
          @for (m of lengths; track m) {
            <button
              aioBtn
              size="sm"
              role="radio"
              [attr.aria-checked]="timer.minutes() === m"
              [variant]="timer.minutes() === m ? 'default' : 'outline'"
              (click)="timer.minutes.set(m)"
            >
              {{ fa(m) }} دقیقه
            </button>
          }
        </div>
      }

      <aio-select-field
        label="روی چه کاری؟"
        controlId="focus-task"
        class="w-full"
        [value]="timer.taskId()"
        [options]="tasks()"
        valueKey="id"
        labelKey="title"
        emptyLabel="بدون کار مشخص"
        (valueChange)="timer.taskId.set($event)"
      />

      <div class="flex w-full gap-2">
        @if (timer.running()) {
          <button
            aioBtn
            size="lg"
            class="btn-3d flex-1"
            (click)="timer.pause()"
          >
            <aio-icon name="lucidePause" size="sm" /> مکث
          </button>
        } @else {
          <button
            aioBtn
            size="lg"
            class="btn-3d flex-1"
            (click)="timer.start()"
          >
            <aio-icon name="lucidePlay" size="sm" />
            {{ timer.started() ? 'ادامه' : 'شروع' }}
          </button>
        }
        @if (timer.started()) {
          <button aioBtn size="lg" variant="outline" (click)="finish()">
            <aio-icon name="lucideSquare" size="sm" /> پایان
          </button>
          <button
            aioBtn
            variant="ghost"
            size="icon-lg"
            aria-label="از نو"
            (click)="timer.reset()"
          >
            <aio-icon name="lucideRotateCcw" size="sm" />
          </button>
        }
      </div>
    </section>

    <section class="flex flex-col gap-2" aria-label="سابقه تمرکز">
      <h2 class="text-muted-foreground px-1 text-sm font-semibold">
        ۷ روز گذشته
      </h2>
      <ul class="glass divide-border/60 flex flex-col divide-y rounded-2xl">
        @if (res.isLoading() && !res.hasValue()) {
          @for (row of [1, 2, 3]; track row) {
            <li class="flex min-h-14 items-center px-4 py-2" aria-hidden="true">
              <span aioSkeleton class="h-6 w-full rounded-lg"></span>
            </li>
          }
        }
        @for (r of records(); track r.id) {
          <li>
            <button
              type="button"
              class="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-start"
              (click)="edit(r)"
            >
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate">{{
                  r.taskTitle ?? kindLabels[r.kind]
                }}</span>
                <span class="text-muted-foreground truncate text-xs">
                  {{ when(r) }}
                  @if (r.note) {
                    ، {{ r.note }}
                  }
                </span>
              </span>
              <span class="text-primary shrink-0 font-semibold"
                >{{ fa(r.durationMin) }} دقیقه</span
              >
            </button>
          </li>
        } @empty {
          @if (!res.isLoading()) {
            <li class="text-muted-foreground p-4 text-sm">
              هنوز جلسه تمرکزی ثبت نشده. یک پومودوروی ۲۵ دقیقه‌ای شروع کن!
            </li>
          }
        }
      </ul>
    </section>

    <aio-dialog
      [open]="!!editingRecord()"
      (openChange)="$event || editingRecord.set(null)"
      title="جلسه تمرکز"
      [description]="
        editingRecord()
          ? when(editingRecord()!) +
            '، ' +
            fa(editingRecord()!.durationMin) +
            ' دقیقه'
          : ''
      "
      contentClass="applet-planner sm:max-w-md"
    >
      <ng-template aioDialogBody>
        <div class="flex flex-col gap-4 pb-2">
          <aio-form-field label="یادداشت" controlId="focus-note">
            <textarea
              aioTextarea
              id="focus-note"
              rows="3"
              [value]="note()"
              (input)="note.set($any($event.target).value)"
            ></textarea>
          </aio-form-field>
          <p class="text-muted-foreground text-xs">
            مدت جلسه بعد از ثبت عوض نمی‌شود.
          </p>
        </div>
      </ng-template>
      <ng-template aioDialogActions>
        <button
          aioBtn
          variant="ghost"
          class="text-destructive"
          (click)="remove()"
        >
          <aio-icon name="lucideTrash2" size="sm" /> حذف
        </button>
        <button aioBtn (click)="saveNote()">ذخیره</button>
      </ng-template>
    </aio-dialog>
  `,
})
export class FocusPage {
  private readonly api = inject(PlannerApi);
  private readonly confirm = inject(AioConfirm);
  protected readonly timer = inject(FocusTimer);

  protected readonly kinds: FocusKind[] = ['POMODORO', 'STOPWATCH'];
  protected readonly kindLabels = FOCUS_KIND_LABELS;
  protected readonly lengths = POMODORO_MINUTES;
  protected readonly circumference = 2 * Math.PI * 54;
  private readonly today = toIsoDate(new Date());

  private readonly from = new Date(
    `${addDays(this.today, -6)}T00:00:00`,
  ).toISOString();
  private readonly res = httpResource<FocusSummary>(() =>
    this.api.url('/focus', {
      from: this.from,
      to: new Date(Date.now() + 60_000).toISOString(),
    }),
  );
  protected readonly records = linkedSignal(() =>
    this.res.hasValue() ? this.res.value().records : [],
  );
  private readonly tasksRes = httpResource<PlannerTask[]>(() =>
    this.api.url('/tasks', { status: 'open', limit: '200' }),
  );
  protected readonly tasks = computed(() =>
    (this.tasksRes.hasValue() ? this.tasksRes.value() : []).filter(
      (t) => t.kind === 'TASK',
    ),
  );

  protected readonly editingRecord = signal<PlannerFocus | null>(null);
  protected readonly note = signal('');

  protected readonly todayMin = computed(() =>
    this.records()
      .filter((r) => toIsoDate(new Date(r.startAt)) === this.today)
      .reduce((n, r) => n + r.durationMin, 0),
  );
  protected readonly weekMin = computed(() =>
    this.records().reduce((n, r) => n + r.durationMin, 0),
  );

  protected readonly progress = computed(() => {
    if (this.timer.kind() === 'STOPWATCH')
      return (this.timer.elapsed() % 3_600_000) / 3_600_000;
    return this.timer.elapsed() / (this.timer.minutes() * 60_000);
  });
  protected readonly clock = computed(() => {
    const ms =
      this.timer.kind() === 'POMODORO'
        ? this.timer.remaining()
        : this.timer.elapsed();
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return faDigits(h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
  });
  protected readonly status = computed(() =>
    this.timer.running()
      ? 'در حال تمرکز'
      : this.timer.started()
        ? 'مکث'
        : 'آماده',
  );

  protected readonly fa = (n: number) => faNumber(n);

  constructor() {
    const task = inject(ActivatedRoute).snapshot.queryParamMap.get('task');
    if (task && !this.timer.started()) this.timer.taskId.set(task);
    this.timer.onFinish = () => void this.finish(true);
    inject(DestroyRef).onDestroy(() => {
      // Keep the timer running; a finished Pomodoro is saved next time the page opens.
      this.timer.onFinish = null;
    });
    if (
      this.timer.kind() === 'POMODORO' &&
      this.timer.started() &&
      this.timer.remaining() === 0
    )
      void this.finish(true);
  }

  protected setKind(value: unknown) {
    if (value === 'POMODORO' || value === 'STOPWATCH')
      this.timer.kind.set(value);
  }

  /** Saves the focused time (at least a minute) and resets the timer. */
  protected async finish(completed = false) {
    this.timer.pause();
    const ms = this.timer.elapsed();
    const minutes = Math.round(ms / 60_000);
    const taskId = this.timer.taskId() || null;
    const kind = this.timer.kind();
    this.timer.reset();
    if (minutes < 1) {
      aioToast.info('کمتر از یک دقیقه بود؛ ثبت نشد.');
      return;
    }
    const endAt = new Date();
    const startAt = new Date(endAt.getTime() - minutes * 60_000);
    try {
      const record = await this.api.createFocus({
        kind,
        taskId,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      });
      this.records.update((list) => [record, ...list]);
      if (completed) navigator.vibrate?.(300);
      aioToast.success(`${faNumber(minutes)} دقیقه تمرکز ثبت شد`);
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

  protected when(r: PlannerFocus) {
    return faDate(r.startAt, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tehran',
    });
  }

  protected edit(r: PlannerFocus) {
    this.note.set(r.note);
    this.editingRecord.set(r);
  }

  protected async saveNote() {
    const r = this.editingRecord();
    if (!r) return;
    try {
      const saved = await this.api.updateFocus(r.id, {
        note: this.note().trim(),
      });
      this.records.update((list) =>
        list.map((x) => (x.id === r.id ? saved : x)),
      );
      this.editingRecord.set(null);
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

  protected async remove() {
    const r = this.editingRecord();
    if (!r) return;
    this.editingRecord.set(null);
    const ok = await this.confirm.ask({
      title: 'این جلسه تمرکز حذف شود؟',
      confirmText: 'حذف',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.api.removeFocus(r.id);
      this.records.update((list) => list.filter((x) => x.id !== r.id));
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }
}

function faDigits(text: string) {
  return text.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}
