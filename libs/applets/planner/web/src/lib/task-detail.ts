import { RecurrenceEditor } from './recurrence-editor';
import { httpResource } from '@angular/common/http';
import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import {
  addDays,
  type PlannerColor,
  type PlannerComment,
  type PlannerList,
  type PlannerListDetail,
  type PlannerTask,
  type TaskPriority,
  TASK_LINKS_LIMIT,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  toIsoDate,
  type UpdateTaskInput,
  normalizeReminders,
} from '@all-in-one/applets/planner/contracts';
import {
  AioTranslate,
  AioBadge,
  AioButton,
  AioDateInput,
  AioCheckbox,
  AioIcon,
  AioInput,
  AioInputGroupDirectives,
  AioNativeSelect,
  AioNativeSelectDirectives,
  AioProgressDirectives,
  AioSwitch,
  AioTextarea,
  AioToggleGroupDirectives,
  provideIcons,
  AioFormField,
  AioAsyncButton,
  AioSelectField,
  AioInputGroupSubmit,
  AioLocale,
  AioNotifications,
  verbatim,
} from '@all-in-one/ui';
import { apiErrorMessage } from '@all-in-one/web/shared';
import {
  lucideBell,
  lucideCalendar,
  lucideCheck,
  lucideChevronDown,
  lucideCircleSlash,
  lucideExternalLink,
  lucideFlag,
  lucideFolder,
  lucideLink,
  lucideListChecks,
  lucideMessageSquare,
  lucidePlus,
  lucideRepeat2,
  lucideRotateCcw,
  lucideSend,
  lucideSlidersHorizontal,
  lucideSparkles,
  lucideStickyNote,
  lucideTimer,
  lucideTrash2,
  lucideX,
} from '@ng-icons/lucide';
import { PRIORITY_BOX, TONE } from './colors';
import { PlannerApi } from './planner-api';

export const PRIORITY_FLAG: Record<TaskPriority, string> = {
  NONE: 'text-muted-foreground/60',
  LOW: 'text-sky-600',
  MEDIUM: 'text-amber-600',
  HIGH: 'text-destructive',
};

type PropertyPanel = 'schedule' | 'priority' | 'organize' | null;

/**
 * TickTick-inspired task detail view: calm hero card for status, title and
 * notes; three scannable property rows with inline disclosure; auto-surfaced
 * cards for populated subtasks/links/comments and quick-add pills for empty
 * ones; and a focused action bar. Each edit saves immediately and emits.
 */
