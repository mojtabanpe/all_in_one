import { RecurrenceEditor } from './recurrence-editor';
import { NgTemplateOutlet } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  addDays,
  compareTasks,
  type CreateTaskInput,
  parseQuickAdd,
  type PlannerColor,
  type PlannerFolder,
  type PlannerList,
  type PlannerTag,
  type PlannerTask,
  type TaskPriority,
  toIsoDate,
} from '@all-in-one/applets/planner/contracts';
import {
  AioButton,
  AioCheckbox,
  AioCollapsibleDirectives,
  AioConfirm,
  AioDialog,
  AioDialogBody,
  AioDialogActions,
  AioEmptyDirectives,
  AioIcon,
  AioInputGroupDirectives,
  AioSkeleton,
  aioToast,
  provideIcons,
} from '@all-in-one/ui';
import {
  apiErrorMessage,
  AuthStore,
  faDate,
  faNumber,
} from '@all-in-one/web/shared';
import {
  lucideChevronDown,
  lucideCircleCheckBig,
  lucideEllipsis,
  lucideListChecks,
  lucideMessageSquare,
  lucideMenu,
  lucidePlus,
  lucideRotateCcw,
  lucideRepeat2,
  lucideStickyNote,
  lucideCircleSlash,
  lucideTrash2,
} from '@ng-icons/lucide';
import { TONE } from './colors';
import { ListSettings, TagSettings } from './list-settings';
import { ListsSheet, SMART_VIEWS } from './lists-sheet';
import { PlannerApi } from './planner-api';
import { TaskDetail } from './task-detail';

interface Group {
  key: string;
  label: string;
  overdue?: boolean;
  tasks: PlannerTask[];
}

/** Round checkbox colours by priority (TickTick): none grey, low blue, medium amber, high red. */
const PRIORITY_BOX: Record<TaskPriority, string> = {
  NONE: 'border-muted-foreground/50 data-checked:bg-muted-foreground data-checked:border-muted-foreground',
  LOW: 'border-sky-600 data-checked:bg-sky-600 data-checked:border-sky-600',
  MEDIUM:
    'border-amber-600 bg-amber-500/8 data-checked:bg-amber-600 data-checked:border-amber-600',
  HIGH: 'border-destructive bg-destructive/8 data-checked:bg-destructive data-checked:border-destructive',
};

const DONE_DAYS = 30;

/**
 * TickTick's task screen: a smart list, list or tag (picked in the lists
 * sheet), quick add with #tag / !1 / «فردا», rows grouped by day or section,
 * a collapsible "completed" part, the trash, and the task detail sheet.
 */
