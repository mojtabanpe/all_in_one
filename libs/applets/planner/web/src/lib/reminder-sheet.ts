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
  AioButton,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  aioToast,
} from '@all-in-one/ui';
import { apiErrorMessage, faDate } from '@all-in-one/web/shared';
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
  imports: [AioButton, AioDialog, AioDialogActions, AioDialogBody],
  template: `
    <aio-dialog
      [(open)]="open"
      (openChange)="$event || close()"
      [title]="title()"
      [description]="description()"
      contentClass="applet-planner sm:max-w-md"
    >
      <ng-template aioDialogBody>
        @if (!ready()) {
          <p class="text-muted-foreground text-sm">در حال دریافت…</p>
        } @else if (missing()) {
          <p class="text-muted-foreground text-sm">
            این یادآوری دیگر پیدا نشد.
          </p>
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
            {{ target()?.kind === 'task' ? 'انجامش نمی‌دم' : 'امروز نه' }}
          </button>
          <button aioBtn class="min-h-11" [disabled]="busy()" (click)="done()">
            انجام شد
          </button>
        } @else {
          <button aioBtn variant="outline" (click)="close()">بستن</button>
        }
      </ng-template>
    </aio-dialog>
  `,
})
export class ReminderSheet {
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
  private readonly habit = computed(() => {
    const t = this.target();
    return t?.kind === 'habit' && this.habitsRes.hasValue()
      ? this.habitsRes.value().find((h) => h.id === t.id)
      : undefined;
  });
  private readonly task = computed(() =>
    this.taskRes.hasValue() ? this.taskRes.value() : undefined,
  );

  protected readonly ready = computed(() =>
    this.target()?.kind === 'task'
      ? !this.taskRes.isLoading()
      : !this.habitsRes.isLoading(),
  );
  protected readonly missing = computed(() =>
    this.target()?.kind === 'task'
      ? !this.task() || this.task()!.done
      : !this.habit(),
  );
  protected readonly title = computed(
    () => this.task()?.title ?? this.habit()?.name ?? 'یادآوری',
  );
  protected readonly description = computed(() => {
    const t = this.target();
    if (t?.kind === 'habit') return `عادت، ${faDate(t.date)}`;
    const task = this.task();
    return task?.date ? `کار، ${faDate(task.date)}` : 'کار';
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
      if (message) aioToast.success(message, this.title());
      this.close();
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected done() {
    const t = this.target();
    if (t?.kind === 'task')
      void this.run(
        () => this.api.updateTask(t.id, { done: true }),
        'کار انجام شد',
      );
    else if (t?.kind === 'habit') {
      const habit = this.habit()!;
      void this.run(
        () => this.api.checkin(t.id, { date: t.date, value: habit.goal }),
        'ثبت شد',
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