@Component({
  selector: 'planner-task-detail',
  imports: [
    RecurrenceEditor,
    AioBadge,
    AioButton,
    AioDateInput,
    AioCheckbox,
    AioIcon,
    AioInput,
    AioInputGroupDirectives,
    AioNativeSelect,
    AioNativeSelectDirectives,
    AioProgressDirectives,
    AioSwitch,
    AioTextarea,
    AioToggleGroupDirectives,
    AioFormField,
    AioAsyncButton,
    AioSelectField,
    AioInputGroupSubmit,
    AioTranslate,
  ],
  providers: [
    provideIcons({
      lucideBell,
      lucideCalendar,
      lucideCheck,
      lucideChevronDown,
      lucideCircleSlash,
      lucideExternalLink,
      lucideFlag,
      lucideFolder,
      lucideLink,
      lucideListChecks,
      lucideMessageSquare,
      lucidePlus,
      lucideRepeat2,
      lucideRotateCcw,
      lucideSend,
      lucideSlidersHorizontal,
      lucideSparkles,
      lucideStickyNote,
      lucideTimer,
      lucideTrash2,
      lucideX,
    }),
  ],
  host: { class: 'block min-w-0 w-full' },
  template: `
    @let t = task();
    <div
      class="flex min-w-0 flex-col gap-3.5 pb-1 [overflow-wrap:anywhere] [&_[data-slot=field]]:min-w-0 [&_[data-slot=field]]:gap-1.5"
    >
      <!-- Hero: completion state, title, and notes in one calm surface -->
      <section
        class="border-border/70 bg-background/80 flex min-w-0 flex-col rounded-2xl border p-3.5 shadow-2xs"
        [attr.aria-label]="'عنوان' | aioTranslate"
      >
        <div class="flex min-w-0 items-start gap-3">
          @if (t.kind === 'NOTE') {
            <span
              class="bg-muted text-muted-foreground mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-full"
              role="img"
              [attr.aria-label]="'یادداشت' | aioTranslate"
            >
              <aio-icon name="lucideStickyNote" size="xs" />
            </span>
          } @else if (t.wontDo) {
            <span
              class="bg-muted text-muted-foreground mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-full"
              role="img"
              [attr.aria-label]="'انجامش نمی‌دهم' | aioTranslate"
            >
              <aio-icon name="lucideCircleSlash" size="xs" />
            </span>
          } @else {
            <span class="mt-2 flex shrink-0 items-center">
              <aio-checkbox
                [checked]="t.done"
                (checkedChange)="toggleDone($event)"
                [checkboxClass]="checkboxClass()"
                [aria-label]="
                  'انجام شد: {0}' | aioTranslate: [verbatim(t.title)]
                "
              />
            </span>
          }

          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <input
              aioInput
              id="task-title"
              dir="auto"
              class="h-auto min-h-9 rounded-xl border-0 bg-transparent px-2 py-1 text-base leading-6 font-semibold shadow-none focus-visible:bg-background"
              [class.line-through]="t.done || t.wontDo"
              [class.text-muted-foreground]="t.done || t.wontDo"
              [attr.aria-label]="'عنوان' | aioTranslate"
              [value]="draftTitle()"
              (input)="draftTitle.set($any($event.target).value)"
              (keydown.enter)="$event.preventDefault(); saveText()"
            />

            @if (t.wontDo || t.done || t.kind === 'NOTE') {
              <div class="flex flex-wrap items-center gap-1.5 px-2">
                @if (t.wontDo) {
                  <span aioBadge variant="secondary" class="gap-1 text-xs">
                    <aio-icon name="lucideCircleSlash" size="xs" />
                    {{ 'انجامش نمی‌دهم' | aioTranslate }}
                  </span>
                } @else if (t.done) {
                  <span
                    aioBadge
                    variant="secondary"
                    class="text-success gap-1 text-xs"
                  >
                    <aio-icon name="lucideCheck" size="xs" />
                    {{ 'انجام‌شده' | aioTranslate }}
                  </span>
                }
                @if (t.kind === 'NOTE') {
                  <span aioBadge variant="secondary" class="gap-1 text-xs">
                    <aio-icon name="lucideStickyNote" size="xs" />
                    {{ 'یادداشت' | aioTranslate }}
                  </span>
                }
              </div>
            }
          </div>
        </div>

        <div class="border-border/50 mt-2.5 border-t pt-2">
          <textarea
            aioTextarea
            id="task-content"
            rows="2"
            dir="auto"
            class="min-h-16 min-w-0 resize-y rounded-xl border-0 bg-transparent px-2 py-1 text-sm leading-7 shadow-none focus-visible:bg-background"
            [attr.aria-label]="'توضیح' | aioTranslate"
            [placeholder]="'توضیح یا یادداشت اضافه کن…' | aioTranslate"
            [value]="draftContent()"
            (input)="draftContent.set($any($event.target).value)"
            (keydown.control.enter)="$event.preventDefault(); saveText()"
            (keydown.meta.enter)="$event.preventDefault(); saveText()"
          ></textarea>
        </div>

        <div
          class="border-border/50 mt-2 flex items-center justify-end gap-2 border-t pt-2.5"
        >
          @if (canSaveText()) {
            <button
              aioBtn
              type="button"
              variant="ghost"
              size="sm"
              class="text-muted-foreground h-10 rounded-xl px-3 text-xs"
              [disabled]="savingText()"
              (click)="resetText()"
            >
              {{ 'انصراف' | aioTranslate }}
            </button>
          }
          <button
            type="button"
            size="sm"
            class="h-10 rounded-xl px-4 text-xs"
            [variant]="canSaveText() ? 'default' : 'secondary'"
            [disabled]="!canSaveText() || savingText()"
            (click)="saveText()"
            aioAsyncButton
            [busy]="savingText()"
            [label]="'ذخیره' | aioTranslate"
            icon="lucideCheck"
            iconSize="xs"
          ></button>
        </div>
      </section>

      <!-- Recurring scope banner (only shown for recurring tasks) -->
      @if (isRecurring()) {
        <div
          class="border-primary/20 bg-accent/55 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5"
        >
          <label
            for="task-edit-scope"
            class="flex items-center gap-2 text-xs font-medium"
          >
            <aio-icon name="lucideRepeat2" size="sm" class="text-primary" />
            <span>{{ 'این تغییر برای' | aioTranslate }}</span>
          </label>
          <aio-native-select
            class="min-w-44 flex-1 sm:flex-initial"
            selectId="task-edit-scope"
            selectClass="h-9 text-xs"
            [value]="editScope()"
            (valueChange)="setEditScope($event)"
          >
            <option aioNativeSelectOption value="OCCURRENCE">
              {{ 'فقط این نوبت' | aioTranslate }}
            </option>
            <option aioNativeSelectOption value="FUTURE">
              {{ 'این نوبت و نوبت‌های بعد' | aioTranslate }}
            </option>
            <option aioNativeSelectOption value="SERIES">
              {{ 'کل سری (تاریخچه حفظ می‌شود)' | aioTranslate }}
            </option>
          </aio-native-select>
        </div>
      }

      <!-- Scannable Properties List: Schedule, Priority, List & Tags -->
      <section
        class="border-border/70 bg-background/80 divide-border/50 flex min-w-0 flex-col divide-y overflow-hidden rounded-2xl border shadow-2xs"
      >
        <!-- Row 1: Schedule, Reminder & Recurrence -->
        <div class="min-w-0">
          <button
            type="button"
            class="hover:bg-muted/40 focus-visible:ring-ring flex min-h-12 w-full min-w-0 items-center gap-3 px-3.5 py-2.5 text-start transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
            [attr.aria-expanded]="openPanel() === 'schedule'"
            aria-controls="task-panel-schedule"
            (click)="togglePanel('schedule')"
          >
            <aio-icon
              name="lucideCalendar"
              size="sm"
              class="shrink-0"
              [class.text-destructive]="isOverdue()"
              [class.text-primary]="!isOverdue() && !!t.date"
              [class.text-muted-foreground]="!t.date"
            />
            <span class="shrink-0 text-sm font-medium">{{
              'زمان‌بندی' | aioTranslate
            }}</span>
            <span
              class="ms-auto flex min-w-0 items-center justify-end gap-1.5 text-xs"
              [class.text-destructive]="isOverdue()"
              [class.font-medium]="!!scheduleSummary()"
              [class.text-foreground]="!isOverdue() && !!scheduleSummary()"
              [class.text-muted-foreground]="!scheduleSummary()"
            >
              <span class="truncate">
                @if (scheduleSummary(); as summary) {
                  <bdi [dir]="locale.direction()">{{ summary }}</bdi>
                } @else {
                  {{ 'تنظیم نشده' | aioTranslate }}
                }
              </span>
              @if (hasReminder()) {
                <aio-icon
                  name="lucideBell"
                  size="xs"
                  class="text-primary shrink-0"
                  [attr.aria-label]="'دارای یادآوری' | aioTranslate"
                />
              }
              @if (t.repeatRule) {
                <aio-icon
                  name="lucideRepeat2"
                  size="xs"
                  class="text-primary shrink-0"
                  [attr.aria-label]="'کار تکراری' | aioTranslate"
                />
              }
              <aio-icon
                name="lucideChevronDown"
                size="xs"
                class="text-muted-foreground shrink-0 transition-transform duration-150"
                [class.rotate-180]="openPanel() === 'schedule'"
              />
            </span>
          </button>

          @if (openPanel() === 'schedule') {
            <div
              id="task-panel-schedule"
              class="border-border/50 bg-muted/25 flex min-w-0 flex-col gap-3.5 border-t p-3.5"
            >
              <div class="grid min-w-0 grid-cols-4 gap-1.5">
                @for (d of quickDates; track d.label) {
                  <button
                    aioBtn
                    type="button"
                    size="sm"
                    class="h-10 min-w-0 rounded-xl px-1 text-xs shadow-none"
                    [attr.aria-pressed]="t.date === d.date()"
                    [variant]="t.date === d.date() ? 'default' : 'outline'"
                    (click)="save({ date: d.date() })"
                  >
                    {{ d.label | aioTranslate }}
                  </button>
                }
              </div>

              <div class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                <aio-form-field
                  [label]="'تاریخ' | aioTranslate"
                  controlId="task-date"
                >
                  <aio-date-input
                    contentClass="applet-planner"
                    class="min-w-0 max-w-full"
                    [aria-label]="'تاریخ دلخواه' | aioTranslate"
                    inputId="task-date"
                    [value]="t.date ?? ''"
                    (valueChange)="save({ date: $event || null })"
                  />
                </aio-form-field>

                <aio-form-field
                  [label]="'ساعت' | aioTranslate"
                  controlId="task-time"
                >
                  <input
                    aioInput
                    class="w-full min-w-0 max-w-full appearance-none"
                    id="task-time"
                    dir="ltr"
                    lang="fa-IR"
                    type="time"
                    [attr.aria-label]="'ساعت' | aioTranslate"
                    [disabled]="!t.date"
                    [value]="t.time ?? ''"
                    (change)="save({ time: $any($event.target).value || null })"
                  />
                </aio-form-field>
              </div>

              @if (t.date) {
                <p class="text-muted-foreground -mt-1 text-xs">
                  {{ dateLabel(t.date) }}
                </p>
              }

              @if (t.date && t.time) {
                <div class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                  <aio-form-field
                    [label]="'مدت (دقیقه)' | aioTranslate"
                    controlId="task-duration"
                  >
                    <input
                      aioInput
                      id="task-duration"
                      type="number"
                      inputmode="numeric"
                      min="1"
                      max="10080"
                      [value]="t.durationMin ?? ''"
                      (change)="saveDuration($any($event.target))"
                    />
                  </aio-form-field>

                  <aio-form-field
                    [label]="'یادآوری' | aioTranslate"
                    controlId="task-reminder"
                  >
                    <aio-native-select
                      selectId="task-reminder"
                      [value]="shownReminder(t.reminders)"
                      (valueChange)="
                        save({ reminders: $event ? [$event] : [] })
                      "
                    >
                      <option aioNativeSelectOption value="">
                        {{ 'بدون یادآوری' | aioTranslate }}
                      </option>
                      <option aioNativeSelectOption value="TRIGGER:PT0M">
                        {{ 'سر ساعت' | aioTranslate }}
                      </option>
                      <option aioNativeSelectOption value="TRIGGER:-PT5M">
                        {{ '۵ دقیقه قبل' | aioTranslate }}
                      </option>
                      <option aioNativeSelectOption value="TRIGGER:-PT15M">
                        {{ '۱۵ دقیقه قبل' | aioTranslate }}
                      </option>
                      <option aioNativeSelectOption value="TRIGGER:-PT60M">
                        {{ '۱ ساعت قبل' | aioTranslate }}
                      </option>
                    </aio-native-select>
                  </aio-form-field>
                </div>
                @if (hasReminder()) {
                  <p class="text-muted-foreground -mt-1 text-xs">
                    {{
                      'تاریخ و ساعت را تعیین کن و اعلان‌ها را در حساب کاربری فعال کن.'
                        | aioTranslate
                    }}
                  </p>
                }
              } @else if (t.date) {
                <p class="text-muted-foreground text-xs">
                  {{
                    'برای یادآوری و مدت، ابتدا ساعت را مشخص کن.' | aioTranslate
                  }}
                </p>
              }

              <div class="border-border/50 border-t pt-3">
                <planner-recurrence-editor
                  [embedded]="true"
                  [value]="recurrenceValue()"
                  [showDuration]="false"
                  (changed)="saveRecurrence($event)"
                />
              </div>
            </div>
          }
        </div>

        <!-- Row 2: Priority -->
        <div class="min-w-0">
          <button
            type="button"
            class="hover:bg-muted/40 focus-visible:ring-ring flex min-h-12 w-full min-w-0 items-center gap-3 px-3.5 py-2.5 text-start transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
            [attr.aria-expanded]="openPanel() === 'priority'"
            aria-controls="task-panel-priority"
            (click)="togglePanel('priority')"
          >
            <aio-icon
              name="lucideFlag"
              size="sm"
              class="shrink-0"
              [class]="flag[t.priority]"
            />
            <span class="shrink-0 text-sm font-medium">{{
              'اولویت' | aioTranslate
            }}</span>
            <span class="ms-auto flex items-center gap-1.5 text-xs">
              <span
                [class]="
                  t.priority === 'NONE'
                    ? 'text-muted-foreground'
                    : 'font-medium ' + flag[t.priority]
                "
              >
                {{ priorityLabels[t.priority] | aioTranslate }}
              </span>
              <aio-icon
                name="lucideChevronDown"
                size="xs"
                class="text-muted-foreground shrink-0 transition-transform duration-150"
                [class.rotate-180]="openPanel() === 'priority'"
              />
            </span>
          </button>

          @if (openPanel() === 'priority') {
            <div
              id="task-panel-priority"
              class="border-border/50 bg-muted/25 border-t p-3"
            >
              <div
                aioToggleGroup
                type="single"
                variant="outline"
                class="w-full"
                [value]="t.priority"
                (valueChange)="setPriority($event)"
              >
                @for (p of priorities; track p) {
                  <button
                    aioToggleGroupItem
                    [value]="p"
                    class="h-11 flex-1 gap-1 text-xs"
                  >
                    <aio-icon name="lucideFlag" size="xs" [class]="flag[p]" />
                    {{ priorityLabels[p] | aioTranslate }}
                  </button>
                }
              </div>
            </div>
          }
        </div>

        <!-- Row 3: List, Section, Assignee & Tags -->
        <div class="min-w-0">
          <button
            type="button"
            class="hover:bg-muted/40 focus-visible:ring-ring flex min-h-12 w-full min-w-0 items-center gap-3 px-3.5 py-2.5 text-start transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
            [attr.aria-expanded]="openPanel() === 'organize'"
            aria-controls="task-panel-organize"
            (click)="togglePanel('organize')"
          >
            <aio-icon
              name="lucideFolder"
              size="sm"
              class="text-muted-foreground shrink-0"
            />
            <span class="shrink-0 text-sm font-medium">{{
              'فهرست و برچسب' | aioTranslate
            }}</span>
            <span
              class="ms-auto flex min-w-0 items-center justify-end gap-1.5 text-xs"
            >
              @if (listDot()) {
                <span
                  [class]="'size-2 shrink-0 rounded-full ' + listDot()"
                ></span>
              }
              <span class="text-foreground truncate font-medium">{{
                listLabel()
              }}</span>
              @if (sectionLabel(); as sec) {
                <span class="text-muted-foreground truncate">
                  {{ locale.english() ? '·' : '،' }} {{ sec }}
                </span>
              }
              @for (tag of t.tags.slice(0, 2); track tag) {
                <span class="text-primary shrink-0">#{{ tag }}</span>
              }
              @if (t.tags.length > 2) {
                <span class="text-muted-foreground shrink-0">
                  +{{ fa(t.tags.length - 2) }}
                </span>
              }
              <aio-icon
                name="lucideChevronDown"
                size="xs"
                class="text-muted-foreground shrink-0 transition-transform duration-150"
                [class.rotate-180]="openPanel() === 'organize'"
              />
            </span>
          </button>

          @if (openPanel() === 'organize') {
            <div
              id="task-panel-organize"
              class="border-border/50 bg-muted/25 flex min-w-0 flex-col gap-3.5 border-t p-3.5"
            >
              <div
                class="grid min-w-0 grid-cols-1 gap-3"
                [class.sm:grid-cols-2]="sections().length > 0"
              >
                <aio-select-field
                  [label]="'فهرست' | aioTranslate"
                  controlId="task-list"
                  [value]="t.listId"
                  [options]="lists()"
                  valueKey="id"
                  labelKey="name"
                  (valueChange)="save({ listId: $event })"
                />
                @if (sections().length > 0) {
                  <aio-select-field
                    [label]="'بخش' | aioTranslate"
                    controlId="task-section"
                    [value]="t.sectionId ?? ''"
                    [options]="sections()"
                    valueKey="id"
                    labelKey="name"
                    [emptyLabel]="'بدون بخش' | aioTranslate"
                    (valueChange)="save({ sectionId: $event || null })"
                  />
                }
              </div>

              @if (members().length > 1) {
                <aio-select-field
                  [label]="'مسئول' | aioTranslate"
                  controlId="task-assignee"
                  [value]="t.assigneeId ?? ''"
                  [options]="members()"
                  valueKey="userId"
                  labelKey="name"
                  fallbackLabelKey="email"
                  [emptyLabel]="'بدون مسئول' | aioTranslate"
                  (valueChange)="save({ assigneeId: $event || null })"
                />
              }

              <div class="flex flex-col gap-2">
                <span class="text-xs font-medium">{{
                  'برچسب‌ها' | aioTranslate
                }}</span>
                <div class="flex flex-wrap items-center gap-2">
                  @for (tag of t.tags; track tag) {
                    <span
                      class="bg-accent text-accent-foreground inline-flex h-9 items-center gap-1 rounded-full ps-3 pe-1 text-xs font-medium"
                    >
                      #{{ tag }}
                      <button
                        type="button"
                        class="hover:bg-background/60 relative grid size-7 place-items-center rounded-full after:absolute after:-inset-2 after:content-['']"
                        [attr.aria-label]="
                          'برداشتن برچسب {0}' | aioTranslate: [verbatim(tag)]
                        "
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
                      [placeholder]="'+ برچسب' | aioTranslate"
                      [attr.aria-label]="'برچسب تازه' | aioTranslate"
                      enterkeyhint="done"
                      [value]="newTag()"
                      (input)="newTag.set($any($event.target).value)"
                    />
                  </form>
                </div>
              </div>
            </div>
          }
        </div>
      </section>

      <!-- Subtasks Card (auto-shown when populated, or opened via quick-add pill) -->
      @if (showSubtasks() || t.checklist.length > 0) {
        <section
          class="border-border/70 bg-background/80 flex min-w-0 flex-col gap-2.5 rounded-2xl border p-3.5 shadow-2xs"
          [attr.aria-label]="'زیرکارها' | aioTranslate"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <aio-icon
                name="lucideListChecks"
                size="sm"
                class="text-primary"
              />
              <span class="text-sm font-semibold">{{
                'زیرکارها' | aioTranslate
              }}</span>
              @if (t.checklist.length) {
                <span aioBadge variant="secondary" class="text-xs font-normal">
                  {{
                    '{0} از {1}'
                      | aioTranslate: [fa(doneItems()), fa(t.checklist.length)]
                  }}
                </span>
              }
            </div>
            <button
              type="button"
              variant="ghost"
              size="sm"
              class="text-primary h-9 rounded-xl px-2.5 text-xs"
              [disabled]="splitting()"
              (click)="split()"
              aioAsyncButton
              [busy]="splitting()"
              [label]="'با هوش مصنوعی' | aioTranslate"
              icon="lucideSparkles"
              iconSize="xs"
            ></button>
          </div>

          @if (t.checklist.length) {
            <div
              aioProgress
              [value]="checklistPct()"
              class="h-1.5 rounded-full"
            >
              <div aioProgressIndicator class="rounded-full"></div>
            </div>
            <ul class="divide-border/40 flex flex-col divide-y">
              @for (item of t.checklist; track item.id) {
                <li class="flex min-h-11 items-center gap-3 py-0.5">
                  <aio-checkbox
                    [checked]="item.done"
                    (checkedChange)="toggleItem(item.id, $event)"
                    checkboxClass="relative size-5 rounded-full after:absolute after:-inset-3 after:content-['']"
                    [aria-label]="
                      'انجام شد: {0}' | aioTranslate: [verbatim(item.title)]
                    "
                  />
                  <span
                    class="min-w-0 flex-1 text-sm"
                    [class.line-through]="item.done"
                    [class.text-muted-foreground]="item.done"
                  >
                    <bdi>{{ item.title }}</bdi>
                  </span>
                  <button
                    aioBtn
                    variant="ghost"
                    size="icon"
                    type="button"
                    class="text-muted-foreground size-9 shrink-0"
                    [attr.aria-label]="
                      'حذف {0}' | aioTranslate: [verbatim(item.title)]
                    "
                    (click)="removeItem(item.id)"
                  >
                    <aio-icon name="lucideX" size="xs" />
                  </button>
                </li>
              }
            </ul>
          }

          <form aioInputGroup (submit)="$event.preventDefault(); addItem()">
            <input
              aioInputGroupInput
              [placeholder]="'زیرکار تازه' | aioTranslate"
              [attr.aria-label]="'زیرکار تازه' | aioTranslate"
              enterkeyhint="done"
              [value]="newItem()"
              (input)="newItem.set($any($event.target).value)"
            />
            <aio-input-group-submit
              [label]="'افزودن زیرکار' | aioTranslate"
              icon="lucidePlus"
            />
          </form>
        </section>
      }

      <!-- Links Card (auto-shown when populated, or opened via quick-add pill) -->
      @if (showLinks() || t.links.length > 0) {
        <section
          class="border-border/70 bg-background/80 flex min-w-0 flex-col gap-2.5 rounded-2xl border p-3.5 shadow-2xs"
          [attr.aria-label]="'لینک‌ها' | aioTranslate"
        >
          <div class="flex items-center gap-2">
            <aio-icon name="lucideLink" size="sm" class="text-primary" />
            <span class="text-sm font-semibold">{{
              'لینک‌ها' | aioTranslate
            }}</span>
            @if (t.links.length) {
              <span aioBadge variant="secondary" class="text-xs font-normal">
                {{ fa(t.links.length) }}
              </span>
            }
          </div>

          @if (t.links.length) {
            <ul class="divide-border/40 flex flex-col divide-y">
              @for (link of t.links; track $index) {
                <li class="flex min-h-11 min-w-0 items-center gap-2 py-0.5">
                  <span
                    class="min-w-0 flex-1 truncate text-sm"
                    dir="ltr"
                    lang="en"
                    [title]="link"
                  >
                    {{ linkLabel(link) }}
                  </span>
                  <!-- A plain link: the phone hands YouTube and other app links to their app. -->
                  <a
                    aioBtn
                    variant="outline"
                    size="icon"
                    class="size-9 shrink-0 rounded-xl shadow-none"
                    [href]="link"
                    target="_blank"
                    rel="noopener noreferrer"
                    [attr.aria-label]="
                      'باز کردن {0}' | aioTranslate: [verbatim(linkLabel(link))]
                    "
                  >
                    <aio-icon name="lucideExternalLink" size="xs" />
                  </a>
                  <button
                    aioBtn
                    variant="ghost"
                    size="icon"
                    type="button"
                    class="text-muted-foreground size-9 shrink-0"
                    [attr.aria-label]="
                      'حذف {0}' | aioTranslate: [verbatim(linkLabel(link))]
                    "
                    (click)="removeLink($index)"
                  >
                    <aio-icon name="lucideX" size="xs" />
                  </button>
                </li>
              }
            </ul>
          }

          @if (t.links.length < linksLimit) {
            <form aioInputGroup (submit)="$event.preventDefault(); addLink()">
              <input
                aioInputGroupInput
                type="url"
                inputmode="url"
                dir="ltr"
                lang="en"
                placeholder="https://…"
                [attr.aria-label]="'لینک تازه' | aioTranslate"
                enterkeyhint="done"
                [value]="newLink()"
                (input)="newLink.set($any($event.target).value)"
              />
              <aio-input-group-submit
                [label]="'افزودن لینک' | aioTranslate"
                icon="lucidePlus"
              />
            </form>
          }
        </section>
      }

      <!-- Comments Card (auto-shown when populated, or opened via quick-add pill) -->
      @if (showComments() || comments().length > 0) {
        <section
          class="border-border/70 bg-background/80 flex min-w-0 flex-col gap-2.5 rounded-2xl border p-3.5 shadow-2xs"
          [attr.aria-label]="'گفتگو' | aioTranslate"
        >
          <div class="flex items-center gap-2">
            <aio-icon
              name="lucideMessageSquare"
              size="sm"
              class="text-primary"
            />
            <span class="text-sm font-semibold">{{
              'گفتگو' | aioTranslate
            }}</span>
            @if (comments().length) {
              <span aioBadge variant="secondary" class="text-xs font-normal">
                {{ fa(comments().length) }}
              </span>
            }
          </div>

          @for (c of comments(); track c.id) {
            <div
              class="bg-muted/55 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm"
            >
              <div class="min-w-0 flex-1">
                <span class="text-muted-foreground text-xs"
                  >{{ c.author }}، {{ when(c.createdAt) }}</span
                >
                <p class="mt-0.5 whitespace-pre-line">{{ c.body }}</p>
              </div>
              @if (c.mine) {
                <button
                  aioBtn
                  variant="ghost"
                  size="icon"
                  type="button"
                  class="text-muted-foreground size-8 shrink-0"
                  [attr.aria-label]="'حذف پیام' | aioTranslate"
                  (click)="removeComment(c)"
                >
                  <aio-icon name="lucideX" size="xs" />
                </button>
              }
            </div>
          }

          <form aioInputGroup (submit)="$event.preventDefault(); addComment()">
            <input
              aioInputGroupInput
              [placeholder]="'پیام برای این کار' | aioTranslate"
              [attr.aria-label]="'پیام تازه' | aioTranslate"
              [value]="newComment()"
              (input)="newComment.set($any($event.target).value)"
            />
            <aio-input-group-submit
              [label]="'فرستادن' | aioTranslate"
              icon="lucideSend"
            />
          </form>
        </section>
      }

      <!-- Compact quick-add strip for empty optional sections + task type toggle -->
      <div class="flex flex-wrap items-center gap-2">
        @if (!showSubtasks() && !t.checklist.length) {
          <button
            aioBtn
            type="button"
            variant="outline"
            size="sm"
            class="h-11 rounded-full px-3.5 text-xs font-medium shadow-none"
            (click)="showSubtasks.set(true)"
          >
            <aio-icon name="lucidePlus" size="xs" />
            {{ 'زیرکار' | aioTranslate }}
          </button>
        }
        @if (!showLinks() && !t.links.length) {
          <button
            aioBtn
            type="button"
            variant="outline"
            size="sm"
            class="h-11 rounded-full px-3.5 text-xs font-medium shadow-none"
            (click)="showLinks.set(true)"
          >
            <aio-icon name="lucidePlus" size="xs" />
            {{ 'لینک' | aioTranslate }}
          </button>
        }
        @if (!showComments() && !comments().length) {
          <button
            aioBtn
            type="button"
            variant="outline"
            size="sm"
            class="h-11 rounded-full px-3.5 text-xs font-medium shadow-none"
            (click)="showComments.set(true)"
          >
            <aio-icon name="lucidePlus" size="xs" />
            {{ 'گفتگو' | aioTranslate }}
          </button>
        }
        <button
          aioBtn
          type="button"
          variant="ghost"
          size="sm"
          class="text-muted-foreground h-11 rounded-full px-3 text-xs font-medium"
          [attr.aria-expanded]="showMore()"
          aria-controls="task-panel-more"
          (click)="showMore.set(!showMore())"
        >
          <aio-icon name="lucideSlidersHorizontal" size="xs" />
          {{ 'نوع کار' | aioTranslate }}
        </button>
      </div>

      @if (showMore()) {
        <div
          id="task-panel-more"
          class="border-border/70 bg-background/80 flex min-h-12 items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-sm shadow-2xs"
        >
          <label for="task-note" class="min-w-0 flex-1">
            {{ 'یادداشت است، نه کار' | aioTranslate }}
            <span class="text-muted-foreground block text-xs">{{
              'یادداشت‌ها تیک نمی‌خورند' | aioTranslate
            }}</span>
          </label>
          <aio-switch
            inputId="task-note"
            [checked]="t.kind === 'NOTE'"
            (checkedChange)="save({ kind: $event ? 'NOTE' : 'TASK' })"
          />
        </div>
      }

      <!-- Bottom Action Bar -->
      <div
        class="border-border/50 flex flex-wrap items-center gap-2 border-t pt-3"
      >
        @if (t.durationMin) {
          <button
            aioBtn
            variant="outline"
            type="button"
            class="min-w-36 flex-1 rounded-xl shadow-none"
            (click)="focusRequested.emit(t)"
          >
            <aio-icon name="lucideTimer" size="sm" />
            {{ 'شروع تمرکز' | aioTranslate }}
          </button>
        }
        @if (t.wontDo) {
          <button
            aioBtn
            variant="secondary"
            type="button"
            class="rounded-xl shadow-none"
            (click)="setWontDo(false)"
          >
            <aio-icon name="lucideRotateCcw" size="sm" />
            {{ 'بازکردن' | aioTranslate }}
          </button>
        } @else if (!t.done && t.kind === 'TASK') {
          <button
            aioBtn
            variant="ghost"
            type="button"
            class="text-muted-foreground rounded-xl"
            (click)="setWontDo(true)"
          >
            <aio-icon name="lucideCircleSlash" size="sm" />
            {{ 'انجامش نمی‌دهم' | aioTranslate }}
          </button>
        }
        <button
          aioBtn
          variant="ghost"
          type="button"
          class="text-destructive hover:bg-destructive/10 hover:text-destructive rounded-xl"
          [class.ms-auto]="!t.durationMin"
          (click)="trashed.emit(t)"
        >
          <aio-icon name="lucideTrash2" size="sm" />
          {{ 'به سطل زباله' | aioTranslate }}
        </button>
      </div>
    </div>
  `,
})
export class TaskDetail {
  protected readonly verbatim = verbatim;
  /** The menu option for a reminder another client spelled differently (the assistant may save `PT0S`). */
  protected shownReminder(reminders: readonly string[]): string {
    const first = normalizeReminders(reminders.slice(0, 1))[0] ?? '';
    return [
      'TRIGGER:PT0M',
      'TRIGGER:-PT5M',
      'TRIGGER:-PT15M',
      'TRIGGER:-PT60M',
    ].includes(first)
      ? first
      : (reminders[0] ?? '');
  }
  protected readonly locale = inject(AioLocale);

