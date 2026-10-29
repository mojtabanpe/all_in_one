import { InjectionToken, isDevMode } from '@angular/core';

/** Where "start" buttons send visitors: the customer app. */
export const CUSTOMER_APP_URL = new InjectionToken<string>('CUSTOMER_APP_URL', {
  providedIn: 'root',
  // Dev: the customer dev server. Production: serve the customer app under /app (or override this token).
  factory: () => (isDevMode() ? 'http://localhost:4400' : '/app'),
});
