import { Component, input } from '@angular/core';
import { AioInputGroupAddon, AioInputGroupButton } from '../spartan';
import { AioIcon } from './icon';

@Component({
  selector: 'aio-input-group-submit',
  imports: [AioInputGroupButton, AioIcon],
  template: `<button
    aioInputGroupButton
    type="submit"
    size="icon-sm"
    [attr.aria-label]="label()"
  >
    <aio-icon [name]="icon()" size="sm" />
  </button>`,
})
export class AioInputGroupSubmit extends AioInputGroupAddon {
  override readonly align = input<
    | 'inline-start'
    | 'inline-end'
    | 'block-start'
    | 'block-end'
    | null
    | undefined
  >('inline-end');
  readonly label = input.required<string>();
  readonly icon = input('lucidePlus');
}