  private readonly notifications = inject(AioNotifications);

  private readonly api = inject(PlannerApi);

  readonly task = input.required<PlannerTask>();
  readonly lists = input.required<PlannerList[]>();
  readonly changed = output<PlannerTask>();
  readonly toggled = output<boolean>();
  readonly trashed = output<PlannerTask>();
  readonly focusRequested = output<PlannerTask>();

  private readonly taskId = computed(() => this.task().id);
  private readonly textSource = computed(
    () => `${this.task().id}\0${this.task().title}\0${this.task().content}`,
  );
  protected readonly draftTitle = linkedSignal<string, string>({
    source: this.textSource,
    computation: () => this.task().title,
  });
  protected readonly draftContent = linkedSignal<string, string>({
    source: this.textSource,
    computation: () => this.task().content,
  });
  protected readonly savingText = signal(false);
  protected readonly canSaveText = computed(() => {
    const title = this.draftTitle().trim();
    const content = this.draftContent();
    return (
      !!title &&
      (title !== this.task().title || content !== this.task().content)
    );
  });
  protected readonly openPanel = linkedSignal<string, PropertyPanel>({
    source: this.taskId,
    computation: () => null,
  });
  protected readonly showSubtasks = linkedSignal<string, boolean>({
    source: this.taskId,
    computation: () => false,
  });
  protected readonly showLinks = linkedSignal<string, boolean>({
    source: this.taskId,
    computation: () => false,
  });
  protected readonly showComments = linkedSignal<string, boolean>({
    source: this.taskId,
    computation: () => false,
  });
  protected readonly showMore = linkedSignal<string, boolean>({
    source: this.taskId,
    computation: () => false,
  });

