import { RecurrenceEditor } from './recurrence-editor';
import { httpResource } from '@angular/common/http';
import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  addDays,
  type PlannerComment,
  type PlannerList,
  type PlannerListDetail,
  type PlannerTask,
  type TaskPriority,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  toIsoDate,
  type UpdateTaskInput,
} from '@all-in-one/applets/planner/contracts';
import {
  AioButton,
  AioDateInput,
  AioCheckbox,
  AioFieldDirectives,
  AioIcon,
  AioInput,
  AioInputGroupDirectives,
  AioNativeSelect,
  AioNativeSelectDirectives,
  AioSpinner,
  AioSwitch,
  AioTextarea,
  aioToast,
  AioToggleGroupDirectives,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage, faDate } from '@all-in-one/web/shared';
import {
  lucideFlag,
  lucidePlus,
  lucideSend,
  lucideSparkles,
  lucideTimer,
  lucideTrash2,
  lucideX,
} from '@ng-icons/lucide';
import { PlannerApi } from './planner-api';

export const PRIORITY_FLAG: Record<TaskPriority, string> = {
  NONE: 'text-muted-foreground/60',
  LOW: 'text-sky-600',
  MEDIUM: 'text-amber-600',
  HIGH: 'text-destructive',
};

/**
 * Everything about one task (TickTick's detail pane): title, description,
 * date and time, priority, list and section, tags, checklist, assignee and
 * comments. Each change is saved at once and emitted.
 */