@Component({
  selector: 'planner-tasks-page',
  imports: [
    RecurrenceEditor,
    AioButton,
    AioCheckbox,
    AioCollapsibleDirectives,
    AioDialog,
    AioDialogBody,
    AioDialogActions,
    AioEmptyDirectives,
    AioIcon,
    AioInputGroupDirectives,
    AioSkeleton,
    ListSettings,
    ListsSheet,
    NgTemplateOutlet,
    TagSettings,
    TaskDetail,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideCircleCheckBig,
      lucideEllipsis,
      lucideListChecks,
      lucideMessageSquare,
      lucideMenu,
      lucidePlus,
      lucideRotateCcw,
      lucideRepeat2,
      lucideStickyNote,
      lucideCircleSlash,
      lucideTrash2,
    }),
  ],
  template: `
    <header class="flex items-center gap-2">
      <button
        aioBtn
        variant="ghost"
        class="h-auto min-h-11 flex-1 justify-start gap-3 px-2 text-start"
        (click)="listsOpen.set(true)"
        aria-label="انتخاب فهرست"
      >
        <aio-icon name="lucideMenu" class="text-primary" />
        <span class="flex flex-col">
          <span class="text-2xl font-bold">{{ title() }}</span>
          <span class="text-muted-foreground text-sm font-normal">{{
            subtitle()
          }}</span>
        </span>
      </button>
      @if (currentList(); as l) {
        <button
          aioBtn
          variant="ghost"
          size="icon"
          [attr.aria-label]="'تنظیم فهرست ' + l.name"
          (click)="settingsListId.set(l.id)"
        >
          <aio-icon name="lucideEllipsis" />
        </button>
      }
    </header>

    @if (view() !== 'trash' && view() !== 'completed') {
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
          [placeholder]="'افزودن به «' + title() + '»؛ #برچسب !۱ فردا'"
          [value]="quickTitle()"
          (input)="quickTitle.set($any($event.target).value)"
          aria-label="عنوان کار جدید"
        />
      </form>
      <button
        aioBtn
        variant="ghost"
        type="button"
        class="self-start"
        [attr.aria-expanded]="recurrenceOpen()"
        (click)="recurrenceOpen.set(!recurrenceOpen())"
      >
        ↻ تنظیم تکرار کار جدید
      </button>
      @if (recurrenceOpen()) {
        <planner-recurrence-editor
          prefix="quick-repeat-"
          [value]="quickRecurrence()"
          (changed)="quickRecurrence.set($event)"
        />
      }
    }

    @if (loading()) {
      <div class="flex flex-col gap-2">
        <div aioSkeleton class="h-12 rounded-2xl"></div>
        <div aioSkeleton class="h-12 rounded-2xl"></div>
        <div aioSkeleton class="h-12 rounded-2xl"></div>
      </div>
    } @else if (view() === 'trash') {
      @if (trash().length) {
        <ul class="glass divide-border/60 flex flex-col divide-y rounded-2xl">
          @for (task of trash(); track task.id) {
            <li class="flex min-h-12 items-center gap-2 ps-4 pe-1">
              <span class="text-muted-foreground flex-1 truncate">{{
                task.title
              }}</span>
              <button
                aioBtn
                variant="ghost"
                size="icon"
                [attr.aria-label]="'بازگرداندن ' + task.title"
                (click)="restore(task)"
              >
                <aio-icon name="lucideRotateCcw" size="sm" />
              </button>
              <button
                aioBtn
                variant="ghost"
                size="icon"
                class="text-destructive"
                [attr.aria-label]="'حذف همیشگی ' + task.title"
                (click)="purge(task)"
              >
                <aio-icon name="lucideTrash2" size="sm" />
              </button>
            </li>
          }
        </ul>
        <button
          aioBtn
          variant="outline"
          class="text-destructive self-start"
          (click)="emptyTrash()"
        >
          خالی کردن سطل زباله
        </button>
      } @else {
        <ng-container
          *ngTemplateOutlet="
            empty;
            context: {
              title: 'سطل زباله خالی است',
              text: 'کارهای حذف‌شده اینجا می‌مانند تا برشان گردانی.',
            }
          "
        />
      }
    } @else {
      @for (group of groups(); track group.key) {
        <section class="flex flex-col gap-2" [attr.aria-label]="group.label">
          <h2
            class="flex items-center justify-between px-1 text-sm font-semibold"
            [class.text-destructive]="group.overdue"
            [class.text-muted-foreground]="!group.overdue"
          >
            <span>{{ group.label }}</span>
            <span class="font-normal">{{ fa(group.tasks.length) }}</span>
          </h2>
          <ul class="glass divide-border/60 flex flex-col divide-y rounded-2xl">
            @for (task of group.tasks; track task.id) {
              <ng-container
                *ngTemplateOutlet="row; context: { $implicit: task }"
              />
            }
          </ul>
        </section>
      } @empty {
        @if (view() === 'completed') {
          <ng-container
            *ngTemplateOutlet="
              empty;
              context: {
                title: 'در ۳۰ روز گذشته کاری انجام نشده',
                text: 'کارهای تیک‌خورده اینجا جمع می‌شوند.',
              }
            "
          />
        } @else if (completed().length === 0) {
          <ng-container
            *ngTemplateOutlet="
              empty;
              context: {
                title: emptyTitle(),
                text: 'کار تازه را در کادر بالا بنویسید و Enter بزنید.',
              }
            "
          />
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

    <ng-template #empty let-title="title" let-text="text">
      <div aioEmpty class="glass rounded-2xl">
        <div aioEmptyHeader>
          <div aioEmptyMedia variant="icon" class="text-primary">
            <aio-icon name="lucideCircleCheckBig" />
          </div>
          <h2 aioEmptyTitle>{{ title }}</h2>
          <p aioEmptyDescription>{{ text }}</p>
        </div>
      </div>
    </ng-template>

    <ng-template #row let-task>
      <li class="flex min-h-12 items-center gap-3 px-3">
        @if (task.kind === 'NOTE') {
          <aio-icon
            name="lucideStickyNote"
            size="sm"
            class="text-muted-foreground"
          />
        } @else if (task.wontDo) {
          <span
            role="img"
            class="text-muted-foreground flex size-5 items-center justify-center"
            aria-label="انجامش نمی‌دهم"
            title="انجامش نمی‌دهم"
            ><aio-icon name="lucideCircleSlash" size="sm"
          /></span>
        } @else {
          <aio-checkbox
            [checked]="task.done"
            (checkedChange)="toggle(task, $event)"
            [checkboxClass]="boxClass(task)"
            [aria-label]="'انجام شد: ' + task.title"
          />
        }
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 self-stretch py-2.5 text-start"
          (click)="selectedId.set(task.id)"
        >
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              class="truncate"
              [class.text-muted-foreground]="task.done"
              [class.line-through]="task.done"
              >{{ task.title }}</span
            >
            @if (meta(task); as m) {
              <span
                class="text-muted-foreground flex items-center gap-2 truncate text-xs"
              >
                @if (m.list) {
                  <span class="flex items-center gap-1">
                    <span [class]="'size-2 rounded-full ' + m.dot"></span
                    >{{ m.list }}
                  </span>
                }
                @if (m.items) {
                  <span class="flex items-center gap-0.5"
                    ><aio-icon name="lucideListChecks" size="xs" />{{
                      m.items
                    }}</span
                  >
                }
                @if (task.commentCount) {
                  <span class="flex items-center gap-0.5"
                    ><aio-icon name="lucideMessageSquare" size="xs" />{{
                      fa(task.commentCount)
                    }}</span
                  >
                }
                @for (tag of task.tags.slice(0, 2); track tag) {
                  <span class="text-primary">#{{ tag }}</span>
                }
              </span>
            }
          </span>
          <span
            class="text-muted-foreground flex shrink-0 items-center gap-1 text-xs"
            [class.text-destructive]="isOverdue(task)"
          >
            {{ when(task) }}
            @if (task.repeatRule && !task.recurrenceNeedsReview) {
              <span role="img" aria-label="کار تکراری" title="کار تکراری"
                ><aio-icon name="lucideRepeat2" size="xs"
              /></span>
            }
          </span>
        </button>
      </li>
    </ng-template>

    <aio-dialog
      [(open)]="listsOpen"
      title="فهرست‌ها"
      contentClass="applet-planner sm:max-w-md"
    >
      <ng-template aioDialogBody>
        <planner-lists-sheet
          [lists]="lists()"
          [folders]="folders()"
          [tags]="tags()"
          [counts]="counts()"
          [view]="view()"
          (picked)="go($event)"
          (editList)="listsOpen.set(false); settingsListId.set($event.id)"
          (editTag)="listsOpen.set(false); editingTag.set($event)"
          (changed)="reloadMeta()"
        />
      </ng-template>
    </aio-dialog>

    <aio-dialog
      [open]="!!selected()"
      (openChange)="$event || selectedId.set(null)"
      title="جزئیات کار"
      [description]="selected() ? listName(selected()!.listId) : ''"
      contentClass="applet-planner sm:max-w-lg"
    >
      <ng-template aioDialogBody>
        @if (selected(); as task) {
          <planner-task-detail
            [task]="task"
            [lists]="lists()"
            (changed)="replace($event); reloadMeta()"
            (trashed)="trashTask($event)"
            (focusRequested)="startFocus($event)"
          />
        }
      </ng-template>
      <ng-template aioDialogActions>
        <button
          aioBtn
          type="button"
          variant="outline"
          class="w-full rounded-[12px]"
          (click)="selectedId.set(null)"
        >
          بستن جزئیات
        </button>
      </ng-template>
    </aio-dialog>

    <aio-dialog
      [open]="!!settingsListId()"
      (openChange)="$event || settingsListId.set(null)"
      title="تنظیم فهرست"
      contentClass="applet-planner sm:max-w-md"
    >
      <ng-template aioDialogBody>
        @if (settingsListId(); as id) {
          <planner-list-settings
            [listId]="id"
            [folders]="folders()"
            (changed)="reloadMeta()"
            (removed)="settingsListId.set(null); go('today')"
          />
        }
      </ng-template>
    </aio-dialog>

    <aio-dialog
      [open]="!!editingTag()"
      (openChange)="$event || editingTag.set(null)"
      [title]="'برچسب #' + (editingTag()?.name ?? '')"
      contentClass="applet-planner sm:max-w-md"
    >
      <ng-template aioDialogBody>
        @if (editingTag(); as tag) {
          <planner-tag-settings
            [tag]="tag"
            (changed)="tagChanged(tag, $event)"
          />
        }
      </ng-template>
    </aio-dialog>
  `,
  host: { class: 'flex flex-col gap-5' },
})
export class TasksPage {
  private readonly api = inject(PlannerApi);
  private readonly confirm = inject(AioConfirm);
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly today = toIsoDate(new Date());
  private readonly tomorrow = addDays(this.today, 1);
  private readonly weekEnd = addDays(this.today, 6);

