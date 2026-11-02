import {
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { httpResource } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type {
  PlannerHabit,
  PlannerTask,
} from '@all-in-one/applets/planner/contracts';
import {
  AioTranslate,
  AioButton,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioLocale,
  AioNotifications,
} from '@all-in-one/ui';
import { apiErrorMessage, faNumber } from '@all-in-one/web/shared';
import { PlannerApi } from './planner-api';

/** `?remind=task:<id>` or `?remind=habit:<id>:<YYYY-MM-DD>` (set by push notifications). */
export function parseRemind(
  value: string | null | undefined,
):
  | { kind: 'task'; id: string }
  | { kind: 'habit'; id: string; date: string }
  | null {
  if (!value) return null;
  const task = /^task:([^:]+)$/.exec(value);
  if (task) return { kind: 'task', id: task[1] };
  const habit = /^habit:([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(value);
  return habit ? { kind: 'habit', id: habit[1], date: habit[2] } : null;
}

/** Bottom sheet opened from a reminder: mark it done, or decline it. */
@Component({
  selector: 'planner-reminder-sheet',
  imports: [
    AioButton,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioTranslate,
  ],
  template: `
    <aio-dialog
      [(open)]="open"
      (openChange)="$event || close()"
      [title]="task() || habit() ? title() : (title() | aioTranslate)"
      [description]="description() | aioTranslate"
      contentClass="applet-planner sm:max-w-md"
    >
      <ng-template aioDialogBody>
        @if (!ready()) {
          <p class="text-muted-foreground text-sm">
            {{ 'در حال دریافت…' | aioTranslate }}
          </p>
        } @else if (missing()) {
          <p class="text-muted-foreground text-sm">
            {{
              (finished()
                ? 'این مورد قبلاً کامل شده.'
                : 'این یادآوری دیگر پیدا نشد.'
              ) | aioTranslate
            }}
          </p>
        } @else if (habit(); as h) {
          @if (h.goal > 1) {
            <p class="text-sm">
              {{
                '{0} از {1} {2} انجام شده'
                  | aioTranslate
                    : [faNumber(count()), faNumber(h.goal), h.unit || 'بار']
              }}
            </p>
          }
        }
      </ng-template>
      <ng-template aioDialogActions>
        @if (ready() && !missing()) {
          <button
            aioBtn
            variant="outline"
            class="min-h-11"
            [disabled]="busy()"
            (click)="decline()"
          >
            {{
              (target()?.kind === 'task' ? 'انجامش نمی‌دم' : 'امروز نه')
                | aioTranslate
            }}
          </button>
          @if ((habit()?.goal ?? 1) > 1) {
            <button
              aioBtn
              variant="outline"
              class="min-h-11"
              [disabled]="busy()"
              (click)="done(true)"
            >
              {{ 'همه انجام شد' | aioTranslate }}
            </button>
            <button
              aioBtn
              class="min-h-11"
              [disabled]="busy()"
              (click)="done()"
            >
              {{ 'یک {0} دیگر (+۱)' | aioTranslate: [habit()?.unit || 'بار'] }}
            </button>
          } @else {
            <button
              aioBtn
              class="min-h-11"
              [disabled]="busy()"
              (click)="done()"
            >
              {{ 'انجام شد' | aioTranslate }}
            </button>
          }
        } @else {
          <button aioBtn variant="outline" (click)="close()">
            {{ 'بستن' | aioTranslate }}
          </button>
        }
      </ng-template>
    </aio-dialog>
  `,
})
export class ReminderSheet {
  protected readonly locale = inject(AioLocale);

  private readonly notifications = inject(AioNotifications);

  private readonly api = inject(PlannerApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly query = toSignal(this.route.queryParamMap);

  protected readonly target = computed(() =>
    parseRemind(this.query()?.get('remind')),
  );
  protected readonly open = linkedSignal(() => !!this.target());
  protected readonly busy = signal(false);

  private readonly taskRes = httpResource<PlannerTask>(() => {
    const t = this.target();
    return t?.kind === 'task' ? `${this.api.base}/tasks/${t.id}` : undefined;
  });
  private readonly habitsRes = httpResource<PlannerHabit[]>(() =>
    this.target()?.kind === 'habit' ? `${this.api.base}/habits` : undefined,
  );
  protected readonly faNumber = (
    value: number,
    options?: Intl.NumberFormatOptions,
  ) => this.locale.number(value, options);
  protected readonly habit = computed(() => {
    const t = this.target();
    return t?.kind === 'habit' && this.habitsRes.hasValue()
      ? this.habitsRes.value().find((h) => h.id === t.id)
      : undefined;
  });
  protected readonly task = computed(() =>
    this.taskRes.hasValue() ? this.taskRes.value() : undefined,
  );

  protected readonly ready = computed(() =>
    this.target()?.kind === 'task'
      ? !this.taskRes.isLoading()
      : !this.habitsRes.isLoading(),
  );
  /** The reminder day's check-in count for the habit. */
  protected readonly count = computed(() => {
    const t = this.target();
    const habit = this.habit();
    if (t?.kind !== 'habit' || !habit) return 0;
    return habit.checkins.find((c) => c.date === t.date)?.value ?? 0;
  });
  protected readonly finished = computed(() =>
    this.target()?.kind === 'task'
      ? !!this.task()?.done
      : !!this.habit() && this.count() >= this.habit()!.goal,
  );
  protected readonly missing = computed(
    () =>
      this.finished() ||
      (this.target()?.kind === 'task' ? !this.task() : !this.habit()),
  );
  protected readonly title = computed(
    () => this.task()?.title ?? this.habit()?.name ?? 'یادآوری',
  );
  protected readonly description = computed(() => {
    const t = this.target();
    if (t?.kind === 'habit') return `عادت، ${this.locale.date(t.date)}`;
    const task = this.task();
    return task?.date ? `کار، ${this.locale.date(task.date)}` : 'کار';
  });

  protected close() {
    this.open.set(false);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { remind: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private async run(action: () => Promise<unknown>, message?: string) {
    this.busy.set(true);
    try {
      await action();
      if (message) this.notifications.success(message, this.title());
      this.close();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected done(all = false) {
    const t = this.target();
    if (t?.kind === 'task')
      void this.run(
        () => this.api.updateTask(t.id, { done: true }),
        'کار انجام شد',
      );
    else if (t?.kind === 'habit') {
      const goal = this.habit()!.goal;
      const value = all ? goal : Math.min(goal, this.count() + 1);
      void this.run(
        () => this.api.checkin(t.id, { date: t.date, value }),
        value >= goal
          ? 'امروز کامل شد'
          : `${this.locale.number(value)} از ${this.locale.number(goal)} ثبت شد`,
      );
    }
  }

  protected decline() {
    const t = this.target();
    if (t?.kind === 'task')
      void this.run(
        () => this.api.updateTask(t.id, { wontDo: true }),
        'به «انجام نمی‌دم» رفت',
      );
    else this.close(); // Habits have no "won't do"; an unchecked day stays unchecked.
  }
}
