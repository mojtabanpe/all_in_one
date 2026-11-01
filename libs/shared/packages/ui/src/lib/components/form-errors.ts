import { Component, input } from '@angular/core';
import { AioFieldError } from './feedback';

@Component({
  selector: 'aio-form-errors',
  host: { class: 'contents' },
  imports: [AioFieldError],
  template: `@for (error of errors(); track error.kind) {
    <aio-field-error [validator]="error.kind">{{
      error.message
    }}</aio-field-error>
  }`,
})
export class AioFormErrors {
  readonly errors =
    input.required<readonly { kind: string; message?: string }[]>();
}