  private readonly query = toSignal(this.route.queryParamMap);
  protected readonly view = computed(() => this.query()?.get('v') || 'today');

  protected readonly listsOpen = signal(false);
  protected readonly selectedId = linkedSignal(
    () => this.query()?.get('task') ?? null,
  );
  protected readonly settingsListId = signal<string | null>(null);
  protected readonly editingTag = signal<PlannerTag | null>(null);
  protected readonly quickTitle = signal('');
  protected readonly recurrenceOpen = signal(false);
  protected readonly quickRecurrence = signal<Partial<CreateTaskInput>>({});
  protected readonly showCompleted = signal(false);

  private readonly base = this.api.base;
  private readonly listsRes = httpResource<PlannerList[]>(
    () => `${this.base}/lists`,
  );
  private readonly foldersRes = httpResource<PlannerFolder[]>(
    () => `${this.base}/folders`,
  );
  private readonly tagsRes = httpResource<PlannerTag[]>(
    () => `${this.base}/tags`,
  );
  private readonly openRes = httpResource<PlannerTask[]>(() =>
    this.api.url('/tasks', { status: 'open', limit: '500' }),
  );
  private readonly datedRes = httpResource<PlannerTask[]>(() => {
    const view = this.view();
    if (view.startsWith('list:'))
      return this.api.url('/tasks', {
        status: 'open',
        listIds: view.slice(5),
        limit: '500',
      });
    if (view.startsWith('tag:'))
      return this.api.url('/tasks', {
        status: 'open',
        tags: view.slice(4),
        limit: '500',
      });
    if (view === 'assigned')
      return this.api.url('/tasks', {
        status: 'open',
        assigneeId: 'me',
        limit: '500',
      });
    if (!['today', 'tomorrow', 'week'].includes(view)) return undefined;
    return this.api.url('/tasks', {
      status: 'open',
      from: view === 'tomorrow' ? this.tomorrow : this.today,
      to:
        view === 'week'
          ? this.weekEnd
          : view === 'tomorrow'
            ? this.tomorrow
            : this.today,
      limit: '500',
    });
  });
  private readonly doneRes = httpResource<PlannerTask[]>(() =>
    this.api.url('/tasks/completed', {
      from: addDays(this.today, -DONE_DAYS),
      to: this.today,
    }),
  );
  private readonly trashRes = httpResource<PlannerTask[]>(() =>
    this.view() === 'trash' ? `${this.base}/trash` : undefined,
  );

