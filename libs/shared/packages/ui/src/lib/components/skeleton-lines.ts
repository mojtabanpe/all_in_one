import { Component, input } from '@angular/core';
import { AioSkeleton } from '../spartan';

@Component({
  selector: '[aioSkeletonLines]',
  host: { 'aria-hidden': 'true' },
  imports: [AioSkeleton],
  template: `@for (line of lines(); track $index) {
    <span aioSkeleton [class]="line"></span>
  }`,
})
export class AioSkeletonLines {
  readonly lines = input<readonly string[]>([
    'block h-5 w-3/4 rounded-lg',
    'mt-2 block h-5 w-1/2 rounded-lg',
  ]);
}
