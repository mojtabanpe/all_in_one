import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import type { OnboardingState } from '@all-in-one/shared/schemas';
import { API_BASE_URL, AuthStore } from '@all-in-one/web/shared';
import { firstValueFrom } from 'rxjs';

/** An account needs the first-step page until it skips the guide or does something of its own. */
export function needsWelcome(state: OnboardingState): boolean {
  return !state.skipped && !state.completed && !state.established;
}

/** Asks once per signed-in account and app session, so leaving the page is never a loop. */
@Injectable({ providedIn: 'root' })
export class WelcomeGate {
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private readonly auth = inject(AuthStore);
  private checkedFor: string | null = null;

  async needed(): Promise<boolean> {
    const userId = this.auth.user()?.id;
    if (!userId || this.checkedFor === userId) return false;
    this.checkedFor = userId;
    try {
      return needsWelcome(
        await firstValueFrom(
          this.http.get<OnboardingState>(`${this.api}/onboarding`),
        ),
      );
    } catch {
      // The app must still open when onboarding is unavailable.
      return false;
    }
  }
}

/** Sends a new account to its first step before the home page or an empty applet. */
export const welcomeGuard: CanActivateFn = async (route) => {
  const router = inject(Router);
  return (await inject(WelcomeGate).needed())
    ? router.createUrlTree(['/welcome'], { queryParams: route.queryParams })
    : true;
};
