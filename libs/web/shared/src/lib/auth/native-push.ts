import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api/api-base-url';

interface NativeState {
  enabled: boolean;
  token?: string;
  platform: 'ANDROID' | 'MACOS';
}
declare global {
  interface Window {
    PoshtetgarmNative?: { request(method: string): Promise<NativeState> };
  }
}

/** The shell only provides OS permission/token; all API calls use our session cookie. */
@Injectable({ providedIn: 'root' })
export class NativePush {
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

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('poshtetgarm-native-ready', () => {
        this.available.set(true);
        void this.sync();
      });
      window.addEventListener('poshtetgarm-push-token', () => void this.sync());
    }
    effect(() => {
      if (this.userId() && this.available()) void this.sync();
    });
  }
  setUser(userId: string | null) {
    if (userId !== this.userId()) this.paused = !userId;
    this.userId.set(userId);
    if (!userId) this.enabled.set(false);
  }
  private request(method: string) {
    if (!window.PoshtetgarmNative)
      throw new Error('اتصال به اپ در دسترس نیست.');
    return window.PoshtetgarmNative.request(method);
  }
  private async register(state: NativeState) {
    if (!state.enabled || !state.token) return;
    const result = await firstValueFrom(
      this.http.put<{ endpoint: string }>(
        `${this.api}/push/native/subscription`,
        { platform: state.platform, token: state.token },
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
    if (!status.nativeEnabled)
      throw new Error('اعلان‌های اپ هنوز روی سرور تنظیم نشده‌اند.');
    const state = await this.request('enable');
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
