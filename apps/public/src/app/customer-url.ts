import { computed, inject, InjectionToken, isDevMode } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { extractGrowthCampaign } from '@all-in-one/shared/schemas';

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
  const campaign = computed(() => extractGrowthCampaign(params()));
  const signup = computed(() => {
    const query = new URLSearchParams({ mode: 'register', ...campaign() });
    return `${base}/login?${query}`;
  });
  return { signup, login: `${base}/login`, campaign };
}
