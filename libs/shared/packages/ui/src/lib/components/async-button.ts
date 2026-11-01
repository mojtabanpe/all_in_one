import { Component, input } from '@angular/core';
import { AioButton } from '../spartan';
import { AioSpinner } from './feedback';
import { AioIcon } from './icon';

/** Native button host preserves submit, focus, click and disabled semantics. */
@Component({
  selector: 'button[aioAsyncButton]',
  host: { '[attr.aria-busy]': 'busy() || null' },
  imports: [AioSpinner, AioIcon],
  template: `
    @if (busy()) {
      <aio-spinner [aria-label]="busyLabel() || label()" />
    } @else if (icon()) {
      <aio-icon [name]="icon()" [size]="iconSize()" />
    }
    {{ busy() && busyLabel() ? busyLabel() : label() }}
  `,
})
export class AioAsyncButton extends AioButton {
  readonly label = input.required<string>();
  readonly busy = input(false);
  readonly busyLabel = input('');
  readonly icon = input('');
  readonly iconSize = input<'xs' | 'sm' | 'base' | 'lg'>('base');
}
