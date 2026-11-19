import { AioLocale } from '@all-in-one/ui';
import { HttpClient } from '@angular/common/http';
import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { LocalReminder } from '@all-in-one/shared/schemas';
import { API_BASE_URL } from '../api/api-base-url';

interface NativeState {
  enabled: boolean;
  token?: string;
  platform: 'ANDROID' | 'MACOS';
  /** Android builds from 1.0.6 schedule reminders on the device instead of using Google's push service. */
  local?: boolean;
}
declare global {
  interface Window {
    PoshtetgarmNative?: {
      request(method: string, data?: unknown): Promise<NativeState>;
    };
  }
}
/** How often an open app refreshes the reminders scheduled on the device. */
const LOCAL_REFRESH_MS = 10 * 60_000;

/** The shell only provides OS permission/token; all API calls use our session cookie. */
@Injectable({ providedIn: 'root' })
export class NativePush {
  private readonly locale = inject(AioLocale);
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private readonly userId = signal<string | null>(null);
  readonly available = signal(
    typeof window !== 'undefined' && !!window.PoshtetgarmNative,
  );
  readonly enabled = signal(false);
  private endpoint?: string;
  private pendingSync?: Promise<void>;
  private paused = false;
  private local = false;

  constructor() {
    if (typeof window !== 'undefined') {
      // Every listener is removed with the service (directive 167).
      const listeners = new AbortController();
      inject(DestroyRef).onDestroy(() => listeners.abort());
      window.addEventListener(
        'poshtetgarm-native-ready',
        () => {
          this.available.set(true);
          void this.sync();
        },
        { signal: listeners.signal },
      );
      window.addEventListener(
        'poshtetgarm-push-token',
        () => void this.sync(),
        {
          signal: listeners.signal,
        },
      );
      // Local reminders: refresh when the app comes back to the front and every 10 minutes while it is open.
      const refresh = () => {
        if (this.local && document.visibilityState === 'visible')
          void this.schedule();
      };
      document.addEventListener('visibilitychange', refresh, {
        signal: listeners.signal,
      });
      const timer = setInterval(refresh, LOCAL_REFRESH_MS);
      listeners.signal.addEventListener('abort', () => clearInterval(timer));
    }
    effect(() => {
      this.locale.language();
      if (this.userId() && this.available()) void this.sync();
    });
  }
  setUser(userId: string | null) {
    if (userId !== this.userId()) this.paused = !userId;
    this.userId.set(userId);
    if (!userId) this.enabled.set(false);
  }
  private request(method: string, data?: unknown) {
    if (!window.PoshtetgarmNative)
      throw new Error('اتصال به اپ در دسترس نیست.');
    return window.PoshtetgarmNative.request(method, data);
  }
  /** The next week's reminders, from the server, scheduled on the device by the app. */
  private async schedule() {
    const items = await firstValueFrom(
      this.http.get<LocalReminder[]>(`${this.api}/push/local-schedule`, {
        params: { language: this.locale.language() },
      }),
    ).catch(() => null);
    if (items && this.local && !this.paused)
      await this.request('schedule', items).catch(() => undefined);
  }
  private async register(state: NativeState) {
    this.local = !!state.local && state.enabled;
    if (this.local) {
      this.enabled.set(true);
      await this.schedule();
      return;
    }
    if (!state.enabled || !state.token) return;
    const result = await firstValueFrom(
      this.http.put<{ endpoint: string }>(
        `${this.api}/push/native/subscription`,
        {
          platform: state.platform,
          token: state.token,
          language: this.locale.language(),
        },
      ),
    );
    const previous = this.endpoint;
    this.endpoint = result.endpoint;
    if (previous && previous !== result.endpoint)
      await firstValueFrom(
        this.http.post(`${this.api}/push/unsubscribe`, { endpoint: previous }),
      );
    this.enabled.set(true);
  }
  async sync() {
    if (!this.userId() || !this.available() || this.paused) return;
    return (this.pendingSync ??= this.syncDevice().finally(() => {
      this.pendingSync = undefined;
    }));
  }
  private async syncDevice() {
    const userId = this.userId();
    try {
      const state = await this.request('status');
      if (this.paused || userId !== this.userId()) return;
      this.enabled.set(false);
      await this.register(state);
    } catch {
      // Offline/revoked sessions must never claim a successful server registration.
      this.enabled.set(false);
    }
  }
  async enable() {
    await this.pendingSync;
    this.paused = false;
    const status = await firstValueFrom(
      this.http.get<{ nativeEnabled: boolean }>(`${this.api}/push/status`),
    );
    const state = await this.request('enable');
    if (state.local) {
      if (!state.enabled) throw new Error('اجازهٔ دریافت اعلان داده نشد.');
      await this.register(state);
      return;
    }
    if (!status.nativeEnabled) {
      await this.request('disable').catch(() => undefined);
      throw new Error('اعلان‌های اپ هنوز روی سرور تنظیم نشده‌اند.');
    }
    if (!state.enabled || !state.token)
      throw new Error('اجازهٔ دریافت اعلان داده نشد.');
    try {
      await this.register(state);
    } catch (error) {
      await this.request('disable').catch(() => undefined);
      throw error;
    }
  }
  async disconnect() {
    // Finish an in-flight registration before removing it, and block token-refresh races.
    this.paused = true;
    await this.pendingSync;
    // Restore the current token after a reload, without requiring permission again.
    const state = await this.request('status');
    if (state.local) {
      await this.request('disable');
      this.local = false;
      this.enabled.set(false);
      return;
    }
    const endpoint =
      this.endpoint ??
      (state.token ? `native:${await this.hash(state.token)}` : undefined);
    if (endpoint)
      await firstValueFrom(
        this.http.post(`${this.api}/push/unsubscribe`, { endpoint }),
      );
    await this.request('disable');
    this.endpoint = undefined;
    this.enabled.set(false);
  }
  async test() {
    await this.sync();
    if (this.local) {
      // A local reminder in a few seconds proves the device side without Google.
      await this.request('test');
      return;
    }
    if (!this.enabled() || !this.endpoint)
      throw new Error('ابتدا اعلان‌ها را فعال کن.');
    await firstValueFrom(
      this.http.post(`${this.api}/push/test`, { endpoint: this.endpoint }),
    );
  }
  private async hash(token: string) {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(token),
    );
    return Array.from(new Uint8Array(digest), (v) =>
      v.toString(16).padStart(2, '0'),
    ).join('');
  }
}
