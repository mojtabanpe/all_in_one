import { AioTranslate } from '../locale';
import { Component, input } from '@angular/core';
import { AioIcon } from './icon';
import { AioSkeletonLines } from './skeleton-lines';

/** Feature navigation card; RouterLink/href stays on the native anchor. */
@Component({
  selector: 'a[aioNavigationCard]',
  host: { class: 'aio-module-card' },
  imports: [AioIcon, AioSkeletonLines, AioTranslate],
  template: `
    <div class="flex items-center justify-between">
      <span class="aio-module-icon"><aio-icon [name]="icon()" /></span>
      <aio-icon
        name="lucideChevronLeft"
        size="sm"
        class="text-muted-foreground ltr:-scale-x-100"
      />
    </div>
    <div class="flex flex-col gap-2">
      <h3 class="text-base font-bold">{{ title() | aioTranslate }}</h3>
      <p class="text-muted-foreground min-h-14 text-sm leading-7">
        @if (loading()) {
          <span aioSkeletonLines></span>
        } @else {
          {{ description() | aioTranslate }}
        }
      </p>
    </div>
    <span class="mt-auto text-xs font-semibold text-primary">{{
      action() | aioTranslate
    }}</span>
  `,
})
export class AioNavigationCard {
  readonly title = input.required<string>();
  readonly icon = input.required<string>();
  readonly description = input.required<string>();
  readonly action = input.required<string>();
  readonly loading = input(false);
}