@Component({
  selector: 'planner-task-detail',
  imports: [
    RecurrenceEditor,
    AioButton,
    AioDateInput,
    AioCheckbox,
    AioFieldDirectives,
    AioIcon,
    AioInput,
    AioInputGroupDirectives,
    AioNativeSelect,
    AioNativeSelectDirectives,
    AioSpinner,
    AioSwitch,
    AioTextarea,
    AioToggleGroupDirectives,
  ],
  providers: [
    provideIcons({
      lucideFlag,
      lucidePlus,
      lucideSend,
      lucideSparkles,
      lucideTimer,
      lucideTrash2,
      lucideX,
    }),
  ],
  host: { class: 'block min-w-0 w-full' },
  template: `
    @let t = task();
    <div
      class="flex min-w-0 flex-col gap-5 pb-2 [overflow-wrap:anywhere] [&_[data-slot=field]]:min-w-0 [&_[data-slot=field]]:gap-2"
    >
      <div aioField>
        <label aioFieldLabel for="task-title">عنوان</label>
        <input
          aioInput
          id="task-title"
          dir="auto"
          [value]="t.title"
          (change)="saveTitle($any($event.target).value)"
        />
      </div>

      <div aioField>
        <label aioFieldLabel for="task-content">توضیح</label>
        <textarea
          aioTextarea
          id="task-content"
          rows="3"
          dir="auto"
          class="min-w-0 resize-y leading-7"
          placeholder="جزئیات، لینک، یادداشت…"
          [value]="t.content"
          (change)="save({ content: $any($event.target).value })"
        ></textarea>
      </div>

      <fieldset aioFieldSet class="min-w-0 gap-3 border-t border-border pt-5">
        <legend aioFieldLegend class="text-sm">زمان‌بندی</legend>
        <div class="grid min-w-0 grid-cols-4 gap-2">
          @for (d of quickDates; track d.label) {
            <button
              aioBtn
              type="button"
              size="sm"
              class="min-w-0 rounded-[12px] px-1 text-xs shadow-none"
              [attr.aria-pressed]="t.date === d.date()"
              [variant]="t.date === d.date() ? 'default' : 'outline'"
              (click)="save({ date: d.date() })"
            >
              {{ d.label }}
            </button>
          }
        </div>
        <div class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <div aioField>
            <label aioFieldLabel for="task-date">تاریخ</label>
            <aio-date-input
              contentClass="applet-planner"
              class="min-w-0 max-w-full"
              aria-label="تاریخ دلخواه"
              inputId="task-date"
              [value]="t.date ?? ''"
              (valueChange)="save({ date: $event || null })"
            />
          </div>
          <div aioField>
            <label aioFieldLabel for="task-time">ساعت</label>
            <input
              aioInput
              class="w-full min-w-0 max-w-full appearance-none"
              id="task-time"
              dir="ltr"
              lang="fa-IR"
              type="time"
              aria-label="ساعت"
              [disabled]="!t.date"
              [value]="t.time ?? ''"
              (change)="save({ time: $any($event.target).value || null })"
            />
          </div>
        </div>
        @if (t.date) {
          <p class="text-muted-foreground text-xs">{{ dateLabel(t.date) }}</p>
        }
      </fieldset>

      <div aioField>
        <label aioFieldLabel for="task-reminder">یادآوری</label>
        <aio-native-select
          selectId="task-reminder"
          [disabled]="!t.date || !t.time"
          [value]="t.reminders[0] ?? ''"
          (valueChange)="save({ reminders: $event ? [$event] : [] })"
        >
          <option aioNativeSelectOption value="">بدون یادآوری</option>
          <option aioNativeSelectOption value="TRIGGER:PT0M">سر ساعت</option>
          <option aioNativeSelectOption value="TRIGGER:-PT5M">
            ۵ دقیقه قبل
          </option>
          <option aioNativeSelectOption value="TRIGGER:-PT15M">
            ۱۵ دقیقه قبل
          </option>
          <option aioNativeSelectOption value="TRIGGER:-PT60M">
            ۱ ساعت قبل
          </option>
        </aio-native-select>
        <p class="text-muted-foreground text-xs">
          تاریخ و ساعت را تعیین کن و اعلان‌ها را در حساب کاربری فعال کن.
        </p>
      </div>

      @if (t.repeatRule || t.seriesId || t.isSeries) {
        <div aioField>
          <label aioFieldLabel for="task-edit-scope">این تغییر برای</label>
          <aio-native-select
            selectId="task-edit-scope"
            [value]="editScope()"
            (valueChange)="setEditScope($event)"
          >
            <option aioNativeSelectOption value="OCCURRENCE">
              فقط این نوبت
            </option>
            <option aioNativeSelectOption value="FUTURE">
              این نوبت و نوبت‌های بعد
            </option>
            <option aioNativeSelectOption value="SERIES">
              کل سری (تاریخچه حفظ می‌شود)
            </option>
          </aio-native-select>
        </div>
      }
      <planner-recurrence-editor
        [value]="recurrenceValue()"
        (changed)="saveRecurrence($event)"
      />

      <div class="flex flex-col gap-2">
        <span class="text-sm font-medium">اولویت</span>
        <div
          aioToggleGroup
          type="single"
          variant="outline"
          class="w-full"
          [value]="t.priority"
          (valueChange)="setPriority($event)"
        >
          @for (p of priorities; track p) {
            <button aioToggleGroupItem [value]="p" class="h-11 flex-1 gap-1">
              <aio-icon name="lucideFlag" size="xs" [class]="flag[p]" />
              {{ priorityLabels[p] }}
            </button>
          }
        </div>
      </div>

      <div class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <div aioField>
          <label aioFieldLabel for="task-list">فهرست</label>
          <aio-native-select
            selectId="task-list"
            [value]="t.listId"
            (valueChange)="save({ listId: $event })"
          >
            @for (l of lists(); track l.id) {
              <option aioNativeSelectOption [value]="l.id">{{ l.name }}</option>
            }
          </aio-native-select>
        </div>
        <div aioField>
          <label aioFieldLabel for="task-section">بخش</label>
          <aio-native-select
            selectId="task-section"
            [disabled]="!sections().length"
            [value]="t.sectionId ?? ''"
            (valueChange)="save({ sectionId: $event || null })"
          >
            <option aioNativeSelectOption value="">بدون بخش</option>
            @for (s of sections(); track s.id) {
              <option aioNativeSelectOption [value]="s.id">{{ s.name }}</option>
            }
          </aio-native-select>
        </div>
      </div>

      @if (members().length > 1) {
        <div aioField>
          <label aioFieldLabel for="task-assignee">مسئول</label>
          <aio-native-select
            selectId="task-assignee"
            [value]="t.assigneeId ?? ''"
            (valueChange)="save({ assigneeId: $event || null })"
          >
            <option aioNativeSelectOption value="">بدون مسئول</option>
            @for (m of members(); track m.userId) {
              <option aioNativeSelectOption [value]="m.userId">
                {{ m.name || m.email }}
              </option>
            }
          </aio-native-select>
        </div>
      }

      <div class="flex flex-col gap-2">
        <span class="text-sm font-medium">برچسب‌ها</span>
        <div class="flex flex-wrap items-center gap-2">
          @for (tag of t.tags; track tag) {
            <span
              class="bg-accent text-accent-foreground inline-flex h-9 items-center gap-1 rounded-full ps-3 pe-1 text-sm"
            >
              #{{ tag }}
              <button
                type="button"
                class="hover:bg-background/60 grid size-8 place-items-center rounded-full"
                [attr.aria-label]="'برداشتن برچسب ' + tag"
                (click)="removeTag(tag)"
              >
                <aio-icon name="lucideX" size="xs" />
              </button>
            </span>
          }
          <form
            class="min-w-32 flex-1"
            (submit)="$event.preventDefault(); addTag()"
          >
            <input
              aioInput
              class="h-9"
              placeholder="+ برچسب"
              aria-label="برچسب تازه"
              enterkeyhint="done"
              [value]="newTag()"
              (input)="newTag.set($any($event.target).value)"
            />
          </form>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-sm font-medium">
          زیرکارها
          @if (t.checklist.length) {
            <span class="text-muted-foreground font-normal">
              ({{ fa(doneItems()) }} از {{ fa(t.checklist.length) }})
            </span>
          }
        </span>
        <ul class="flex flex-col">
          @for (item of t.checklist; track item.id) {
            <li class="flex min-h-11 items-center gap-3">
              <aio-checkbox
                [checked]="item.done"
                (checkedChange)="toggleItem(item.id, $event)"
                checkboxClass="relative size-5 rounded-full after:absolute after:-inset-3 after:content-['']"
                [aria-label]="'انجام شد: ' + item.title"
              />
              <span
                class="flex-1"
                [class.line-through]="item.done"
                [class.text-muted-foreground]="item.done"
              >
                {{ item.title }}
              </span>
              <button
                aioBtn
                variant="ghost"
                size="icon"
                type="button"
                [attr.aria-label]="'حذف ' + item.title"
                (click)="removeItem(item.id)"
              >
                <aio-icon name="lucideX" size="sm" />
              </button>
            </li>
          }
        </ul>
        <form aioInputGroup (submit)="$event.preventDefault(); addItem()">
          <input
            aioInputGroupInput
            placeholder="زیرکار تازه"
            aria-label="زیرکار تازه"
            enterkeyhint="done"
            [value]="newItem()"
            (input)="newItem.set($any($event.target).value)"
          />
          <aio-input-group-addon align="inline-end">
            <button
              aioInputGroupButton
              type="submit"
              size="icon-sm"
              aria-label="افزودن زیرکار"
            >
              <aio-icon name="lucidePlus" size="sm" />
            </button>
          </aio-input-group-addon>
        </form>
        <button
          aioBtn
          type="button"
          variant="ghost"
          size="sm"
          class="self-start"
          [disabled]="splitting()"
          (click)="split()"
        >
          @if (splitting()) {
            <aio-spinner />
          } @else {
            <aio-icon name="lucideSparkles" size="xs" />
          }
          شکستن به زیرکار با هوش مصنوعی
        </button>
      </div>

      <div class="flex min-h-11 items-center justify-between gap-3 text-sm">
        <label for="task-note">
          یادداشت است، نه کار
          <span class="text-muted-foreground block text-xs"
            >یادداشت‌ها تیک نمی‌خورند</span
          >
        </label>
        <aio-switch
          inputId="task-note"
          [checked]="t.kind === 'NOTE'"
          (checkedChange)="save({ kind: $event ? 'NOTE' : 'TASK' })"
        />
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-sm font-medium">گفتگو</span>
        @for (c of comments(); track c.id) {
          <div
            class="bg-muted/60 flex items-start gap-2 rounded-2xl p-3 text-sm"
          >
            <div class="flex-1">
              <span class="text-muted-foreground text-xs"
                >{{ c.author }}، {{ when(c.createdAt) }}</span
              >
              <p class="whitespace-pre-line">{{ c.body }}</p>
            </div>
            @if (c.mine) {
              <button
                aioBtn
                variant="ghost"
                size="icon"
                type="button"
                aria-label="حذف پیام"
                (click)="removeComment(c)"
              >
                <aio-icon name="lucideX" size="sm" />
              </button>
            }
          </div>
        }
        <form aioInputGroup (submit)="$event.preventDefault(); addComment()">
          <input
            aioInputGroupInput
            placeholder="پیام برای این کار"
            aria-label="پیام تازه"
            [value]="newComment()"
            (input)="newComment.set($any($event.target).value)"
          />
          <aio-input-group-addon align="inline-end">
            <button
              aioInputGroupButton
              type="submit"
              size="icon-sm"
              aria-label="فرستادن"
            >
              <aio-icon name="lucideSend" size="sm" />
            </button>
          </aio-input-group-addon>
        </form>
      </div>

      <div class="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          aioBtn
          variant="outline"
          type="button"
          class="flex-1"
          (click)="focusRequested.emit(t)"
        >
          <aio-icon name="lucideTimer" size="sm" />
          شروع تمرکز
        </button>
        <button
          aioBtn
          variant="ghost"
          type="button"
          class="text-destructive"
          (click)="trashed.emit(t)"
        >
          <aio-icon name="lucideTrash2" size="sm" />
          به سطل زباله
        </button>
      </div>
    </div>
  `,
})
export class TaskDetail {
  private readonly api = inject(PlannerApi);

