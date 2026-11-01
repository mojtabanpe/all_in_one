import { Component, input } from '@angular/core';
import {
  AioEmpty,
  AioEmptyHeader,
  AioEmptyMedia,
  AioEmptyTitle,
  AioEmptyDescription,
  AioEmptyContent,
} from '../spartan';
import { AioIcon } from './icon';

@Component({
  selector: '[aioEmptyState]',
  hostDirectives: [AioEmpty],
  imports: [
    AioEmptyHeader,
    AioEmptyMedia,
    AioEmptyTitle,
    AioEmptyDescription,
    AioEmptyContent,
    AioIcon,
  ],
  template: `
    <div aioEmptyHeader>
      @if (icon()) {
        <div aioEmptyMedia variant="icon" [class]="iconClass()">
          <aio-icon [name]="icon()" />
        </div>
      }
      @switch (level()) {
        @case (1) {
          <h1 aioEmptyTitle>{{ title() }}</h1>
        }
        @case (3) {
          <h3 aioEmptyTitle>{{ title() }}</h3>
        }
        @default {
          <h2 aioEmptyTitle>{{ title() }}</h2>
        }
      }
      <p aioEmptyDescription>{{ description() }}</p>
    </div>
    <div aioEmptyContent class="empty:hidden"><ng-content /></div>
  `,
})
export class AioEmptyState {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly icon = input('');
  readonly iconClass = input('text-primary');
  readonly level = input<1 | 2 | 3>(2);
}
