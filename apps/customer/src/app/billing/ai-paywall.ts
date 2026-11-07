import {
  HttpErrorResponse,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { API_BASE_URL, GrowthAnalytics } from '@all-in-one/web/shared';
import { tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AiPaywall {
  private readonly growth = inject(GrowthAnalytics);
  readonly open = signal(false);

  show(): void {
    if (this.open()) return;
    this.open.set(true);
    void this.growth.track('paywall_viewed');
  }
}

export const aiPaywallInterceptor: HttpInterceptorFn = (request, next) => {
  const api = inject(API_BASE_URL);
  if (!request.url.startsWith(api + '/')) return next(request);
  const paywall = inject(AiPaywall);
  return next(request).pipe(
    tap({
      error: (error: unknown) => {
        // Audio endpoints request a Blob and also receive their error body as a Blob.
        if (error instanceof HttpErrorResponse && error.status === 402)
          paywall.show();
      },
    }),
  );
};
