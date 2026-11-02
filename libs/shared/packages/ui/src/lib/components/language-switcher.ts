import { Component, inject } from '@angular/core';
import { AioLocale } from '../locale';
import { AioNativeSelect } from './controls';
import { AioNativeSelectOption } from '../spartan';

/** Shared native language picker for app headers and signed-out pages. */
@Component({
  selector: 'aio-language-switcher',
  imports: [AioNativeSelect, AioNativeSelectOption],
  host: { class: 'block w-24 shrink-0' },
  template: `
    <label [for]="controlId" class="sr-only">{{
      locale.english() ? 'Language' : 'زبان'
    }}</label>
    <aio-native-select
      [selectId]="controlId"
      [value]="locale.language()"
      (valueChange)="change($event)"
      [attr.aria-label]="locale.english() ? 'Language' : 'زبان'"
    >
      <option aioNativeSelectOption value="fa">فارسی</option>
      <option aioNativeSelectOption value="en">English</option>
    </aio-native-select>
  `,
})
export class AioLanguageSwitcher {
  protected readonly locale = inject(AioLocale);
  protected readonly controlId = this.locale.controlId();
  protected change(value: string): void {
    if (value === 'fa' || value === 'en') this.locale.setLanguage(value);
  }
}
