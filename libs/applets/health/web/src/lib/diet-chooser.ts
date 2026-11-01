import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  type Diet,
  DIET_MODE_LABELS,
  DIET_MODES,
  type DietMode,
  type HealthProfile,
} from '@all-in-one/applets/health/contracts';
import {
  AioButton,
  AioTextarea,
  aioToast,
  AioToggleGroupDirectives,
  AioFormField,
  AioSelectField,
} from '@all-in-one/ui';
import { apiErrorMessage } from '@all-in-one/web/shared';
import { HealthApi } from './health-api';

/**
 * The nutrition question: "Do you follow a diet?" — none (just score my meals),
 * my own diet, pick one of the app's diets, or let the app plan my meals.
 */
@Component({
  selector: 'health-diet-chooser',
  imports: [
    AioButton,
    AioTextarea,
    AioToggleGroupDirectives,
    AioFormField,
    AioSelectField,
  ],
  template: `
    <div class="flex flex-col gap-4">
      <aio-form-field label="رژیم غذایی خاصی دارید؟">
        <div
          aioToggleGroup
          type="single"
          variant="outline"
          orientation="vertical"
          class="w-full"
          [value]="mode()"
          (valueChange)="setMode($event)"
        >
          @for (m of modes; track m) {
            <button
              aioToggleGroupItem
              type="button"
              [value]="m"
              class="h-auto justify-start py-2.5 text-start whitespace-normal"
            >
              {{ modeLabels[m] }}
            </button>
          }
        </div>
      </aio-form-field>

      @if (mode() === 'OWN') {
        <aio-form-field label="رژیمتان را توضیح دهید" controlId="own-diet">
          <textarea
            aioTextarea
            id="own-diet"
            rows="3"
            placeholder="مثلاً: نان و برنج فقط ناهار، شام سبک، روزی ۲ لیوان شیر"
            [value]="notes()"
            (input)="notes.set($any($event.target).value)"
          ></textarea>
        </aio-form-field>
        <aio-select-field
          label="نزدیک‌ترین رژیم برای سنجش وعده‌ها"
          controlId="own-closest"
          [value]="dietSlug()"
          [options]="diets()"
          valueKey="slug"
          labelKey="name"
          (valueChange)="dietSlug.set($event)"
        />
      }

      @if (mode() === 'APP_DIET' || mode() === 'APP_PLAN') {
        <aio-form-field
          [label]="
            mode() === 'APP_PLAN'
              ? 'برنامه بر اساس کدام رژیم چیده شود؟'
              : 'کدام رژیم؟'
          "
        >
          <div
            aioToggleGroup
            type="single"
            variant="outline"
            orientation="vertical"
            class="w-full"
            [value]="dietSlug()"
            (valueChange)="setDiet($event)"
          >
            @for (d of diets(); track d.slug) {
              <button
                aioToggleGroupItem
                type="button"
                [value]="d.slug"
                class="h-auto flex-col items-start gap-0.5 py-2.5 text-start whitespace-normal"
              >
                <span class="font-semibold">{{ d.name }}</span>
                <span class="text-muted-foreground text-xs">{{
                  d.summary
                }}</span>
              </button>
            }
          </div>
        </aio-form-field>
      }

      <button aioBtn [disabled]="saving() || !valid()" (click)="save()">
        ذخیره
      </button>
    </div>
  `,
})
export class DietChooser {
  readonly profile = input.required<HealthProfile>();
  readonly diets = input.required<readonly Diet[]>();
  readonly saved = output<HealthProfile>();

  private readonly api = inject(HealthApi);
  protected readonly modes = DIET_MODES;
  protected readonly modeLabels = DIET_MODE_LABELS;
  protected readonly mode = signal<DietMode>('NONE');
  protected readonly dietSlug = signal('balanced');
  protected readonly notes = signal('');
  protected readonly saving = signal(false);
  protected readonly valid = computed(
    () => this.mode() !== 'OWN' || this.notes().trim().length > 0,
  );

  constructor() {
    effect(() => {
      const p = this.profile();
      this.mode.set(p.dietMode);
      this.dietSlug.set(p.dietSlug ?? 'balanced');
      this.notes.set(p.ownDietNotes ?? '');
    });
  }

  protected setMode(value: unknown) {
    if (typeof value === 'string') this.mode.set(value as DietMode);
  }

  protected setDiet(value: unknown) {
    if (typeof value === 'string') this.dietSlug.set(value);
  }

  protected async save() {
    this.saving.set(true);
    try {
      const mode = this.mode();
      const profile = await this.api.saveProfile({
        dietMode: mode,
        dietSlug: mode === 'NONE' ? null : this.dietSlug(),
        ownDietNotes: mode === 'OWN' ? this.notes().trim() : null,
      });
      aioToast.success('ذخیره شد');
      this.saved.emit(profile);
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
