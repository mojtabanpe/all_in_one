import { Injectable, signal } from '@angular/core';

/**
 * Asks the app shell to recreate the routed page, so its resources load again while the shell stays. The
 * assistant uses it after it changed data (the old trick of navigating to `/` and back did nothing on home, where
 * the calories a meal changed stayed at zero); the customer layout keys its router outlet on `version`.
 */
@Injectable({ providedIn: 'root' })
export class PageRefresh {
  private readonly count = signal(0);
  readonly version = this.count.asReadonly();

  refresh(): void {
    this.count.update((n) => n + 1);
  }
}
