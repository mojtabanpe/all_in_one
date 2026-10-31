import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import {
  addDays,
  type CalendarEvent,
  isoDateIn,
  type PlannerCalendar,
  type PlannerColor,
  type PlannerTask,
  toIsoDate,
} from '@all-in-one/applets/planner/contracts';
import {
  AioButton,
  AioConfirm,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioFieldDirectives,
  AioIcon,
  AioInput,
  AioSkeleton,
  aioToast,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage, faDate, faNumber } from '@all-in-one/web/shared';
import {
  lucideChevronLeft,
  lucideChevronRight,
  lucideCircle,
  lucideCircleAlert,
  lucidePlus,
  lucideSettings2,
  lucideTrash2,
} from '@ng-icons/lucide';
import { TONE } from './colors';
import { PlannerApi } from './planner-api';

const SPAN = 14;

interface AgendaItem {
  key: string;
  title: string;
  time: string;
  dot: string;
  kind: 'event' | 'task';
  location?: string;
}

/** TickTick's calendar as an agenda: dated tasks with subscribed calendar events, two weeks at a time. */
@Component({
  selector: 'planner-calendar-page',
  imports: [
    AioButton,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioFieldDirectives,
    AioIcon,
    AioInput,
    AioSkeleton,
  ],
  providers: [
    provideIcons({
      lucideChevronLeft,
      lucideChevronRight,
      lucideCircle,
      lucideCircleAlert,
      lucidePlus,
      lucideSettings2,
      lucideTrash2,
    }),
  ],
  host: { class: 'flex flex-col gap-5' },
  template: `
    <header class="flex items-center gap-2">
      <div class="flex-1">
        <h1 class="text-2xl font-bold">تقویم</h1>
        <p class="text-muted-foreground text-sm">{{ rangeLabel() }}</p>
      </div>
      <button
        aioBtn
        variant="outline"
        size="icon"
        aria-label="دو هفته قبل"
        (click)="shift(-1)"
      >
        <aio-icon name="lucideChevronRight" />
      </button>
      <button
        aioBtn
        variant="outline"
        size="icon"
        aria-label="دو هفته بعد"
        (click)="shift(1)"
      >
        <aio-icon name="lucideChevronLeft" />
      </button>
      <button
        aioBtn
        variant="ghost"
        size="icon"
        aria-label="تقویم‌های اشتراکی"
        (click)="manage.set(true)"
      >
        <aio-icon name="lucideSettings2" />
      </button>
    </header>

    @for (c of calendars(); track c.id) {
      @if (c.lastError) {
        <p
          class="text-destructive flex items-center gap-2 text-sm"
          role="status"
        >
          <aio-icon name="lucideCircleAlert" size="sm" />
          تقویم «{{ c.name }}» خوانده نشد: {{ c.lastError }}
        </p>
      }
    }

    @if (loading()) {
      <div aioSkeleton class="h-24 rounded-2xl"></div>
      <div aioSkeleton class="h-24 rounded-2xl"></div>
    } @else {
      @for (day of agenda(); track day.date) {
        <section class="flex flex-col gap-2" [attr.aria-label]="day.label">
          <h2
            class="px-1 text-sm font-semibold"
            [class.text-primary]="day.date === today"
            [class.text-muted-foreground]="day.date !== today"
          >
            {{ day.label }}
          </h2>
          <ul class="glass divide-border/60 flex flex-col divide-y rounded-2xl">
            @for (item of day.items; track item.key) {
              <li class="flex min-h-12 items-center gap-3 px-4 py-2">
                <span
                  [class]="'size-2.5 shrink-0 rounded-full ' + item.dot"
                ></span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate">{{ item.title }}</span>
                  @if (item.location) {
                    <span class="text-muted-foreground truncate text-xs">{{
                      item.location
                    }}</span>
                  }
                </span>
                <span class="text-muted-foreground shrink-0 text-xs">{{
                  item.time
                }}</span>
              </li>
            }
          </ul>
        </section>
      } @empty {
        <div class="glass text-muted-foreground rounded-2xl p-4 text-sm">
          در این دو هفته کار تاریخ‌دار یا رویدادی نیست.
          @if (!calendars().length) {
            تقویم گوگل، اوت‌لوک یا آی‌کلاد را از دکمه تنظیمات اضافه کن.
          }
        </div>
      }
    }

    <aio-dialog
      [(open)]="manage"
      title="تقویم‌های اشتراکی"
      description="نشانی iCal (ics) تقویم را بگذار؛ فقط خوانده می‌شود."
      contentClass="applet-planner sm:max-w-md"
    >
      <ng-template aioDialogBody>
        <div class="flex flex-col gap-4 pb-2">
          <ul class="flex flex-col">
            @for (c of calendars(); track c.id) {
              <li class="flex min-h-11 items-center gap-3">
                <span [class]="'size-3 rounded-full ' + dot(c.color)"></span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate">{{ c.name }}</span>
                  <span
                    class="text-muted-foreground truncate text-xs"
                    dir="ltr"
                    >{{ c.url }}</span
                  >
                </span>
                <button
                  aioBtn
                  variant="ghost"
                  size="icon"
                  [attr.aria-label]="'حذف ' + c.name"
                  (click)="remove(c)"
                >
                  <aio-icon name="lucideTrash2" size="sm" />
                </button>
              </li>
            }
          </ul>
          <form
            id="calendar-form"
            class="flex flex-col gap-3"
            (submit)="$event.preventDefault(); add()"
          >
            <div aioField>
              <label aioFieldLabel for="cal-name">نام</label>
              <input
                aioInput
                id="cal-name"
                placeholder="مثلاً: تعطیلات رسمی"
                [value]="name()"
                (input)="name.set($any($event.target).value)"
              />
            </div>
            <div aioField>
              <label aioFieldLabel for="cal-url">نشانی iCal</label>
              <input
                aioInput
                id="cal-url"
                type="url"
                dir="ltr"
                placeholder="https://… یا webcal://…"
                [value]="url()"
                (input)="url.set($any($event.target).value)"
              />
            </div>
          </form>
        </div>
      </ng-template>
      <ng-template aioDialogActions>
        <button aioBtn type="submit" form="calendar-form" [disabled]="saving()">
          <aio-icon name="lucidePlus" size="sm" />
          افزودن تقویم
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class CalendarPage {
  private readonly api = inject(PlannerApi);
  private readonly confirm = inject(AioConfirm);

  protected readonly today = toIsoDate(new Date());
  protected readonly start = signal(this.today);
  protected readonly end = computed(() => addDays(this.start(), SPAN - 1));
  protected readonly manage = signal(false);
  protected readonly name = signal('');
  protected readonly url = signal('');
  protected readonly saving = signal(false);

  private readonly calendarsRes = httpResource<PlannerCalendar[]>(
    () => `${this.api.base}/calendars`,
  );
  private readonly eventsRes = httpResource<CalendarEvent[]>(() =>
    this.api.url('/calendars/events', { from: this.start(), to: this.end() }),
  );
  private readonly tasksRes = httpResource<PlannerTask[]>(() =>
    this.api.url('/tasks', {
      status: 'all',
      from: this.start(),
      to: this.end(),
    }),
  );

  protected readonly calendars = computed(() =>
    this.calendarsRes.hasValue() ? this.calendarsRes.value() : [],
  );
  protected readonly loading = computed(
    () =>
      (this.tasksRes.isLoading() && !this.tasksRes.hasValue()) ||
      (this.eventsRes.isLoading() && !this.eventsRes.hasValue()),
  );

  protected readonly agenda = computed(() => {
    const days = new Map<string, AgendaItem[]>();
    const add = (date: string, item: AgendaItem) =>
      days.set(date, [...(days.get(date) ?? []), item]);
    const colors = new Map(this.calendars().map((c) => [c.id, c.color]));
    for (const e of this.eventsRes.hasValue() ? this.eventsRes.value() : []) {
      const dot =
        TONE[(colors.get(e.calendarId) ?? 'violet') as PlannerColor].dot;
      if (e.allDay) {
        // All-day events may span days; the end date is exclusive.
        const last = e.end ? addDays(e.end, -1) : e.start;
        for (let d = e.start; d <= last && d <= this.end(); d = addDays(d, 1))
          if (d >= this.start())
            add(d, {
              key: `${e.uid}${d}`,
              title: e.title,
              time: 'تمام روز',
              dot,
              kind: 'event',
              location: e.location,
            });
      } else {
        const at = new Date(e.start);
        add(isoDateIn(at), {
          key: e.uid + e.start,
          title: e.title,
          time: faDate(e.start, {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Tehran',
          }),
          dot,
          kind: 'event',
          location: e.location,
        });
      }
    }
    for (const t of this.tasksRes.hasValue() ? this.tasksRes.value() : []) {
      if (!t.date) continue;
      add(t.date, {
        key: t.id,
        title: (t.done ? '✓ ' : '') + (t.repeatRule ? '↻ ' : '') + t.title,
        time: t.time ? t.time.replace(/\d/g, (d) => faNumber(Number(d))) : '',
        dot: 'bg-primary',
        kind: 'task',
      });
    }
    return [...days.keys()].sort().map((date) => ({
      date,
      label: this.dayLabel(date),
      items: (days.get(date) ?? []).sort((a, b) =>
        a.time === 'تمام روز'
          ? -1
          : b.time === 'تمام روز'
            ? 1
            : a.time < b.time
              ? -1
              : 1,
      ),
    }));
  });

  protected readonly rangeLabel = computed(
    () =>
      `${faDate(this.start(), { day: 'numeric', month: 'long' })} تا ${faDate(this.end(), { day: 'numeric', month: 'long' })}`,
  );

  protected dot(color: PlannerColor) {
    return TONE[color].dot;
  }

  protected dayLabel(iso: string) {
    const prefix =
      iso === this.today
        ? 'امروز، '
        : iso === addDays(this.today, 1)
          ? 'فردا، '
          : '';
    return (
      prefix + faDate(iso, { weekday: 'long', day: 'numeric', month: 'long' })
    );
  }

  protected shift(step: number) {
    this.start.update((d) => addDays(d, step * SPAN));
  }

  protected async add() {
    if (!this.name().trim() || !this.url().trim()) {
      aioToast.error('نام و نشانی تقویم را بنویس.');
      return;
    }
    this.saving.set(true);
    try {
      await this.api.createCalendar({
        name: this.name().trim(),
        url: this.url().trim(),
      });
      this.name.set('');
      this.url.set('');
      this.calendarsRes.reload();
      this.eventsRes.reload();
      aioToast.success('تقویم اضافه شد');
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(c: PlannerCalendar) {
    const ok = await this.confirm.ask({
      title: `تقویم «${c.name}» برداشته شود؟`,
      confirmText: 'برداشتن',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.api.removeCalendar(c.id);
      this.calendarsRes.reload();
      this.eventsRes.reload();
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }
}