  readonly task = input.required<PlannerTask>();
  readonly lists = input.required<PlannerList[]>();
  readonly changed = output<PlannerTask>();
  readonly trashed = output<PlannerTask>();
  readonly focusRequested = output<PlannerTask>();

  protected readonly recurrenceValue = computed(() => ({
    ...this.task(),
    repeatRule: this.task().repeatRule ?? this.task().recurrenceRule,
    recurrenceTimezone: this.task().timeZone ?? this.task().recurrenceTimezone,
  }));
  protected readonly editScope = signal<'OCCURRENCE' | 'FUTURE' | 'SERIES'>(
    'OCCURRENCE',
  );
  protected setEditScope(value: string) {
    this.editScope.set(value as 'OCCURRENCE' | 'FUTURE' | 'SERIES');
  }
  protected saveRecurrence(input: UpdateTaskInput) {
    void this.save({
      ...input,
      ...(!this.task().seriesId && !this.task().isSeries
        ? { date: this.task().date ?? this.today }
        : {}),
      recurrenceScope: this.editScope() === 'FUTURE' ? 'FUTURE' : 'SERIES',
    });
  }
  protected readonly priorities = [...TASK_PRIORITIES].reverse();
  protected readonly priorityLabels = TASK_PRIORITY_LABELS;
  protected readonly flag = PRIORITY_FLAG;
  private readonly today = toIsoDate(new Date());
  protected readonly quickDates = [
    { label: 'امروز', date: () => this.today },
    { label: 'فردا', date: () => addDays(this.today, 1) },
    { label: 'هفته بعد', date: () => addDays(this.today, 7) },
    { label: 'بی‌تاریخ', date: () => null },
  ];