  protected togglePanel(panel: Exclude<PropertyPanel, null>) {
    this.openPanel.update((current) => (current === panel ? null : panel));
  }

  protected readonly isRecurring = computed(
    () =>
      !!(
        this.task().repeatRule ||
        this.task().seriesId ||
        this.task().isSeries
      ),
  );
  protected readonly recurrenceValue = computed(() => ({
    ...this.task(),
    repeatRule: this.task().repeatRule ?? this.task().recurrenceRule,
    recurrenceTimezone: this.task().timeZone ?? this.task().recurrenceTimezone,
  }));
  protected readonly editScope = linkedSignal<
    string,
    'OCCURRENCE' | 'FUTURE' | 'SERIES'
  >({
    source: this.taskId,
    computation: () => 'OCCURRENCE',
  });
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
  protected readonly newLink = signal('');
  protected readonly linksLimit = TASK_LINKS_LIMIT;
  protected readonly newComment = signal('');
  protected readonly splitting = signal(false);

  private readonly list = computed(() =>
    this.lists().find((l) => l.id === this.task().listId),
  );
  protected readonly listDot = computed(() => {
    const l = this.list();
    return l ? TONE[l.color as PlannerColor].dot : '';
  });
  protected readonly listLabel = computed(() => {
    const l = this.list();
    if (!l) return '';
    return l.isInbox ? this.locale.text(l.name) : l.name;
  });
  protected readonly sections = computed(() => this.list()?.sections ?? []);
  protected readonly sectionLabel = computed(
    () =>
      this.sections().find((s) => s.id === this.task().sectionId)?.name ?? '',
  );
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
  protected readonly checklistPct = computed(() => {
    const total = this.task().checklist.length;
    return total ? Math.round((this.doneItems() / total) * 100) : 0;
  });
  protected readonly isOverdue = computed(() => {
    const t = this.task();
    return !t.done && t.kind === 'TASK' && !!t.date && t.date < this.today;
  });
  protected readonly hasReminder = computed(
    () => !!this.shownReminder(this.task().reminders),
  );
  protected readonly checkboxClass = computed(
    () =>
      `relative size-5 rounded-full border-2 after:absolute after:-inset-3 after:content-[''] ${PRIORITY_BOX[this.task().priority as TaskPriority]}`,
  );
  protected readonly scheduleSummary = computed(() => {
    const t = this.task();
    const parts: string[] = [];
    if (t.date) {
      if (t.date === this.today) parts.push(this.locale.text('امروز'));
      else if (t.date === addDays(this.today, 1))
        parts.push(this.locale.text('فردا'));
      else if (t.date === addDays(this.today, -1))
        parts.push(this.locale.text('دیروز'));
      else
        parts.push(
          this.locale.date(t.date, { day: 'numeric', month: 'short' }),
        );
    }
    if (t.time) parts.push(this.faTime(t.time));
    if (t.durationMin)
      parts.push(this.locale.text('{0} دقیقه', [t.durationMin]));
    return parts.join(this.locale.english() ? ', ' : '، ');
  });

