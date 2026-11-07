import {
  HttpErrorResponse,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { retry, timer } from 'rxjs';
import { API_BASE_URL } from './api-base-url';

/** Statuses a release produces for a moment: no answer (0) or the proxy finding no server. */
const RESTARTING = new Set([0, 502, 503, 504]);
/** Wait before each retry: about 3 seconds in all, longer than the router's restart during a release. */
export const RESTART_RETRY_DELAYS = [700, 2_000];

/**
 * Retries API reads (GET/HEAD) that failed because the server was restarting during a release. Writes are never
 * retried, so nothing is sent twice; other errors pass through at once.
 */
export const restartRetryInterceptor: HttpInterceptorFn = (request, next) => {
  const api = inject(API_BASE_URL);
  if (
    !request.url.startsWith(api + '/') ||
    (request.method !== 'GET' && request.method !== 'HEAD')
  )
    return next(request);
  return next(request).pipe(
    retry({
      count: RESTART_RETRY_DELAYS.length,
      delay: (error: unknown, attempt) => {
        if (error instanceof HttpErrorResponse && RESTARTING.has(error.status))
          return timer(RESTART_RETRY_DELAYS[attempt - 1]);
        throw error;
      },
    }),
  );
};
