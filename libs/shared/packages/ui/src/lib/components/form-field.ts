import { Component, input } from '@angular/core';
import { AioField, AioFieldLabel } from '../spartan';

/** Keeps projected native/Signal Forms controls and their label in one Spartan field. */
@Component({
  selector: 'aio-form-field',
  hostDirectives: [AioField],
  imports: [AioFieldLabel],
  template: `
    @if (controlId()) {
      <label aioFieldLabel [for]="controlId()" [class]="labelClass()">{{
        label()
      }}</label>
    } @else {
      <span aioFieldLabel [class]="labelClass()">{{ label() }}</span>
    }
    <ng-content />
  `,
})
export class AioFormField {
  readonly label = input.required<string>();
  readonly controlId = input<string>();
  readonly labelClass = input('');
}
