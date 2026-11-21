import { DOCUMENT } from '@angular/common';
import {
  HttpErrorResponse,
  type HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import {
  APP_VERSION,
  APP_VERSION_HEADER,
  isNewerVersion,
} from '@all-in-one/shared/schemas';
import { tap } from 'rxjs';
import { API_BASE_URL } from './api-base-url';

/** Current bundle SemVer; overridable in tests. */
export const APP_VERSION_TOKEN = new InjectionToken<string>('APP_VERSION', {
  providedIn: 'root',
  factory: () => APP_VERSION,
});

/** Minimum interval between version-triggered reloads so a stuck cache cannot loop. */
export const RELOAD_COOLDOWN_MS = 60_000;
const RELOAD_STORAGE_KEY = 'aio_version_reload_at';

/** Tracks whether the API announced a newer bundle version via `X-Aio-Version`. */
@Injectable({ providedIn: 'root' })
export class AppVersionState {
  private readonly document = inject(DOCUMENT);
  private readonly currentVersion = inject(APP_VERSION_TOKEN);
  private latestVersion: string | null = null;
  private dismissedVersion: string | null = null;

  /** Latest newer version announced by the API, even during post-reload cooldown. */
  readonly detectedVersion = signal<string | null>(null);
  readonly updateAvailable = signal(false);

  observe(serverVersion: string | null | undefined, now = Date.now()): void {
    const candidate = serverVersion?.trim();
    if (!candidate || !isNewerVersion(candidate, this.currentVersion)) return;
    this.latestVersion = candidate;
    this.detectedVersion.set(candidate);
    if (this.dismissedVersion === candidate) return;
    if (this.inReloadCooldown(now)) return;
    this.updateAvailable.set(true);
  }

  dismiss(): void {
    this.dismissedVersion = this.latestVersion;
    this.updateAvailable.set(false);
  }

  /** Whether a version-triggered reload already happened within the cooldown window. */
  inReloadCooldown(now = Date.now()): boolean {
    const storage = this.storage();
    if (!storage) return false;
    try {
      const last = Number(storage.getItem(RELOAD_STORAGE_KEY));
      return (
        Number.isFinite(last) &&
        last > 0 &&
        now - last >= 0 &&
        now - last < RELOAD_COOLDOWN_MS
      );
    } catch {
      return false;
    }
  }

  /** Records a reload timestamp so a stuck cache does not immediately re-prompt. */
  recordReload(now = Date.now()): void {
    const storage = this.storage();
    if (!storage) return;
    try {
      storage.setItem(RELOAD_STORAGE_KEY, String(now));
    } catch {
      // Storage unavailable (private mode or blocked); ignore.
    }
  }

  /** Claims the reload slot if no version reload happened in the last minute. */
  tryClaimReload(now = Date.now()): boolean {
    if (this.inReloadCooldown(now)) return false;
    this.recordReload(now);
    return true;
  }

  reload(now = Date.now()): boolean {
    if (!this.tryClaimReload(now)) return false;
    this.document.location?.reload();
    return true;
  }

  private storage(): Storage | null {
    try {
      return this.document.defaultView?.sessionStorage ?? null;
    } catch {
      return null;
    }
  }
}

/** Reads `X-Aio-Version` on API responses so updates are noticed even when the service worker is stuck or off. */
export const appVersionInterceptor: HttpInterceptorFn = (req, next) => {
  const apiBase = inject(API_BASE_URL);
  const state = inject(AppVersionState);
  if (!req.url.startsWith(apiBase)) return next(req);
  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          state.observe(event.headers.get(APP_VERSION_HEADER));
        }
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          state.observe(error.headers.get(APP_VERSION_HEADER));
        }
      },
    }),
  );
};