  protected readonly lists = computed(() =>
    this.listsRes.hasValue() ? this.listsRes.value() : [],
  );
  protected readonly folders = computed(() =>
    this.foldersRes.hasValue() ? this.foldersRes.value() : [],
  );
  protected readonly tags = computed(() =>
    this.tagsRes.hasValue() ? this.tagsRes.value() : [],
  );
  protected readonly trash = linkedSignal(() =>
    this.trashRes.hasValue() ? this.trashRes.value() : [],
  );

  /** Open tasks plus the last 30 days' completed ones; edited in place. */
  private readonly tasks = linkedSignal<PlannerTask[]>(() => {
    const allOpen = [
      ...(this.openRes.hasValue() ? this.openRes.value() : []),
      ...(this.datedRes.hasValue() ? this.datedRes.value() : []),
    ];
    const open = [...new Map(allOpen.map((t) => [t.id, t])).values()];
    const done = this.doneRes.hasValue() ? this.doneRes.value() : [];
    const seen = new Set(open.map((t) => t.id));
    return [...open, ...done.filter((t) => !seen.has(t.id))];
  });

  protected readonly loading = computed(() =>
    this.view() === 'trash'
      ? this.trashRes.isLoading() && !this.trashRes.hasValue()
      : this.openRes.isLoading() && !this.openRes.hasValue(),
  );

