import { AioLocale } from '../locale';
import { Component, inject, input } from '@angular/core';
import { AioFieldError } from './feedback';

@Component({
  selector: 'aio-form-errors',
  host: { class: 'contents' },
  imports: [AioFieldError],
  template: `@for (error of errors(); track error.kind) {
    <aio-field-error [validator]="error.kind">{{
      errorText(error.message)
    }}</aio-field-error>
  }`,
})
export class AioFormErrors {
  private readonly locale = inject(AioLocale);
  protected errorText(message?: string): string {
    const text = this.locale.text(message);
    if (this.locale.english() && /\p{Script=Arabic}/u.test(text))
      return 'Check this field and try again.';
    if (
      !this.locale.english() &&
      /^(Invalid|Too (?:small|big)|Expected|Required)/.test(text)
    )
      return 'مقدار این بخش را بررسی کن.';
    return text;
  }
  readonly errors =
    input.required<readonly { kind: string; message?: string }[]>();
}