  protected readonly fa = (n: number) => this.locale.number(n);

  private faTime(time: string) {
    return time.replace(/\d/g, (d) => this.locale.number(Number(d)));
  }

  protected dateLabel(iso: string) {
    return this.locale.date(iso, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  protected when(iso: string) {
    return this.locale.date(iso, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tehran',
    });
  }

  protected toggleDone(done: boolean) {
    this.toggled.emit(done);
  }

  /** Empty clears the duration; out-of-range values snap back. */
  protected saveDuration(el: HTMLInputElement) {
    const raw = el.value.trim();
    const value = raw ? Number(raw) : null;
    if (
      value !== null &&
      (!Number.isInteger(value) || value < 1 || value > 10080)
    ) {
      el.value = String(this.task().durationMin ?? '');
      return;
    }
    if (value !== (this.task().durationMin ?? null))
      void this.save({ durationMin: value });
  }

  protected resetText() {
    this.draftTitle.set(this.task().title);
    this.draftContent.set(this.task().content);
  }

  protected async saveText() {
    const title = this.draftTitle().trim();
    const content = this.draftContent();
    if (!title) {
      this.draftTitle.set(this.task().title);
      return;
    }
    const change: UpdateTaskInput = {};
    if (title !== this.task().title) change.title = title;
    if (content !== this.task().content) change.content = content;
    if (!Object.keys(change).length) return;
    this.savingText.set(true);
    try {
      const updated = await this.api.updateTask(this.task().id, {
        recurrenceScope: this.editScope(),
        ...change,
      });
      this.changed.emit(updated);
      this.notifications.success('تغییرات ذخیره شد');
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.savingText.set(false);
    }
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

  /** Host and path, without the scheme: short enough for a phone row. */
  protected linkLabel(link: string): string {
    try {
      const u = new URL(link);
      return (u.host + u.pathname + u.search).replace(/\/$/, '');
    } catch {
      return link;
    }
  }

  protected addLink() {
    let link = this.newLink().trim();
    if (!link) return;
    // "youtube.com/…" without a scheme is still meant as a web link.
    if (!/^[a-z][a-z0-9+.-]*:/i.test(link)) link = 'https://' + link;
    if (!/^https?:\/\/\S+$/i.test(link)) {
      this.notifications.error('لینک باید با http:// یا https:// شروع شود');
      return;
    }
    this.newLink.set('');
    if (!this.task().links.includes(link))
      void this.save({ links: [...this.task().links, link] });
  }

  protected removeLink(index: number) {
    void this.save({
      links: this.task().links.filter((_, i) => i !== index),
    });
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
      this.notifications.error(apiErrorMessage(error));
    }
  }

  protected async removeComment(comment: PlannerComment) {
    try {
      await this.api.removeComment(comment.id);
      const rest = this.comments().filter((c) => c.id !== comment.id);
      this.commentsRes.set(rest);
      this.changed.emit({ ...this.task(), commentCount: rest.length });
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    }
  }

  /** TickTick's "Won't Do": closed, not done, kept in history; false reopens. */
  protected setWontDo(wontDo: boolean) {
    void this.run(() => this.api.updateTask(this.task().id, { wontDo }));
  }

  private async run(call: () => Promise<PlannerTask>) {
    try {
      this.changed.emit(await call());
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    }
  }
}