  private readonly selectedRes = httpResource<PlannerTask>(() => {
    const id = this.selectedId();
    return id && !this.tasks().some((t) => t.id === id)
      ? `${this.base}/tasks/${encodeURIComponent(id)}`
      : undefined;
  });

  protected readonly selected = computed(
    () =>
      this.tasks().find((t) => t.id === this.selectedId()) ??
      (this.selectedId() && this.selectedRes.hasValue()
        ? this.selectedRes.value()
        : null),
  );
  protected readonly currentList = computed(() => {
    const v = this.view();
    return v.startsWith('list:')
      ? this.lists().find((l) => l.id === v.slice(5))
      : undefined;
  });

  protected readonly title = computed(() => {
    const v = this.view();
    if (v === 'completed') return 'انجام‌شده';
    if (v === 'trash') return 'سطل زباله';
    if (v.startsWith('tag:')) return `#${v.slice(4)}`;
    if (v.startsWith('list:')) return this.currentList()?.name ?? 'فهرست';
    return SMART_VIEWS.find((s) => s.key === v)?.label ?? 'امروز';
  });

  private matches(task: PlannerTask, view: string): boolean {
    if (view.startsWith('list:')) return task.listId === view.slice(5);
    if (view.startsWith('tag:')) return task.tags.includes(view.slice(4));
    if (view === 'assigned') return task.assigneeId === this.auth.user()?.id;
    const d = task.date;
    switch (view) {
      case 'today':
        return d === this.today;
      case 'tomorrow':
        return d === this.tomorrow;
      case 'week':
        return !!d && d >= this.today && d <= this.weekEnd;
      case 'all':
        return true;
      default:
        return false;
    }
  }

  /** Overdue open tasks join today, the week and all (TickTick). */
  private readonly overdue = computed(() =>
    this.tasks()
      .filter(
        (t) => !t.done && t.kind === 'TASK' && !!t.date && t.date < this.today,
      )
      .sort(compareTasks),
  );

