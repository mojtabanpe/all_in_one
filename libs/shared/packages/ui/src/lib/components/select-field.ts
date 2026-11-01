import { Component, input, output } from '@angular/core';
import { AioNativeSelect } from './controls';
import { AioNativeSelectOption } from '../spartan';
import { AioFormField } from './form-field';

/** Labeled native picker for object collections or enum/string choices. */
@Component({
  selector: 'aio-select-field',
  host: { class: 'block min-w-0' },
  imports: [AioFormField, AioNativeSelect, AioNativeSelectOption],
  template: `
    <aio-form-field [label]="label()" [controlId]="controlId()">
      <aio-native-select
        [selectId]="controlId()"
        [value]="value()"
        [disabled]="disabled()"
        (valueChange)="valueChange.emit($event)"
      >
        @if (emptyLabel() !== undefined) {
          <option aioNativeSelectOption value="">{{ emptyLabel() }}</option>
        }
        @for (option of options(); track optionValue(option)) {
          <option aioNativeSelectOption [value]="optionValue(option)">
            {{ optionLabel(option) }}
          </option>
        }
      </aio-native-select>
      <ng-content />
    </aio-form-field>
  `,
})
export class AioSelectField<T> {
  readonly label = input.required<string>();
  readonly controlId = input.required<string>();
  readonly options = input.required<readonly T[]>();
  readonly value = input.required<string>();
  readonly disabled = input(false);
  readonly emptyLabel = input<string>();
  readonly valueKey = input<keyof T>();
  readonly labelKey = input<keyof T>();
  readonly fallbackLabelKey = input<keyof T>();
  readonly optionLabels = input<Readonly<Record<string, string>>>({});
  readonly valueChange = output<string>();

  protected optionValue(option: T): string {
    const key = this.valueKey();
    return String(key === undefined ? option : option[key]);
  }
  protected optionLabel(option: T): string {
    const key = this.labelKey();
    if (key === undefined)
      return (
        this.optionLabels()[this.optionValue(option)] ??
        this.optionValue(option)
      );
    const fallback = this.fallbackLabelKey();
    return String(
      option[key] || (fallback === undefined ? '' : option[fallback]),
    );
  }
}
