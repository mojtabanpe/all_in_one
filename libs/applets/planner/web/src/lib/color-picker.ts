import { Component, model } from '@angular/core';
import {
  PLANNER_COLORS,
  type PlannerColor,
} from '@all-in-one/applets/planner/contracts';
import { COLOR_LABELS, TONE } from './colors';

/** Round colour swatches with 44px targets; `[(value)]`. */
@Component({
  selector: 'planner-color-picker',
  template: `
    <div class="flex flex-wrap gap-1" role="radiogroup" aria-label="رنگ">
      @for (c of colors; track c) {
        <button
          type="button"
          role="radio"
          class="grid size-11 place-items-center rounded-full"
          [attr.aria-checked]="value() === c"
          [attr.aria-label]="labels[c]"
          (click)="value.set(c)"
        >
          <span [class]="swatch(c)"></span>
        </button>
      }
    </div>
  `,
})
export class ColorPicker {
  readonly value = model<PlannerColor>('sky');
  protected readonly colors = PLANNER_COLORS;
  protected readonly labels = COLOR_LABELS;

  protected swatch(c: PlannerColor) {
    const on =
      this.value() === c ? ` ring-2 ring-offset-2 ${TONE[c].ring}` : '';
    return `size-7 rounded-full ${TONE[c].dot}${on}`;
  }
}
