import { Component, input } from '@angular/core';
import { AioSkeleton } from '../spartan';

@Component({
  selector: '[aioSectionHeading]',
  imports: [AioSkeleton],
  template: `
    <div [class]="textClass()">
      @switch (level()) {
        @case (1) {
          <h1 [id]="headingId()" [class]="titleClass()">{{ title() }}</h1>
        }
        @case (3) {
          <h3 [id]="headingId()" [class]="titleClass()">{{ title() }}</h3>
        }
        @default {
          <h2 [id]="headingId()" [class]="titleClass()">{{ title() }}</h2>
        }
      }
      @if (description() || loading()) {
        <p [class]="descriptionClass()">
          @if (loading()) {
            <span
              aioSkeleton
              class="block h-5 w-32 rounded-lg"
              aria-hidden="true"
            ></span>
          } @else {
            {{ description() }}
          }
        </p>
      }
    </div>
    <ng-content />
  `,
})
export class AioSectionHeading {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly loading = input(false);
  readonly level = input<1 | 2 | 3>(2);
  readonly headingId = input<string>();
  readonly titleClass = input('text-2xl font-bold');
  readonly descriptionClass = input('text-muted-foreground text-sm');
  readonly textClass = input('min-w-0');
}
