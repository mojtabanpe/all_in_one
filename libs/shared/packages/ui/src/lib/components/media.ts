import { BreakpointObserver } from '@angular/cdk/layout';
import { inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

/** Phone widths, plus touch phones in landscape even when wider than `md`. */
export const MOBILE_MEDIA_QUERY =
  '(max-width: 767.98px), (max-height: 500px) and (pointer: coarse)';

/** True on phone-sized viewports. Must be called in an injection context. */
export function injectIsMobile(): Signal<boolean> {
  const observer = inject(BreakpointObserver);
  return toSignal(
    observer.observe(MOBILE_MEDIA_QUERY).pipe(map((state) => state.matches)),
    { initialValue: observer.isMatched(MOBILE_MEDIA_QUERY) },
  );
}