  protected readonly newTag = signal('');
  protected readonly newItem = signal('');
  protected readonly newComment = signal('');
  protected readonly splitting = signal(false);

  private readonly list = computed(() =>
    this.lists().find((l) => l.id === this.task().listId),
  );
  protected readonly sections = computed(() => this.list()?.sections ?? []);
  private readonly listDetail = httpResource<PlannerListDetail>(() =>
    this.list()?.shared
      ? `${this.api.base}/lists/${this.task().listId}`
      : undefined,
  );
  protected readonly members = computed(() =>
    this.listDetail.hasValue() ? this.listDetail.value().members : [],
  );
  private readonly commentsRes = httpResource<PlannerComment[]>(
    () => `${this.api.base}/tasks/${this.task().id}/comments`,
  );
  protected readonly comments = computed(() =>
    this.commentsRes.hasValue() ? this.commentsRes.value() : [],
  );
  protected readonly doneItems = computed(
    () => this.task().checklist.filter((i) => i.done).length,
  );

  protected readonly fa = (n: number) => n.toLocaleString('fa-IR');

  protected dateLabel(iso: string) {
    return faDate(iso, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  protected when(iso: string) {
    return faDate(iso, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tehran',
    });
  }

  protected saveTitle(value: string) {
    const title = value.trim();
    if (title && title !== this.task().title) void this.save({ title });
  }

  protected setPriority(value: unknown) {
    if (typeof value === 'string' && value !== this.task().priority)
      void this.save({ priority: value as TaskPriority });
  }

  protected async save(change: UpdateTaskInput) {
    await this.run(() =>
      this.api.updateTask(this.task().id, {
        recurrenceScope: this.editScope(),
        ...change,
      }),
    );
  }

  protected addTag() {
    const tag = this.newTag().trim().replace(/^#/, '').replace(/\s+/g, '_');
    this.newTag.set('');
    if (tag && !this.task().tags.includes(tag))
      void this.save({ tags: [...this.task().tags, tag] });
  }

  protected removeTag(tag: string) {
    void this.save({ tags: this.task().tags.filter((t) => t !== tag) });
  }

  protected addItem() {
    const title = this.newItem().trim();
    this.newItem.set('');
    if (title) void this.run(() => this.api.addItem(this.task().id, title));
  }

  protected toggleItem(id: string, done: boolean) {
    void this.run(() => this.api.updateItem(this.task().id, id, { done }));
  }

  protected removeItem(id: string) {
    void this.run(() => this.api.removeItem(this.task().id, id));
  }

  protected async split() {
    this.splitting.set(true);
    await this.run(() => this.api.aiSubtasks(this.task().id));
    this.splitting.set(false);
  }

  protected async addComment() {
    const body = this.newComment().trim();
    if (!body) return;
    try {
      const comments = await this.api.addComment(this.task().id, body);
      this.newComment.set('');
      this.commentsRes.set(comments);
      this.changed.emit({ ...this.task(), commentCount: comments.length });
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

  protected async removeComment(comment: PlannerComment) {
    try {
      await this.api.removeComment(comment.id);
      const rest = this.comments().filter((c) => c.id !== comment.id);
      this.commentsRes.set(rest);
      this.changed.emit({ ...this.task(), commentCount: rest.length });
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

  private async run(call: () => Promise<PlannerTask>) {
    try {
      this.changed.emit(await call());
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }
}
