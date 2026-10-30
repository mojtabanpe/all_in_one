import { NgTemplateOutlet } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import {
  addDays,
  compareTasks,
  type CreateTaskInput,
  PLANNER_AREA_LABELS,
  type PlannerTask,
  type TaskPriority,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  toIsoDate,
} from '@all-in-one/applets/planner/contracts';
import {
  AioButton,
  AioCheckbox,
  AioCollapsibleDirectives,
  AioConfirm,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioEmptyDirectives,
  AioIcon,
  AioInputGroupDirectives,
  AioSkeleton,
  aioToast,
  AioToggleGroupDirectives,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage, faDate, faNumber } from '@all-in-one/web/shared';
import {
  lucideChevronDown,
  lucideCircleCheckBig,
  lucideFlag,
  lucidePlus,
  lucideSlidersHorizontal,
  lucideTrash2,
} from '@ng-icons/lucide';
import { PlannerApi } from './planner-api';
import { TaskForm } from './task-form';

/** TickTick-style smart lists. */
type SmartList = 'today' | 'tomorrow' | 'week' | 'all';

interface Section {
  key: string;
  label: string;
  overdue?: boolean;
  tasks: PlannerTask[];
}

/** Round checkbox colours by priority: low grey, medium accent blue, high red. */
const PRIORITY_BOX: Record<TaskPriority, string> = {
  LOW: 'border-muted-foreground/50 data-checked:bg-muted-foreground data-checked:border-muted-foreground',
  MEDIUM:
    'border-primary data-checked:bg-primary data-checked:border-primary',
  HIGH: 'border-destructive bg-destructive/8 data-checked:bg-destructive data-checked:border-destructive',
};

/** Overdue tasks older than this are not loaded. */
const HISTORY_DAYS = 60;
const FUTURE_DAYS = 365;

