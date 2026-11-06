import { computed, inject, InjectionToken, isDevMode } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

/** Where "start" buttons send visitors: the customer app. */
export const CUSTOMER_APP_URL = new InjectionToken<string>('CUSTOMER_APP_URL', {
  providedIn: 'root',
  // Dev: the customer dev server. Production: serve the customer app under /app (or override this token).
  factory: () => (isDevMode() ? 'http://localhost:4400' : '/app'),
});

/** URL-only attribution: no cookies, browser storage or analytics requests. */
export function injectCustomerLinks() {
  const base = inject(CUSTOMER_APP_URL).replace(/\/$/, '');
  const route = inject(ActivatedRoute);
  const params = toSignal(route.queryParamMap, {
    initialValue: route.snapshot.queryParamMap,
  });
  const campaign = computed(() => {
    const values: Record<string, string> = {};
    for (const key of [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
    ]) {
      const value = params().get(key);
      if (
        value &&
        value.length <= 200 &&
        !Array.from(value).some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        )
      )
        values[key] = value;
    }
    return values;
  });
  const signup = computed(() => {
    const query = new URLSearchParams({ mode: 'register', ...campaign() });
    return `${base}/login?${query}`;
  });
  return { signup, login: `${base}/login`, campaign };
}
