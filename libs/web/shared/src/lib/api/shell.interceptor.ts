import { type HttpInterceptorFn } from '@angular/common/http';
import { inject, InjectionToken } from '@angular/core';
import { SHELL_HEADER, shellMarkers } from '@all-in-one/shared/schemas';
import { API_BASE_URL } from './api-base-url';

/** The native shell's markers from the page's user agent; empty in a browser. Overridable in tests. */
export const SHELL_MARKERS = new InjectionToken<string>('SHELL_MARKERS', {
  providedIn: 'root',
  factory: () =>
    typeof navigator === 'undefined' ? '' : shellMarkers(navigator.userAgent),
});

/**
 * Sends the shell's markers with API requests ({@link SHELL_HEADER}). Requests forwarded by the service worker lose
 * the shell's user agent in the Android WebView, so without this the server cannot tell a Cafe Bazaar or Myket build.
 */
export const shellInterceptor: HttpInterceptorFn = (req, next) => {
  const markers = inject(SHELL_MARKERS);
  if (!markers || !req.url.startsWith(inject(API_BASE_URL))) return next(req);
  return next(req.clone({ setHeaders: { [SHELL_HEADER]: markers } }));
};