@Component({
  selector: 'planner-page',
  imports: [
    AioButton,
    AioCheckbox,
    AioCollapsibleDirectives,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioEmptyDirectives,
    AioIcon,
    AioInputGroupDirectives,
    AioSkeleton,
    AioToggleGroupDirectives,
    NgTemplateOutlet,
    TaskForm,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideCircleCheckBig,
      lucideFlag,
      lucidePlus,
      lucideSlidersHorizontal,
      lucideTrash2,
    }),
  ],
  template: `
    <div class="applet-planner mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold">{{ listLabels[list()] }}</h1>
        <p class="text-muted-foreground text-sm">{{ subtitle() }}</p>
      </header>

      <div
        aioToggleGroup
        type="single"
        spacing="1"
        class="glass grid w-full grid-cols-4 rounded-2xl p-1"
        aria-label="فهرست‌ها"
        [value]="list()"
        (valueChange)="selectList($event)"
      >
        @for (l of lists; track l) {
          <button
            aioToggleGroupItem
            [value]="l"
            class="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 gap-1.5 rounded-xl px-2 text-sm"
          >
            {{ listLabels[l] }}
            @if (counts()[l] > 0) {
              <span class="text-xs opacity-75">{{ fa(counts()[l]) }}</span>
            }
          </button>
        }
      </div>

      <form
        aioInputGroup
        class="glass h-14 rounded-2xl border-transparent"
        (submit)="$event.preventDefault(); quickAdd()"
      >
        <aio-input-group-addon>
          <aio-icon name="lucidePlus" size="sm" class="text-primary" />
        </aio-input-group-addon>
        <input
          aioInputGroupInput
          name="quick-title"
          class="h-11"
          autocomplete="off"
          enterkeyhint="done"
          [placeholder]="quickPlaceholder()"
          [value]="quickTitle()"
          (input)="quickTitle.set($any($event.target).value)"
          aria-label="عنوان کار جدید"
        />
        <aio-input-group-addon align="inline-end">
          <button
            aioInputGroupButton
            type="button"
            size="icon-sm"
            class="size-11 rounded-xl"
            (click)="adding.set(true)"
            aria-label="افزودن با جزئیات"
          >
            <aio-icon name="lucideSlidersHorizontal" size="sm" />
          </button>
        </aio-input-group-addon>
      </form>

      @if (tasks.isLoading() && !tasks.hasValue()) {
        <div class="flex flex-col gap-2">
          <div aioSkeleton class="h-12 rounded-2xl"></div>
          <div aioSkeleton class="h-12 rounded-2xl"></div>
          <div aioSkeleton class="h-12 rounded-2xl"></div>
        </div>
      } @else {
        @for (section of sections(); track section.key) {
          <section class="flex flex-col gap-2" [attr.aria-label]="section.label">
            <h2
              class="flex items-center justify-between px-1 text-sm font-semibold"
              [class.text-destructive]="section.overdue"
              [class.text-muted-foreground]="!section.overdue"
            >
              <span>{{ section.label }}</span>
              <span class="font-normal">{{ fa(section.tasks.length) }}</span>
            </h2>
            <ul class="glass divide-border/60 flex flex-col divide-y rounded-2xl">
              @for (task of section.tasks; track task.id) {
                <ng-container
                  *ngTemplateOutlet="row; context: { $implicit: task }"
                />
              }
            </ul>
          </section>
        } @empty {
          @if (completed().length === 0) {
            <div aioEmpty class="glass rounded-2xl">
              <div aioEmptyHeader>
                <div aioEmptyMedia variant="icon" class="text-primary">
                  <aio-icon name="lucideCircleCheckBig" />
                </div>
                <h2 aioEmptyTitle>{{ emptyTitle() }}</h2>
                <p aioEmptyDescription>
                  کار تازه را در کادر بالا بنویسید و Enter بزنید.
                </p>
              </div>
            </div>
          } @else {
            <div
              class="glass text-muted-foreground flex items-center gap-3 rounded-2xl p-4 text-sm"
            >
              <aio-icon name="lucideCircleCheckBig" class="text-primary" />
              همه کارهای این فهرست انجام شده. آفرین!
            </div>
          }
        }

        @if (completed().length > 0) {
          <div aioCollapsible [(expanded)]="showCompleted">
            <button
              aioCollapsibleTrigger
              class="text-muted-foreground flex min-h-11 w-full items-center justify-between px-1 text-sm font-semibold"
            >
              <span>انجام‌شده، {{ fa(completed().length) }}</span>
              <aio-icon
                name="lucideChevronDown"
                size="sm"
                class="transition-transform"
                [class.rotate-180]="showCompleted()"
              />
            </button>
            <aio-collapsible-content>
              <ul
                class="glass divide-border/60 mt-2 flex flex-col divide-y rounded-2xl"
              >
                @for (task of completed(); track task.id) {
                  <ng-container
                    *ngTemplateOutlet="row; context: { $implicit: task }"
                  />
                }
              </ul>
            </aio-collapsible-content>
          </div>
        }
      }
    </div>

    <ng-template #row let-task>
      <li class="flex min-h-12 items-center gap-3 px-3">
        <aio-checkbox
          [checked]="task.done"
          (checkedChange)="toggle(task, $event)"
          [checkboxClass]="boxClass(task)"
          [aria-label]="'انجام شد: ' + task.title"
        />
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 self-stretch py-2.5 text-start"
          (click)="selected.set(task)"
        >
          <span class="flex min-w-0 flex-1 flex-col">
            <span
              class="truncate"
              [class.text-muted-foreground]="task.done"
              [class.line-through]="task.done"
              >{{ task.title }}</span
            >
            @if (task.notes && !task.done) {
              <span class="text-muted-foreground truncate text-xs">{{
                task.notes
              }}</span>
            }
          </span>
          <span
            class="text-muted-foreground shrink-0 text-xs"
            [class.text-destructive]="!task.done && task.date < today"
            >{{ when(task) }}</span
          >
        </button>
      </li>
    </ng-template>

    <aio-dialog
      [(open)]="adding"
      title="کار جدید"
      [description]="dateLabel(listDate())"
      contentClass="applet-planner"
    >
      <ng-template aioDialogBody>
        <planner-task-form
          [date]="listDate()"
          [title]="quickTitle()"
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

    <aio-dialog
      [open]="!!selected()"
      (openChange)="$event || selected.set(null)"
      [title]="selected()?.title ?? ''"
      [description]="selected() ? detailLine(selected()!) : ''"
      contentClass="applet-planner"
    >
      <ng-template aioDialogBody>
        @if (selected(); as task) {
          <div class="flex flex-col gap-5">
            @if (task.notes) {
              <p class="text-muted-foreground text-sm">{{ task.notes }}</p>
            }
            <div class="flex flex-col gap-2">
              <span class="text-sm font-medium">اولویت</span>
              <div
                aioToggleGroup
                type="single"
                variant="outline"
                class="w-full"
                [value]="task.priority"
                (valueChange)="setPriority(task, $event)"
              >
                @for (p of priorities; track p) {
                  <button aioToggleGroupItem [value]="p" class="h-10 flex-1">
                    <aio-icon
                      name="lucideFlag"
                      size="xs"
                      [class]="priorityFlag[p]"
                    />
                    {{ priorityLabels[p] }}
                  </button>
                }
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <span class="text-sm font-medium">انتقال به</span>
              <div class="grid grid-cols-3 gap-2">
                @for (move of moves; track move.label) {
                  <button
                    aioBtn
                    variant="outline"
                    [disabled]="task.date === move.date()"
                    (click)="moveTo(task, move.date())"
                  >
                    {{ move.label }}
                  </button>
                }
              </div>
            </div>
          </div>
        }
      </ng-template>
      <ng-template aioDialogActions>
        <button
          aioBtn
          variant="ghost"
          class="text-destructive"
          (click)="remove(selected()!)"
        >
          <aio-icon name="lucideTrash2" size="sm" />
          حذف
        </button>
        <button aioBtn (click)="selected.set(null)">بستن</button>
      </ng-template>
    </aio-dialog>
  `,
})
export class PlannerPage {
  private readonly api = inject(PlannerApi);
  private readonly confirm = inject(AioConfirm);

