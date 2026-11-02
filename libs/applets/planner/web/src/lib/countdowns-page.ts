import { httpResource } from '@angular/common/http';
import { Component, inject, linkedSignal, signal } from '@angular/core';
import {
  type CountdownKind,
  COUNTDOWN_KIND_LABELS,
  COUNTDOWN_KINDS,
  type CreateCountdownInput,
  type PlannerColor,
  type PlannerCountdown,
  toIsoDate,
} from '@all-in-one/applets/planner/contracts';
import {
  AioTranslate,
  AioButton,
  AioDateInput,
  AioConfirm,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioEmptyDirectives,
  AioIcon,
  AioInput,
  AioSkeleton,
  AioSwitch,
  provideIcons,
  AioFormField,
  AioSectionHeading,
  AioSelectField,
  AioLocale,
  AioNotifications,
} from '@all-in-one/ui';
import { apiErrorMessage } from '@all-in-one/web/shared';
import { lucideHourglass, lucidePlus, lucideRepeat } from '@ng-icons/lucide';
import { ColorPicker } from './color-picker';
import { TONE } from './colors';
import { PlannerApi } from './planner-api';

interface Draft extends Required<CreateCountdownInput> {
  id?: string;
}

const emptyDraft = (): Draft => ({
  title: '',
  date: toIsoDate(new Date()),
  kind: 'COUNTDOWN',
  repeatYearly: false,
  color: 'rose',
  note: '',
});

