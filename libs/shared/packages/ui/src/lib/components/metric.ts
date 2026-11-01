import { Component, input } from '@angular/core';
import { AioSkeleton } from '../spartan';
import { AioIcon } from './icon';

@Component({
  selector: '[aioMetric]',
  imports: [AioSkeleton, AioIcon],
  template: `
    @if (icon()) {
      <aio-icon [name]="icon()" [class]="iconClass()" />
    }
    @if (definition()) {
      <dt [class]="labelClass()">{{ label() }}</dt>
      <dd [class]="valueClass()">{{ value() }}</dd>
    } @else {
      @if (labelFirst()) {
        <p [class]="labelClass()">{{ label() }}</p>
      }
      <strong [class]="valueClass()">
        @if (loading()) {
          <span aioSkeleton [class]="skeletonClass()" aria-hidden="true"></span>
        } @else {
          {{ value() }}
        }
      </strong>
      @if (!labelFirst()) {
        <p [class]="labelClass()">{{ label() }}</p>
      }
    }
  `,
})
export class AioMetric {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly loading = input(false);
  readonly definition = input(false);
  readonly labelFirst = input(true);
  readonly icon = input('');
  readonly iconClass = input('');
  readonly labelClass = input('text-muted-foreground text-xs');
  readonly valueClass = input('font-bold');
  readonly skeletonClass = input('block h-9 w-14 rounded-lg');
}