  private withOverdue(view: string) {
    return view === 'today' || view === 'week';
  }

  protected readonly counts = computed(() => {
    const open = this.tasks().filter((t) => !t.done);
    const overdue = this.overdue().length;
    return Object.fromEntries(
      SMART_VIEWS.map((v) => [
        v.key,
        open.filter(
          (t) =>
            this.matches(t, v.key) &&
            !(this.withOverdue(v.key) && this.isOverdue(t)),
        ).length + (this.withOverdue(v.key) ? overdue : 0),
      ]),
    ) as Record<string, number>;
  });

  protected readonly groups = computed<Group[]>(() => {
    const view = this.view();
    if (view === 'completed') return this.completedGroups();
    const open = this.tasks()
      .filter((t) => !t.done && this.matches(t, view))
      .sort(compareTasks);
    const groups: Group[] = [];
    const overdueFirst = this.withOverdue(view) || view === 'all';
    if (overdueFirst && this.overdue().length)
      groups.push({
        key: 'overdue',
        label: 'عقب‌افتاده',
        overdue: true,
        tasks: this.overdue(),
      });
    const rest = overdueFirst ? open.filter((t) => !this.isOverdue(t)) : open;

    const list = this.currentList();
    if (list && list.sections.length) {
      const bySection = (id: string | null) =>
        rest.filter((t) => t.sectionId === id);
      const loose = bySection(null);
      if (loose.length)
        groups.push({ key: 'none', label: 'بدون بخش', tasks: loose });
      for (const s of list.sections) {
        const tasks = bySection(s.id);
        if (tasks.length) groups.push({ key: s.id, label: s.name, tasks });
      }
      return groups;
    }
    if (view === 'week' || view === 'all') {
      const byKey = new Map<string, PlannerTask[]>();
      for (const task of rest) {
        const key = !task.date
          ? 'undated'
          : task.date > this.weekEnd
            ? 'later'
            : task.date;
        byKey.set(key, [...(byKey.get(key) ?? []), task]);
      }
      const order = (k: string) =>
        k === 'undated' ? 'z2' : k === 'later' ? 'z1' : k;
      for (const key of [...byKey.keys()].sort((a, b) =>
        order(a) < order(b) ? -1 : 1,
      ))
        groups.push({
          key,
          label:
            key === 'undated'
              ? 'بدون تاریخ'
              : key === 'later'
                ? 'بعدتر'
                : this.dayName(key),
          tasks: byKey.get(key) ?? [],
        });
      return groups;
    }
    if (rest.length)
      groups.push({
        key: view,
        label: view === 'today' ? 'امروز' : this.title(),
        tasks: rest,
      });
    return groups;
  });

  private completedGroups(): Group[] {
    const done = this.tasks()
      .filter((t) => t.done && t.completedAt)
      .sort((a, b) => ((a.completedAt ?? '') < (b.completedAt ?? '') ? 1 : -1));
    const byDay = new Map<string, PlannerTask[]>();
    for (const task of done) {
      const day = toIsoDate(new Date(task.completedAt ?? ''));
      byDay.set(day, [...(byDay.get(day) ?? []), task]);
    }
    return [...byDay].map(([key, tasks]) => ({
      key,
      label: this.dayName(key),
      tasks,
    }));
  }

  protected readonly completed = computed(() => {
    const view = this.view();
    if (view === 'completed' || view === 'trash') return [];
    return this.tasks().filter((t) => t.done && this.matches(t, view));
  });

  protected readonly subtitle = computed(() => {
    const v = this.view();
    if (v === 'trash') return `${faNumber(this.trash().length)} کار`;
    if (v === 'completed') return '۳۰ روز گذشته';
    const open = this.groups().reduce((n, g) => n + g.tasks.length, 0);
    const date =
      v === 'today' || v === 'tomorrow'
        ? `${this.dateLabel(v === 'today' ? this.today : this.tomorrow)}، `
        : '';
    return open ? `${date}${faNumber(open)} کار مانده` : `${date}کاری نمانده`;
  });