/** TickTick countdowns: days left to (or since) dates that matter. */
@Component({
  selector: 'planner-countdowns-page',
  imports: [
    AioButton,
    AioDateInput,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioEmptyDirectives,
    AioIcon,
    AioInput,
    AioSkeleton,
    AioSwitch,
    ColorPicker,
    AioFormField,
    AioSectionHeading,
    AioSelectField,
    AioTranslate,
  ],
  providers: [provideIcons({ lucideHourglass, lucidePlus, lucideRepeat })],
  host: { class: 'flex flex-col gap-5' },
  template: `
    <header
      class="flex items-center justify-between gap-3"
      aioSectionHeading
      [title]="'روزشمار' | aioTranslate"
      [description]="'تولدها، سالگردها و روزهای مهم' | aioTranslate"
      [level]="1"
      titleClass="text-2xl font-bold"
      descriptionClass="text-muted-foreground text-sm"
      textClass=""
    >
      <button aioBtn (click)="open()">
        <aio-icon name="lucidePlus" size="sm" />
        {{ 'روز تازه' | aioTranslate }}
      </button>
    </header>

    @if (res.isLoading() && !res.hasValue()) {
      <div aioSkeleton class="h-24 rounded-2xl"></div>
    } @else {
      <div class="grid gap-3 sm:grid-cols-2">
        @for (c of items(); track c.id) {
          <button
            type="button"
            class="glass flex items-center gap-4 rounded-2xl p-4 text-start"
            (click)="open(c)"
          >
            <span
              [class]="
                'flex size-16 shrink-0 flex-col items-center justify-center rounded-2xl ' +
                tone(c.color).soft +
                ' ' +
                tone(c.color).text
              "
            >
              <span class="text-2xl leading-none font-bold">{{
                fa(abs(c.daysLeft)) | aioTranslate
              }}</span>
              <span class="text-xs">{{ 'روز' | aioTranslate }}</span>
            </span>
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="truncate font-semibold">{{ c.title }}</span>
              <span class="text-muted-foreground text-xs">{{
                phrase(c) | aioTranslate
              }}</span>
              <span
                class="text-muted-foreground flex items-center gap-1 text-xs"
              >
                {{ kindLabels[c.kind] }}، {{ dateLabel(c.nextDate) }}
                @if (c.repeatYearly) {
                  <aio-icon
                    name="lucideRepeat"
                    size="xs"
                    [aria-label]="'هر سال' | aioTranslate"
                  />
                }
              </span>
            </span>
          </button>
        } @empty {
          <div aioEmpty class="glass rounded-2xl sm:col-span-2">
            <div aioEmptyHeader>
              <div aioEmptyMedia variant="icon" class="text-primary">
                <aio-icon name="lucideHourglass" />
              </div>
              <h2 aioEmptyTitle>{{ 'هنوز روزی نشمرده‌ای' | aioTranslate }}</h2>
              <p aioEmptyDescription>
                {{
                  'تولد عزیزان، سالگرد ازدواج یا روز امتحان را اضافه کن.'
                    | aioTranslate
                }}
              </p>
            </div>
          </div>
        }
      </div>
    }

    <aio-dialog
      [(open)]="editing"
      [title]="(draft().id ? 'ویرایش روز' : 'روز تازه') | aioTranslate"
      contentClass="applet-planner sm:max-w-md"
    >
      <ng-template aioDialogBody>
        @let d = draft();
        <form
          id="countdown-form"
          class="flex flex-col gap-4 pb-2"
          (submit)="$event.preventDefault(); save()"
        >
          <aio-form-field [label]="'عنوان' | aioTranslate" controlId="cd-title">
            <input
              aioInput
              id="cd-title"
              [placeholder]="'مثلاً: تولد مامان' | aioTranslate"
              [value]="d.title"
              (input)="patch({ title: $any($event.target).value })"
            />
          </aio-form-field>
          <div class="grid grid-cols-2 gap-3">
            <aio-form-field
              [label]="'تاریخ' | aioTranslate"
              controlId="cd-date"
            >
              <aio-date-input
                contentClass="applet-planner"
                inputId="cd-date"
                required
                [value]="d.date"
                (valueChange)="patch({ date: $event })"
              />
            </aio-form-field>
            <aio-select-field
              [label]="'نوع' | aioTranslate"
              controlId="cd-kind"
              [value]="d.kind"
              [options]="kinds"
              [optionLabels]="kindLabels"
              (valueChange)="setKind($event)"
            />
          </div>
          <p class="text-muted-foreground -mt-2 text-xs">
            {{ dateLabel(d.date, true) | aioTranslate }}
          </p>
          <div class="flex min-h-11 items-center justify-between text-sm">
            <label for="cd-repeat">{{
              'هر سال تکرار شود' | aioTranslate
            }}</label>
            <aio-switch
              inputId="cd-repeat"
              [checked]="d.repeatYearly"
              (checkedChange)="patch({ repeatYearly: $event })"
            />
          </div>
          <planner-color-picker
            [value]="d.color"
            (valueChange)="patch({ color: $event })"
          />
          <aio-form-field
            [label]="'یادداشت' | aioTranslate"
            controlId="cd-note"
          >
            <input
              aioInput
              id="cd-note"
              [value]="d.note"
              (input)="patch({ note: $any($event.target).value })"
            />
          </aio-form-field>
        </form>
      </ng-template>
      <ng-template aioDialogActions>
        @if (draft().id) {
          <button
            aioBtn
            variant="ghost"
            class="text-destructive"
            (click)="remove()"
          >
            {{ 'حذف' | aioTranslate }}
          </button>
        }
        <button
          aioBtn
          type="submit"
          form="countdown-form"
          [disabled]="saving()"
        >
          {{ 'ذخیره' | aioTranslate }}
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class CountdownsPage {
  protected readonly locale = inject(AioLocale);

  private readonly notifications = inject(AioNotifications);

  private readonly api = inject(PlannerApi);
  private readonly confirm = inject(AioConfirm);

  protected readonly kinds = COUNTDOWN_KINDS;
  protected readonly kindLabels = COUNTDOWN_KIND_LABELS;

  protected readonly res = httpResource<PlannerCountdown[]>(
    () => `${this.api.base}/countdowns`,
  );
  protected readonly items = linkedSignal(() =>
    this.res.hasValue() ? this.res.value() : [],
  );
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly draft = signal<Draft>(emptyDraft());

  protected readonly fa = (n: number) => this.locale.number(n);
  protected readonly abs = Math.abs;
  protected readonly tone = (c: PlannerColor) => TONE[c];

  protected phrase(c: PlannerCountdown) {
    if (c.daysLeft === 0) return 'امروز است!';
    if (c.daysLeft > 0) return `${this.locale.number(c.daysLeft)} روز مانده`;
    return `${this.locale.number(-c.daysLeft)} روز گذشته`;
  }

  protected dateLabel(iso: string, year = false) {
    return this.locale.date(iso, {
      day: 'numeric',
      month: 'long',
      ...(year ? { year: 'numeric' } : {}),
    });
  }

  protected open(c?: PlannerCountdown) {
    this.draft.set(
      c
        ? {
            id: c.id,
            title: c.title,
            date: c.date,
            kind: c.kind,
            repeatYearly: c.repeatYearly,
            color: c.color,
            note: c.note,
          }
        : emptyDraft(),
    );
    this.editing.set(true);
  }

  protected patch(change: Partial<Draft>) {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  protected setKind(value: string) {
    const kind = value as CountdownKind;
    this.patch({
      kind,
      repeatYearly:
        kind === 'BIRTHDAY' ||
        kind === 'ANNIVERSARY' ||
        this.draft().repeatYearly,
    });
  }

  protected async save() {
    const { id, ...input } = this.draft();
    if (!input.title.trim() || !input.date) {
      this.notifications.error('عنوان و تاریخ را بنویس.');
      return;
    }
    this.saving.set(true);
    try {
      const body = {
        ...input,
        title: input.title.trim(),
        note: input.note.trim(),
      };
      if (id) await this.api.updateCountdown(id, body);
      else await this.api.createCountdown(body);
      this.res.reload();
      this.editing.set(false);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove() {
    const id = this.draft().id;
    if (!id) return;
    this.editing.set(false);
    const ok = await this.confirm.ask({
      title: `«${this.draft().title}» حذف شود؟`,
      confirmText: 'حذف',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.api.removeCountdown(id);
      this.items.update((list) => list.filter((c) => c.id !== id));
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    }
  }
}
