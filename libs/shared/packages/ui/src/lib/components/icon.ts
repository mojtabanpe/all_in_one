import { Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

export { provideIcons } from '@ng-icons/core';

const SIZES = {
  xs: '0.75rem',
  sm: '1rem',
  base: '1.25rem',
  lg: '1.5rem',
  xl: '2rem',
} as const;

/** Icon (spartan uses ng-icons). Register icons with `provideIcons({ lucideX })`. */
@Component({
  selector: 'aio-icon',
  imports: [NgIcon],
  host: { class: 'inline-flex shrink-0', 'aria-hidden': 'true' },
  template: `<ng-icon [name]="name()" [size]="_size()" />`,
})
export class AioIcon {
  readonly name = input.required<string>();
  readonly size = input<keyof typeof SIZES>('base');
  protected readonly _size = computed(() => SIZES[this.size()]);
}