  protected readonly emptyTitle = computed(() =>
    this.view() === 'tomorrow'
      ? 'برای فردا هنوز برنامه‌ای نیست'
      : 'فهرست خالی است',
  );

  protected readonly fa = (n: number) => faNumber(n);

  protected isOverdue(task: PlannerTask) {
    return (
      !task.done &&
      task.kind === 'TASK' &&
      !!task.date &&
      task.date < this.today
    );
  }

  protected boxClass(task: PlannerTask) {
    // The ::after pseudo-element widens the tap target to 44px around the 20px circle.
    return `relative size-5 rounded-full border-2 after:absolute after:-inset-3 after:content-[''] ${PRIORITY_BOX[task.priority as TaskPriority]}`;
  }

  protected listName(id: string) {
    return this.lists().find((l) => l.id === id)?.name ?? '';
  }

  protected meta(task: PlannerTask) {
    const showList = !this.view().startsWith('list:');
    const list = showList
      ? this.lists().find((l) => l.id === task.listId)
      : undefined;
    const items = task.checklist.length
      ? `${faNumber(task.checklist.filter((i) => i.done).length)}/${faNumber(task.checklist.length)}`
      : '';
    if (!list && !items && !task.commentCount && !task.tags.length) return null;
    return {
      list: list && !list.isInbox ? list.name : '',
      dot: list ? TONE[list.color as PlannerColor].dot : '',
      items,
    };
  }

  protected dateLabel(iso: string) {
    return faDate(iso, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  protected dayName(iso: string) {
    if (iso === this.today) return 'امروز';
    if (iso === this.tomorrow) return 'فردا';
    if (iso === addDays(this.today, -1)) return 'دیروز';
    return this.dateLabel(iso);
  }

  private faTime(time: string) {
    return time.replace(/\d/g, (d) => faNumber(Number(d)));
  }

  /** Trailing meta of a row: date (unless it is the list's own day) and time. */
  protected when(task: PlannerTask): string {
    const parts = [];
    const own =
      (this.view() === 'today' && task.date === this.today) ||
      (this.view() === 'tomorrow' && task.date === this.tomorrow);
    if (task.date && !own)
      parts.push(
        task.date === this.today
          ? 'امروز'
          : task.date === this.tomorrow
            ? 'فردا'
            : faDate(task.date, { day: 'numeric', month: 'short' }),
      );
    if (task.time) parts.push(this.faTime(task.time));
    if (task.recurrenceNeedsReview) parts.push('نیازمند تأیید برنامه تکرار');
    if (task.durationMin)
      parts.push(task.durationMin.toLocaleString('fa-IR') + ' دقیقه');
    return parts.join('، ');
  }

  protected go(view: string) {
    this.listsOpen.set(false);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { v: view === 'today' ? null : view },
    });
  }

  protected reloadMeta() {
    this.listsRes.reload();
    this.foldersRes.reload();
    this.tagsRes.reload();
  }

  protected quickAdd() {
    const parsed = parseQuickAdd(this.quickTitle(), this.today);
    if (!parsed.title) return;
    const v = this.view();
    const input: CreateTaskInput = {
      ...this.quickRecurrence(),
      title: parsed.title,
    };
    const date =
      parsed.date ??
      (v === 'today' || v === 'week'
        ? this.today
        : v === 'tomorrow'
          ? this.tomorrow
          : undefined);
    if (date) input.date = date;
    else if (input.repeatRule) input.date = this.today;
    if (parsed.priority) input.priority = parsed.priority;
    const tags = [
      ...parsed.tags,
      ...(v.startsWith('tag:') ? [v.slice(4)] : []),
    ];
    if (tags.length) input.tags = [...new Set(tags)];
    if (v.startsWith('list:')) input.listId = v.slice(5);
    if (v === 'assigned') input.assigneeId = this.auth.user()?.id;
    void this.create(input);
  }

