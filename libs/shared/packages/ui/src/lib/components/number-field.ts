import { Component, input } from '@angular/core';
import { FormField, type Field } from '@angular/forms/signals';
import { AioInput } from '../spartan';
import { AioFormField } from './form-field';
import { AioFormErrors } from './form-errors';

@Component({
  selector: 'aio-number-field',
  host: { class: 'block min-w-0' },
  imports: [AioInput, AioFormField, FormField, AioFormErrors],
  template: `
    <aio-form-field [label]="label()" [controlId]="controlId()">
      <input
        aioInput
        type="number"
        [id]="controlId()"
        [formField]="field()"
        [attr.inputmode]="inputMode()"
        [attr.step]="step()"
        [class]="inputClass()"
      />
      @if (showErrors()) {
        <aio-form-errors [errors]="field()().errors()" />
      }
    </aio-form-field>
  `,
})
export class AioNumberField<T extends number | null> {
  readonly label = input.required<string>();
  readonly controlId = input.required<string>();
  readonly field = input.required<Field<T>>();
  readonly inputMode = input('numeric');
  readonly step = input<string | number>();
  readonly inputClass = input('');
  readonly showErrors = input(false);
}
