import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import {
  addDays,
  compareTasks,
  type CreateTaskInput,
  PLANNER_AREA_LABELS,
  type PlannerTask,
  TASK_PRIORITY_LABELS,
  toIsoDate,
} from '@all-in-one/applets/planner/contracts';
import {
  AioBadge,
  AioButton,
  AioCheckbox,
  AioConfirm,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioEmptyDirectives,
  AioIcon,
  AioItemDirectives,
  AioSkeleton,
  aioToast,
  AioToggleGroupDirectives,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage, faDate, faNumber } from '@all-in-one/web/shared';
import {
  lucideCalendarCheck,
  lucideChevronLeft,
  lucideChevronRight,
  lucideClock,
  lucidePlus,
  lucideTrash2,
} from '@ng-icons/lucide';
import { PlannerApi } from './planner-api';
import { TaskForm } from './task-form';

/** Persian weeks start on Saturday. */
function weekStart(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, -((day + 1) % 7));
}

@Component({
  selector: 'planner-page',
  imports: [
    AioBadge,
    AioButton,
    AioCheckbox,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioEmptyDirectives,
    AioIcon,
    AioItemDirectives,
    AioSkeleton,
    AioToggleGroupDirectives,
    TaskForm,
  ],
  providers: [
    provideIcons({
      lucideCalendarCheck,
      lucideChevronLeft,
      lucideChevronRight,
      lucideClock,
      lucidePlus,
      lucideTrash2,
    }),
  ],
  template: `
    <div class="flex flex-col gap-4">
      <header class="flex items-center justify-between gap-2">
        <div>
          <h1 class="text-2xl font-bold">برنامه‌ریز</h1>
          <p class="text-muted-foreground text-sm">{{ selectedLabel() }}</p>
        </div>
        <button aioBtn (click)="adding.set(true)">
          <aio-icon name="lucidePlus" size="sm" />
          کار جدید
        </button>
      </header>

      <nav
        class="glass flex items-center gap-1 rounded-2xl p-1.5"
        aria-label="روزهای هفته"
      >
        <button
          aioBtn
          variant="ghost"
          size="icon"
          (click)="shiftWeek(-7)"
          aria-label="هفته قبل"
        >
          <aio-icon name="lucideChevronRight" size="sm" />
        </button>
        <div
          aioToggleGroup
          type="single"
          class="grid flex-1 grid-cols-7 gap-1"
          [value]="selected()"
          (valueChange)="select($event)"
        >
          @for (day of week(); track day.iso) {
            <button
              aioToggleGroupItem
              [value]="day.iso"
              class="h-auto flex-col gap-0.5 rounded-xl py-1.5"
              [attr.aria-label]="day.full"
            >
              <span class="text-muted-foreground text-[0.6875rem]">{{
                day.weekday
              }}</span>
              <span class="font-semibold">{{ day.dayNumber }}</span>
              <span
                class="h-1 w-1 rounded-full"
                [class.bg-primary]="day.open > 0"
              ></span>
            </button>
          }
        </div>
        <button
          aioBtn
          variant="ghost"
          size="icon"
          (click)="shiftWeek(7)"
          aria-label="هفته بعد"
        >
          <aio-icon name="lucideChevronLeft" size="sm" />
        </button>
      </nav>

      @if (tasks.isLoading() && !tasks.hasValue()) {
        <div class="flex flex-col gap-2">
          <div aioSkeleton class="h-16 rounded-2xl"></div>
          <div aioSkeleton class="h-16 rounded-2xl"></div>
        </div>
      } @else if (dayTasks().length === 0) {
        <div aioEmpty class="glass rounded-3xl">
          <div aioEmptyHeader>
            <div aioEmptyMedia variant="icon">
              <aio-icon name="lucideCalendarCheck" />
            </div>
            <h2 aioEmptyTitle>برای این روز کاری ثبت نشده</h2>
            <p aioEmptyDescription>
              کارهای این روز را اضافه کنید تا جلوی چشمتان باشد.
            </p>
          </div>
          <div aioEmptyContent>
            <button aioBtn variant="outline" (click)="adding.set(true)">
              افزودن کار
            </button>
          </div>
        </div>
      } @else {
        <p class="text-muted-foreground text-sm">{{ progressLabel() }}</p>
        <div aioItemGroup class="flex flex-col gap-2">
          @for (task of dayTasks(); track task.id) {
            <div
              aioItem
              variant="outline"
              class="glass rounded-2xl"
              [class.opacity-60]="task.done"
            >
              <div aioItemMedia>
                <aio-checkbox
                  [checked]="task.done"
                  (checkedChange)="toggle(task, $event)"
                  [aria-label]="'انجام شد: ' + task.title"
                />
              </div>
              <div aioItemContent>
                <div aioItemTitle [class.line-through]="task.done">
                  {{ task.title }}
                </div>
                <div
                  aioItemDescription
                  class="flex flex-wrap items-center gap-1.5"
                >
                  @if (task.time) {
                    <span class="inline-flex items-center gap-1"
                      ><aio-icon name="lucideClock" size="xs" />{{
                        faTime(task.time)
                      }}</span
                    >
                  }
                  <span aioBadge variant="secondary">{{
                    areaLabels[task.area]
                  }}</span>
                  @if (task.priority === 'HIGH') {
                    <span aioBadge variant="destructive"
                      >اولویت {{ priorityLabels[task.priority] }}</span
                    >
                  }
                </div>
                @if (task.notes) {
                  <p class="text-muted-foreground mt-1 text-sm">
                    {{ task.notes }}
                  </p>
                }
              </div>
              <div aioItemActions>
                <button
                  aioBtn
                  variant="ghost"
                  size="icon"
                  (click)="remove(task)"
                  [attr.aria-label]="'حذف ' + task.title"
                >
                  <aio-icon name="lucideTrash2" size="sm" />
                </button>
              </div>
            </div>
          }
        </div>
      }
    </div>

    <aio-dialog
      [(open)]="adding"
      title="کار جدید"
      [description]="selectedLabel()"
    >
      <ng-template aioDialogBody>
        <planner-task-form
          #taskForm
          [date]="selected()"
          (saved)="create($event)"
        />
      </ng-template>
      <ng-template aioDialogActions>
        <button aioBtn variant="outline" (click)="adding.set(false)">
          انصراف
        </button>
        <button
          aioBtn
          type="submit"
          form="planner-task-form"
          [disabled]="saving()"
        >
          ذخیره
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class PlannerPage {
  private readonly api = inject(PlannerApi);
  private readonly confirm = inject(AioConfirm);

  protected readonly areaLabels = PLANNER_AREA_LABELS;
  protected readonly priorityLabels = TASK_PRIORITY_LABELS;
  protected readonly selected = signal(toIsoDate(new Date()));
  protected readonly adding = signal(false);
  protected readonly saving = signal(false);
  protected readonly taskForm = viewChild(TaskForm);

  private readonly start = computed(() => weekStart(this.selected()));
  protected readonly tasks = httpResource<PlannerTask[]>(() =>
    this.api.tasksUrl(this.start(), addDays(this.start(), 6)),
  );

  protected readonly week = computed(() => {
    const all = this.tasks.hasValue() ? this.tasks.value() : [];
    return Array.from({ length: 7 }, (_, i) => {
      const iso = addDays(this.start(), i);
      return {
        iso,
        weekday: faDate(iso, { weekday: 'narrow' }),
        dayNumber: faDate(iso, { day: 'numeric' }),
        full: faDate(iso, { weekday: 'long', day: 'numeric', month: 'long' }),
        open: all.filter((t) => t.date === iso && !t.done).length,
      };
    });
  });

  protected readonly dayTasks = computed(() =>
    (this.tasks.hasValue() ? this.tasks.value() : [])
      .filter((t) => t.date === this.selected())
      .sort(compareTasks),
  );
  protected readonly selectedLabel = computed(() =>
    faDate(this.selected(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  );
  protected readonly progressLabel = computed(() => {
    const done = this.dayTasks().filter((t) => t.done).length;
    return `${faNumber(done)} از ${faNumber(this.dayTasks().length)} کار انجام شده`;
  });

  protected faTime(time: string) {
    return time.replace(/\d/g, (d) => faNumber(Number(d)));
  }

  protected select(value: unknown) {
    if (typeof value === 'string') this.selected.set(value);
  }

  protected shiftWeek(days: number) {
    this.selected.update((d) => addDays(d, days));
  }

  protected async create(input: CreateTaskInput) {
    this.saving.set(true);
    try {
      const task = await this.api.create(input);
      this.tasks.update((list) => [...(list ?? []), task]);
      this.adding.set(false);
      this.selected.set(task.date);
      aioToast.success('کار اضافه شد');
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async toggle(task: PlannerTask, done: boolean) {
    this.replace({ ...task, done });
    try {
      this.replace(await this.api.update(task.id, { done }));
    } catch (error) {
      this.replace(task);
      aioToast.error(apiErrorMessage(error));
    }
  }

  protected async remove(task: PlannerTask) {
    const ok = await this.confirm.ask({
      title: 'این کار حذف شود؟',
      description: task.title,
      confirmText: 'حذف',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.api.remove(task.id);
      this.tasks.update((list) => (list ?? []).filter((t) => t.id !== task.id));
      aioToast.success('حذف شد');
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

  private replace(task: PlannerTask) {
    this.tasks.update((list) =>
      (list ?? []).map((t) => (t.id === task.id ? task : t)),
    );
  }
}
