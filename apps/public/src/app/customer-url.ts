import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  computed,
  effect,
  inject,
  InjectionToken,
  isDevMode,
  PLATFORM_ID,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import {
  extractGrowthCampaign,
  landingGoalForPath,
  resolveLandingGoal,
  GOAL_APP_PATHS,
  LANDING_GOAL_COOKIE,
} from '@all-in-one/shared/schemas';

export const CUSTOMER_APP_URL = new InjectionToken<string>('CUSTOMER_APP_URL', {
  providedIn: 'root',
  factory: () => (isDevMode() ? 'http://localhost:4400' : '/app'),
});

/** URL-only handoff; the selected interest is independent of analytics consent. */
export function injectCustomerLinks() {
  const base = inject(CUSTOMER_APP_URL).replace(/\/$/, '');
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const document = inject(DOCUMENT);
  const browser = isPlatformBrowser(inject(PLATFORM_ID));
  const params = toSignal(route.queryParamMap, {
    initialValue: route.snapshot.queryParamMap,
  });
  const path = toSignal(
    router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => router.url.split(/[?#]/)[0]),
    ),
    { initialValue: router.url.split(/[?#]/)[0] },
  );
  const campaign = computed(() => extractGrowthCampaign(params()));
  const goal = computed(
    () => landingGoalForPath(path()) ?? resolveLandingGoal(params()),
  );
  effect(() => {
    const selected = goal();
    if (browser && selected)
      document.cookie = `${LANDING_GOAL_COOKIE}=${selected}; Path=/; Max-Age=7776000; SameSite=Lax${document.location.protocol === 'https:' ? '; Secure' : ''}`;
  });
  const query = () => {
    const selected = goal();
    return {
      ...campaign(),
      ...(selected
        ? { goal: selected, redirect: GOAL_APP_PATHS[selected] }
        : {}),
    };
  };
  const signup = computed(
    () =>
      `${base}/login?${new URLSearchParams({ mode: 'register', ...query() })}`,
  );
  const login = computed(
    () => `${base}/login${goal() ? '?' + new URLSearchParams(query()) : ''}`,
  );
  return { signup, login, campaign, goal };
}