  protected readonly today = toIsoDate(new Date());
  private readonly tomorrow = addDays(this.today, 1);

  protected readonly lists: SmartList[] = ['today', 'tomorrow', 'week', 'all'];
  protected readonly listLabels: Record<SmartList, string> = {
    today: 'امروز',
    tomorrow: 'فردا',
    week: '۷ روز آینده',
    all: 'همه',
  };
  protected readonly priorities = [...TASK_PRIORITIES].reverse();
  protected readonly priorityLabels = TASK_PRIORITY_LABELS;
  protected readonly priorityFlag: Record<TaskPriority, string> = {
    LOW: 'text-muted-foreground',
    MEDIUM: 'text-primary',
    HIGH: 'text-destructive',
  };
  protected readonly moves = [
    { label: 'امروز', date: () => this.today },
    { label: 'فردا', date: () => this.tomorrow },
    { label: 'هفته بعد', date: () => addDays(this.today, 7) },
  ];

  protected readonly list = signal<SmartList>('today');
  protected readonly quickTitle = signal('');
  protected readonly adding = signal(false);
  protected readonly saving = signal(false);
  protected readonly selected = signal<PlannerTask | null>(null);
  protected readonly showCompleted = signal(false);

  protected readonly tasks = httpResource<PlannerTask[]>(() =>
    this.api.tasksUrl(
      addDays(this.today, -HISTORY_DAYS),
      addDays(this.today, FUTURE_DAYS),
    ),
  );
  private readonly all = computed(() =>
    (this.tasks.hasValue() ? this.tasks.value() : []).slice().sort(compareTasks),
  );

  /** Date range of each smart list; overdue open tasks join today/week/all. */
  private inList(task: PlannerTask, list: SmartList): boolean {
    const weekEnd = addDays(this.today, 6);
    switch (list) {
      case 'today':
        return task.date === this.today;
      case 'tomorrow':
        return task.date === this.tomorrow;
      case 'week':
        return task.date >= this.today && task.date <= weekEnd;
      case 'all':
        return task.date >= this.today;
    }
  }

  private readonly overdue = computed(() =>
    this.all().filter((t) => !t.done && t.date < this.today),
  );

  protected readonly counts = computed(() => {
    const open = this.all().filter((t) => !t.done);
    const overdue = this.overdue().length;
    return Object.fromEntries(
      this.lists.map((l) => [
        l,
        open.filter((t) => this.inList(t, l)).length +
          (l === 'tomorrow' ? 0 : overdue),
      ]),
    ) as Record<SmartList, number>;
  });

  protected readonly sections = computed<Section[]>(() => {
    const list = this.list();
    const open = this.all().filter((t) => !t.done && this.inList(t, list));
    const result: Section[] = [];
    if (list !== 'tomorrow' && this.overdue().length) {
      result.push({
        key: 'overdue',
        label: 'عقب‌افتاده',
        overdue: true,
        tasks: this.overdue(),
      });
    }
    if (list === 'today' || list === 'tomorrow') {
      if (open.length)
        result.push({ key: list, label: this.listLabels[list], tasks: open });
      return result;
    }
    // Group by day for the next 7 days; "all" puts the rest under "later".
    const groups = new Map<string, PlannerTask[]>();
    const weekEnd = addDays(this.today, 6);
    for (const task of open) {
      const key = task.date > weekEnd ? 'later' : task.date;
      groups.set(key, [...(groups.get(key) ?? []), task]);
    }
    for (const [key, tasks] of groups) {
      result.push({
        key,
        label: key === 'later' ? 'بعدتر' : this.dayName(key),
        tasks,
      });
    }
    return result;
  });

