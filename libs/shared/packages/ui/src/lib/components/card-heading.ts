import { Component, input } from '@angular/core';
import { AioCardHeader, AioCardTitle, AioCardDescription } from '../spartan';

@Component({
  selector: '[aioCardHeading]',
  hostDirectives: [AioCardHeader],
  imports: [AioCardTitle, AioCardDescription],
  template: `
    @switch (level()) {
      @case (1) {
        <h1 aioCardTitle [id]="headingId()" [class]="titleClass()">
          {{ title() }}
        </h1>
      }
      @case (3) {
        <h3 aioCardTitle [id]="headingId()" [class]="titleClass()">
          {{ title() }}
        </h3>
      }
      @default {
        <h2 aioCardTitle [id]="headingId()" [class]="titleClass()">
          {{ title() }}
        </h2>
      }
    }
    @if (description()) {
      <p aioCardDescription [class]="descriptionClass()">{{ description() }}</p>
    }
    <ng-content />
  `,
})
export class AioCardHeading {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly level = input<1 | 2 | 3>(2);
  readonly headingId = input<string>();
  readonly titleClass = input('');
  readonly descriptionClass = input('');
}
