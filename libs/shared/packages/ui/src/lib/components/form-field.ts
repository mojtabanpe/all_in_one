import { AioTranslate } from '../locale';
import { Component, input } from '@angular/core';
import { AioField, AioFieldLabel } from '../spartan';

/** Keeps projected native/Signal Forms controls and their label in one Spartan field. */
@Component({
  selector: 'aio-form-field',
  hostDirectives: [AioField],
  imports: [AioFieldLabel, AioTranslate],
  template: `
    @if (controlId()) {
      <label aioFieldLabel [for]="controlId()" [class]="labelClass()">{{
        label() | aioTranslate
      }}</label>
    } @else {
      <span aioFieldLabel [class]="labelClass()">{{
        label() | aioTranslate
      }}</span>
    }
    <ng-content />
  `,
})
export class AioFormField {
  readonly label = input.required<string>();
  readonly controlId = input<string>();
  readonly labelClass = input('');
}
