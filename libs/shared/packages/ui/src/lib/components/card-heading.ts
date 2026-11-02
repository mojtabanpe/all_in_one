import { AioTranslate } from '../locale';
import { Component, input } from '@angular/core';
import { AioCardHeader, AioCardTitle, AioCardDescription } from '../spartan';

@Component({
  selector: '[aioCardHeading]',
  hostDirectives: [AioCardHeader],
  imports: [AioCardTitle, AioCardDescription, AioTranslate],
  template: `
    @switch (level()) {
      @case (1) {
        <h1 aioCardTitle [id]="headingId()" [class]="titleClass()">
          {{ title() | aioTranslate }}
        </h1>
      }
      @case (3) {
        <h3 aioCardTitle [id]="headingId()" [class]="titleClass()">
          {{ title() | aioTranslate }}
        </h3>
      }
      @default {
        <h2 aioCardTitle [id]="headingId()" [class]="titleClass()">
          {{ title() | aioTranslate }}
        </h2>
      }
    }
    @if (description()) {
      <p aioCardDescription [class]="descriptionClass()">
        {{ description() | aioTranslate }}
      </p>
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
