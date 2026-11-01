import { Component, computed, input } from '@angular/core';
import { AioSkeleton } from '../spartan';

@Component({
  selector: '[aioSkeletonRows]',
  imports: [AioSkeleton],
  template: `@for (row of rows(); track row) {
    <div aioSkeleton [class]="itemClass()" aria-hidden="true"></div>
  }`,
})
export class AioSkeletonRows {
  readonly count = input(3);
  readonly itemClass = input('h-12 rounded-xl');
  protected readonly rows = computed(() =>
    Array.from({ length: this.count() }, (_, i) => i),
  );
}