  protected readonly completed = computed(() =>
    this.all().filter((t) => t.done && this.inList(t, this.list())),
  );

  /** Date a new task gets from the current list. */
  protected readonly listDate = computed(() =>
    this.list() === 'tomorrow' ? this.tomorrow : this.today,
  );
  protected readonly quickPlaceholder = computed(
    () => `افزودن کار به «${this.listLabels[this.list()]}»`,
  );
  protected readonly subtitle = computed(() => {
    const open = this.counts()[this.list()];
    const date =
      this.list() === 'today' || this.list() === 'tomorrow'
        ? `${this.dateLabel(this.listDate())}، `
        : '';
    return open ? `${date}${faNumber(open)} کار مانده` : `${date}کاری نمانده`;
  });
  protected readonly emptyTitle = computed(() =>
    this.list() === 'tomorrow'
      ? 'برای فردا هنوز برنامه‌ای نیست'
      : 'فهرست خالی است',
  );

  protected readonly fa = (n: number) => faNumber(n);

  protected boxClass(task: PlannerTask) {
    // The ::after pseudo-element widens the tap target to 44px around the 20px circle.
    return `relative size-5 rounded-full border-2 after:absolute after:-inset-3 after:content-[''] ${PRIORITY_BOX[task.priority]}`;
  }

  protected dateLabel(iso: string) {
    return faDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  protected dayName(iso: string) {
    if (iso === this.today) return 'امروز';
    if (iso === this.tomorrow) return 'فردا';
    return this.dateLabel(iso);
  }

  private faTime(time: string) {
    return time.replace(/\d/g, (d) => faNumber(Number(d)));
  }

  /** Trailing meta of a row: time on its own day, otherwise a short date. */
  protected when(task: PlannerTask): string {
    const showDate =
      task.date !== this.today &&
      !(this.list() === 'tomorrow' && task.date === this.tomorrow);
    const parts = [];
    if (showDate)
      parts.push(
        task.date === this.tomorrow
          ? 'فردا'
          : faDate(task.date, { day: 'numeric', month: 'short' }),
      );
    if (task.time) parts.push(this.faTime(task.time));
    return parts.join('، ');
  }

  protected detailLine(task: PlannerTask): string {
    return [
      this.dayName(task.date),
      task.time ? this.faTime(task.time) : null,
      PLANNER_AREA_LABELS[task.area],
    ]
      .filter(Boolean)
      .join('، ');
  }

  protected selectList(value: unknown) {
    if (typeof value === 'string') this.list.set(value as SmartList);
  }

  protected quickAdd() {
    const title = this.quickTitle().trim();
    if (!title) {
      this.adding.set(true);
      return;
    }
    void this.create({ title, date: this.listDate() });
  }

  protected async create(input: CreateTaskInput) {
    this.saving.set(true);
    try {
      const task = await this.api.create(input);
      this.tasks.update((list) => [...(list ?? []), task]);
      this.adding.set(false);
      this.quickTitle.set('');
      if (!this.inList(task, this.list())) {
        aioToast.success(`به «${this.dayName(task.date)}» اضافه شد`);
      }
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected toggle(task: PlannerTask, done: boolean) {
    void this.patch(task, { done });
  }

  protected setPriority(task: PlannerTask, value: unknown) {
    if (typeof value === 'string' && value !== task.priority)
      void this.patch(task, { priority: value as TaskPriority });
  }

  protected async moveTo(task: PlannerTask, date: string) {
    await this.patch(task, { date });
    this.selected.set(null);
    aioToast.success(`به «${this.dayName(date)}» منتقل شد`);
  }

  protected async remove(task: PlannerTask) {
    this.selected.set(null);
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

  /** Optimistic update; rolls back on error. */
  private async patch(
    task: PlannerTask,
    change: Partial<Pick<PlannerTask, 'done' | 'priority' | 'date'>>,
  ) {
    this.replace({ ...task, ...change });
    if (this.selected()?.id === task.id)
      this.selected.set({ ...task, ...change });
    try {
      const saved = await this.api.update(task.id, change);
      this.replace(saved);
      if (this.selected()?.id === task.id) this.selected.set(saved);
    } catch (error) {
      this.replace(task);
      aioToast.error(apiErrorMessage(error));
    }
  }

  private replace(task: PlannerTask) {
    this.tasks.update((list) =>
      (list ?? []).map((t) => (t.id === task.id ? task : t)),
    );
  }
}
