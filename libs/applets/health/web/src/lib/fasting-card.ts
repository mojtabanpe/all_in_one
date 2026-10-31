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
  FASTING_PROTOCOLS,
  type FastingState,
  fastHoursElapsed,
  fastingProtocolLabel,
  MAX_FAST_HOURS,
} from '@all-in-one/applets/health/contracts';
import {
  AioButton,
  AioConfirm,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioFieldDirectives,
  AioIcon,
  AioInput,
  AioProgressDirectives,
  AioSkeleton,
  aioToast,
  AioToggleGroupDirectives,
  provideIcons,
} from '@all-in-one/ui';
import { toIsoDate } from '@all-in-one/shared/schemas';
import { apiErrorMessage, faDate, faNumber } from '@all-in-one/web/shared';
import { lucideHistory, lucideTimer, lucideTrash2 } from '@ng-icons/lucide';
import { HealthApi } from './health-api';
import {
  clockTime,
  duration,
  fromLocalInput,
  timer,
  toLocalInput,
} from './time-format';

const HOUR = 3_600_000;

/** Intermittent fasting at a glance: how long the running fast has lasted, start and end. */
@Component({
  selector: 'health-fasting-card',
  host: { class: 'flex min-w-0' },
  imports: [
    AioButton,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioFieldDirectives,
    AioIcon,
    AioInput,
    AioProgressDirectives,
    AioSkeleton,
    AioToggleGroupDirectives,
  ],
  providers: [provideIcons({ lucideHistory, lucideTimer, lucideTrash2 })],
  template: `
    <section
      class="health-metric health-body-card flex-1"
      aria-labelledby="fast-title"
    >
      <div class="flex items-center justify-between gap-2">
        <h2 id="fast-title" class="health-metric-label">
          {{
            active()
              ? 'در فستینگ، ' + protocolLabel(active()!.targetHours)
              : 'فستینگ'
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
          aria-label="در حال دریافت"
        ></div>
      } @else if (state.error()) {
        <p class="health-metric-label">فستینگ دریافت نشد.</p>
        <button aioBtn variant="link" (click)="state.reload()">
          تلاش دوباره
        </button>
      } @else if (active(); as fast) {
        <div class="flex flex-col gap-1">
          <p class="health-number" aria-live="off">
            {{ timerLabel() }}
          </p>
          <p class="health-metric-label">
            {{ duration(elapsed()) }} از شروع، ساعت
            {{ clock(fast.startedAt) }}
          </p>
        </div>
        <div
          aioProgress
          class="health-fast-progress"
          [value]="Math.min((elapsed() * 100) / fast.targetHours, 100)"
          [attr.aria-label]="'پیشرفت تا ' + fa(fast.targetHours) + ' ساعت'"
        >
          <div aioProgressIndicator></div>
        </div>
        <p class="text-sm">
          @if (elapsed() >= fast.targetHours) {
            <strong>به هدف {{ fa(fast.targetHours) }} ساعته رسیدی.</strong>
            هر وقت آماده بودی، فستینگ را تمام کن.
          } @else {
            {{ duration(fast.targetHours - elapsed()) }} مانده؛ پایان ساعت
            {{ endClock() }}
          }
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            aioBtn
            class="health-primary-action flex-1"
            [disabled]="busy()"
            (click)="endNow()"
          >
            پایان فستینگ
          </button>
          <button
            aioBtn
            variant="ghost"
            class="health-soft-action"
            (click)="openEdit(fast)"
          >
            ویرایش
          </button>
        </div>
      } @else {
        <div class="flex flex-col gap-1">
          @if (last(); as fast) {
            <p class="health-small-number">
              {{ duration(hours(fast)) }}
            </p>
            <p class="health-metric-label">
              آخرین فستینگ، {{ dayLabel(fast.endedAt!) }}
              {{ hours(fast) >= fast.targetHours ? '، کامل' : '' }}
            </p>
          } @else {
            <p class="text-lg font-semibold">آماده‌ی یک فستینگ؟</p>
            <p class="health-metric-label">
              شروعش را ثبت کن تا ببینی چند ساعت است که چیزی نخورده‌ای.
            </p>
          }
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            aioBtn
            class="health-primary-action flex-1"
            (click)="openStart()"
          >
            شروع فستینگ
          </button>
          @if (state.value()?.recent?.length) {
            <button
              aioBtn
              variant="ghost"
              size="icon"
              class="health-soft-action size-11"
              aria-label="سابقه فستینگ"
              (click)="historyOpen.set(true)"
            >
              <aio-icon name="lucideHistory" size="sm" />
            </button>
          }
        </div>
      }
    </section>

    <aio-dialog
      [open]="sheet() !== null"
      (openChange)="$event || sheet.set(null)"
      [title]="sheet() === 'edit' ? 'ویرایش فستینگ' : 'شروع فستینگ'"
      description="ساعت‌ها بدون غذا؛ آب، چای و قهوه‌ی بدون شکر مجاز است."
      contentClass="applet-health health-calm"
    >
      <ng-template aioDialogBody>
        <form
          id="fast-form"
          class="flex flex-col gap-5"
          (submit)="$event.preventDefault(); save()"
        >
          <div aioField>
            <span aioFieldLabel id="fast-hours-label">مدت فستینگ</span>
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
                  {{ protocolLabel(h) }}
                </button>
              }
            </div>
            <label aioFieldLabel for="fast-hours" class="mt-2"
              >یا تعداد ساعت دلخواه</label
            >
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
              {{ protocolLabel(targetHours()) }}: {{ fa(targetHours()) }} ساعت
              فستینگ{{
                targetHours() < 24
                  ? '، ' + fa(24 - targetHours()) + ' ساعت پنجره‌ی غذا'
                  : ''
              }}.
            </p>
          </div>
          <div aioField>
            <label aioFieldLabel for="fast-start">از کی چیزی نخورده‌ای؟</label>
            <input
              aioInput
              id="fast-start"
              type="datetime-local"
              [min]="minStart()"
              [max]="nowInput()"
              [value]="startInput()"
              (change)="startInput.set($any($event.target).value)"
              [attr.aria-invalid]="!!startError()"
              aria-describedby="fast-start-hint"
            />
            <p
              aioFieldDescription
              id="fast-start-hint"
              [class.text-destructive]="!!startError()"
            >
              {{
                startError() ??
                  'اگر همین الان شروع می‌کنی، دست نزن؛ حداکثر ۷۲ ساعت قبل.'
              }}
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
            حذف
          </button>
        }
        <button aioBtn variant="outline" (click)="sheet.set(null)">
          انصراف
        </button>
        <button
          aioBtn
          type="submit"
          form="fast-form"
          class="health-primary-action"
          [disabled]="busy()"
        >
          {{ sheet() === 'edit' ? 'ذخیره' : 'شروع' }}
        </button>
      </ng-template>
    </aio-dialog>

    <aio-dialog
      [(open)]="historyOpen"
      title="سابقه فستینگ"
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
                  >{{ duration(hours(fast)) }}
                  <span class="font-normal text-muted-foreground"
                    >از {{ fa(fast.targetHours) }} ساعت</span
                  ></strong
                >
                <span class="health-metric-label"
                  >{{ dayLabel(fast.startedAt) }}، ساعت
                  {{ clock(fast.startedAt) }} تا
                  {{ clock(fast.endedAt!) }}</span
                >
              </div>
              <button
                aioBtn
                variant="ghost"
                size="icon"
                class="size-11 shrink-0"
                [attr.aria-label]="'حذف فستینگ ' + dayLabel(fast.startedAt)"
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
  private readonly api = inject(HealthApi);
  private readonly confirm = inject(AioConfirm);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly Math = Math;
  protected readonly protocols = FASTING_PROTOCOLS;
  protected readonly maxHours = MAX_FAST_HOURS;
  protected readonly protocolLabel = fastingProtocolLabel;
  protected readonly duration = duration;
  protected readonly clock = clockTime;
  protected readonly fa = (n: number) => faNumber(n);
  protected readonly dayLabel = (iso: string) =>
    faDate(toIsoDate(new Date(iso)), { day: 'numeric', month: 'long' });

  protected readonly state = httpResource<FastingState>(
    () => `${this.api.base}/fasting`,
  );
  /** Ticks so the running timer stays current. */
  private readonly now = signal(Date.now());
  protected readonly busy = signal(false);
  protected readonly sheet = signal<'start' | 'edit' | null>(null);
  protected readonly historyOpen = signal(false);
  protected readonly targetHours = signal(16);
  protected readonly startInput = signal('');
  private editingId: string | null = null;
  /** The start as the edit sheet opened, to send it only when changed. */
  private originalStart = '';

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
  protected readonly timerLabel = computed(() => timer(this.elapsed()));
  protected readonly endClock = computed(() => {
    const fast = this.active();
    return fast
      ? clockTime(
          new Date(
            Date.parse(fast.startedAt) + fast.targetHours * HOUR,
          ).toISOString(),
        )
      : '';
  });
  protected readonly nowInput = computed(() =>
    toLocalInput(new Date(this.now())),
  );
  protected readonly minStart = computed(() =>
    toLocalInput(new Date(this.now() - MAX_FAST_HOURS * HOUR)),
  );
  protected readonly startError = computed(() => {
    const at = fromLocalInput(this.startInput());
    if (!at) return null;
    const t = at.getTime();
    if (t > Date.now() + 60_000) return 'شروع نمی‌تواند در آینده باشد.';
    if (Date.now() - t > MAX_FAST_HOURS * HOUR)
      return 'حداکثر ۷۲ ساعت قبل را می‌شود انتخاب کرد.';
    return null;
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

  protected openStart() {
    this.editingId = null;
    this.targetHours.set(this.last()?.targetHours ?? 16);
    this.now.set(Date.now());
    this.startInput.set(toLocalInput(new Date()));
    this.sheet.set('start');
  }

  protected openEdit(fast: Fast) {
    this.editingId = fast.id;
    this.targetHours.set(fast.targetHours);
    this.now.set(Date.now());
    this.originalStart = toLocalInput(new Date(fast.startedAt));
    this.startInput.set(this.originalStart);
    this.sheet.set('edit');
  }

  protected async save() {
    if (this.startError()) return;
    const at = fromLocalInput(this.startInput());
    // An untouched "now" (same minute) starts at the exact current time.
    const startedAt =
      at && Date.now() - at.getTime() > 60_000 ? at.toISOString() : undefined;
    const editedStart =
      at && this.startInput() !== this.originalStart
        ? at.toISOString()
        : undefined;
    await this.run(async () => {
      const state = this.editingId
        ? await this.api.updateFast(this.editingId, {
            targetHours: this.targetHours(),
            startedAt: editedStart,
          })
        : await this.api.startFast({
            targetHours: this.targetHours(),
            startedAt,
          });
      this.state.set(state);
      this.sheet.set(null);
      if (!this.editingId)
        aioToast.success(
          'فستینگ شروع شد',
          `${fastingProtocolLabel(this.targetHours())}؛ موفق باشی!`,
        );
    });
  }

  protected async endNow() {
    const fast = this.active();
    if (!fast) return;
    await this.run(async () => {
      const state = await this.api.endFast({});
      this.state.set(state);
      const done = state.recent.find((f) => f.id === fast.id);
      const lasted = done ? duration(this.hours(done)) : '';
      aioToast.action(`فستینگ تمام شد: ${lasted}`, 'برگرداندن', () =>
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
    if (!this.editingId) return;
    const id = this.editingId;
    const ok = await this.confirm.ask({
      title: 'این فستینگ حذف شود؟',
      description: 'زمان شروعش از سابقه پاک می‌شود.',
      confirmText: 'حذف',
      destructive: true,
    });
    if (!ok) return;
    await this.run(async () => {
      this.state.set(await this.api.removeFast(id));
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
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
