import { Component, inject, input, output, signal } from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  maxLength,
  required,
  submit,
} from '@angular/forms/signals';
import {
  type CreateTaskInput,
  PLANNER_AREA_LABELS,
  PLANNER_AREAS,
  type PlannerArea,
  type TaskPriority,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
} from '@all-in-one/applets/planner/contracts';
import {
  AioFieldDirectives,
  AioFieldError,
  AioInput,
  AioNativeSelect,
  AioNativeSelectOption,
  AioTextarea,
  AioToggleGroupDirectives,
} from '@all-in-one/ui';

/** Fields for a new task; emits the parsed input on submit. */
@Component({
  selector: 'planner-task-form',
  imports: [
    AioFieldDirectives,
    AioFieldError,
    AioInput,
    AioNativeSelect,
    AioNativeSelectOption,
    AioTextarea,
    AioToggleGroupDirectives,
    FormField,
    FormRoot,
  ],
  template: `
    <form
      id="planner-task-form"
      class="flex flex-col gap-4"
      [formRoot]="taskForm"
      (submit)="$event.preventDefault(); send()"
    >
      <div aioField>
        <label aioFieldLabel for="task-title">عنوان</label>
        <input
          aioInput
          id="task-title"
          placeholder="مثلاً: خرید میوه"
          [formField]="taskForm.title"
        />
        @for (error of taskForm.title().errors(); track error.kind) {
          <aio-field-error [validator]="error.kind">{{
            error.message
          }}</aio-field-error>
        }
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div aioField>
          <label aioFieldLabel for="task-date">تاریخ</label>
          <input
            aioInput
            id="task-date"
            type="date"
            [formField]="taskForm.date"
          />
        </div>
        <div aioField>
          <label aioFieldLabel for="task-time">ساعت (اختیاری)</label>
          <input
            aioInput
            id="task-time"
            type="time"
            [formField]="taskForm.time"
          />
        </div>
      </div>
      <div aioField>
        <span aioFieldLabel>اولویت</span>
        <div
          aioToggleGroup
          type="single"
          variant="outline"
          [value]="model().priority"
          (valueChange)="setPriority($event)"
        >
          @for (p of priorities; track p) {
            <button aioToggleGroupItem type="button" [value]="p" class="flex-1">
              {{ priorityLabels[p] }}
            </button>
          }
        </div>
      </div>
      <div aioField>
        <label aioFieldLabel for="task-area">حوزه</label>
        <aio-native-select
          selectId="task-area"
          [value]="model().area"
          (valueChange)="setArea($event)"
        >
          @for (a of areas; track a) {
            <option aioNativeSelectOption [value]="a">
              {{ areaLabels[a] }}
            </option>
          }
        </aio-native-select>
      </div>
      <div aioField>
        <label aioFieldLabel for="task-notes">یادداشت (اختیاری)</label>
        <textarea
          aioTextarea
          id="task-notes"
          rows="2"
          [formField]="taskForm.notes"
        ></textarea>
      </div>
    </form>
  `,
})
export class TaskForm {
  readonly date = input.required<string>();
  readonly saved = output<CreateTaskInput>();

  protected readonly priorities = TASK_PRIORITIES;
  protected readonly priorityLabels = TASK_PRIORITY_LABELS;
  protected readonly areas = PLANNER_AREAS;
  protected readonly areaLabels = PLANNER_AREA_LABELS;

  protected readonly model = signal({
    title: '',
    date: '',
    time: '',
    notes: '',
    priority: 'MEDIUM' as TaskPriority,
    area: 'personal' as PlannerArea,
  });
  protected readonly taskForm = form(this.model, (path) => {
    required(path.title, { message: 'عنوان را بنویسید.' });
    maxLength(path.title, 200, { message: 'عنوان حداکثر ۲۰۰ نویسه است.' });
    required(path.date, { message: 'تاریخ را انتخاب کنید.' });
    maxLength(path.notes, 2000);
  });

  constructor() {
    queueMicrotask(() =>
      this.model.update((m) => ({ ...m, date: m.date || this.date() })),
    );
  }

  protected setPriority(value: unknown) {
    if (typeof value === 'string')
      this.model.update((m) => ({ ...m, priority: value as TaskPriority }));
  }

  protected setArea(value: string) {
    this.model.update((m) => ({ ...m, area: value as PlannerArea }));
  }

  send() {
    submit(this.taskForm, async () => {
      const m = this.model();
      this.saved.emit({
        title: m.title.trim(),
        date: m.date,
        time: m.time || undefined,
        notes: m.notes.trim() || undefined,
        priority: m.priority,
        area: m.area,
      });
    });
  }
}
