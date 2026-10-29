import { BreakpointObserver } from '@angular/cdk/layout';
import { inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

/** Phone sizes: below Tailwind's `md` breakpoint (and spartan's sidebar breakpoint). */
export const MOBILE_MEDIA_QUERY = '(max-width: 767.98px)';

/** True on phone-sized viewports. Must be called in an injection context. */
export function injectIsMobile(): Signal<boolean> {
  const observer = inject(BreakpointObserver);
  return toSignal(
    observer.observe(MOBILE_MEDIA_QUERY).pipe(map((state) => state.matches)),
    { initialValue: observer.isMatched(MOBILE_MEDIA_QUERY) },
  );
}