  private async create(input: CreateTaskInput) {
    try {
      const task = await this.api.createTask(input);
      this.tasks.update((list) => [...list, task]);
      this.quickTitle.set('');
      this.quickRecurrence.set({});
      this.recurrenceOpen.set(false);
      if (task.isSeries) {
        this.openRes.reload();
        this.datedRes.reload();
      }
      if (!this.matches(task, this.view()))
        aioToast.success(
          task.date
            ? `به «${this.dayName(task.date)}» اضافه شد`
            : `به «${this.listName(task.listId)}» اضافه شد`,
        );
      this.reloadMeta();
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

  /** Optimistic; rolls back on error. */
  protected async toggle(task: PlannerTask, done: boolean) {
    this.replace({
      ...task,
      done,
      completedAt: done ? new Date().toISOString() : null,
    });
    try {
      this.replace(await this.api.updateTask(task.id, { done }));
      if (done) aioToast.success('کار انجام شد', task.title);
      this.listsRes.reload();
      if (task.repeatRule) {
        this.openRes.reload();
        this.datedRes.reload();
        this.doneRes.reload();
      }
    } catch (error) {
      this.replace(task);
      aioToast.error(apiErrorMessage(error));
    }
  }

  protected replace(task: PlannerTask) {
    if (task.isSeries) {
      this.selectedId.set(null);
      this.openRes.reload();
      this.datedRes.reload();
      this.doneRes.reload();
      return;
    }
    if (this.selectedRes.hasValue() && this.selectedRes.value().id === task.id)
      this.selectedRes.value.set(task);
    this.tasks.update((list) => list.map((t) => (t.id === task.id ? task : t)));
  }

  protected async trashTask(task: PlannerTask) {
    this.selectedId.set(null);
    try {
      await this.api.trashTask(task.id);
      this.tasks.update((list) => list.filter((t) => t.id !== task.id));
      this.listsRes.reload();
      aioToast.action(
        'به سطل زباله رفت',
        'بازگرداندن',
        () => void this.restore(task),
      );
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

  protected async restore(task: PlannerTask) {
    try {
      const restored = await this.api.restoreTask(task.id);
      this.trash.update((list) => list.filter((t) => t.id !== task.id));
      this.tasks.update((list) => [
        ...list.filter((t) => t.id !== task.id),
        restored,
      ]);
      this.listsRes.reload();
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

  protected async purge(task: PlannerTask) {
    const ok = await this.confirm.ask({
      title: 'برای همیشه حذف شود؟',
      description: task.title,
      confirmText: 'حذف همیشگی',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.api.purgeTask(task.id);
      this.trash.update((list) => list.filter((t) => t.id !== task.id));
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

  protected async emptyTrash() {
    const ok = await this.confirm.ask({
      title: 'سطل زباله خالی شود؟',
      description: 'همه کارهای داخلش برای همیشه حذف می‌شوند.',
      confirmText: 'خالی کن',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.api.emptyTrash();
      this.trash.set([]);
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

  protected startFocus(task: PlannerTask) {
    this.selectedId.set(null);
    void this.router.navigate(['focus'], {
      relativeTo: this.route.parent,
      queryParams: { task: task.id },
    });
  }

  protected tagChanged(old: PlannerTag, tag: PlannerTag | null) {
    this.editingTag.set(tag);
    if (!tag || tag.name !== old.name) {
      // Tag names live on the tasks: reload them.
      this.openRes.reload();
      this.doneRes.reload();
      if (this.view() === `tag:${old.name}`)
        this.go(tag ? `tag:${tag.name}` : 'today');
    }
    this.tagsRes.reload();
  }
}
