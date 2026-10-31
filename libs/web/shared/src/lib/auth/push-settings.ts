import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom, take, timeout } from 'rxjs';
import { API_BASE_URL } from '../api/api-base-url';

@Injectable({ providedIn: 'root' })
export class PushSettings {
  private readonly sw = inject(SwPush, { optional: true });
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  readonly enabled = signal(false);
  readonly busy = signal(false);
  readonly message = signal(
    'برای دریافت یادآوری، اعلان‌های این دستگاه را فعال کن. در آیفون ابتدا برنامه را به صفحهٔ اصلی اضافه کن.',
  );
  readonly supported = !!this.sw?.isEnabled;
  constructor() {
    this.sw?.subscription.subscribe((sub) => this.enabled.set(!!sub));
  }
  private subscription() {
    if (!this.sw?.isEnabled)
      throw new Error(
        'اعلان در این مرورگر در دسترس نیست. نسخهٔ نصب‌شدهٔ برنامه را باز کن.',
      );
    return firstValueFrom(this.sw.subscription.pipe(take(1), timeout(15000)));
  }
  async enable() {
    const permission =
      typeof Notification !== 'undefined'
        ? Notification.requestPermission()
        : Promise.resolve('denied');
    await this.run(async () => {
      if (!this.sw?.isEnabled)
        throw new Error('اعلان در این مرورگر در دسترس نیست.');
      if ((await permission) !== 'granted')
        throw new Error('اجازهٔ دریافت اعلان داده نشد.');
      const status = await firstValueFrom(
        this.http.get<{ enabled: boolean; publicKey: string | null }>(
          `${this.api}/push/status`,
        ),
      );
      if (!status.enabled || !status.publicKey)
        throw new Error('اعلان‌های سرور هنوز تنظیم نشده‌اند.');
      const sub =
        (await this.subscription()) ??
        (await this.sw.requestSubscription({
          serverPublicKey: status.publicKey,
        }));
      await firstValueFrom(
        this.http.put(`${this.api}/push/subscription`, sub.toJSON()),
      );
      this.enabled.set(true);
      this.message.set(
        'اعلان‌های این دستگاه فعال شد. برای اطمینان یک اعلان آزمایشی بفرست.',
      );
    });
  }
  async disable() {
    await this.run(async () => {
      await this.disconnect();
      this.message.set('اعلان‌های این دستگاه غیرفعال شد.');
    });
  }
  async disconnect() {
    if (!this.sw?.isEnabled) return;
    const sub = await this.subscription();
    if (sub) {
      // Remove server registration before unsubscribing, so a network failure is visible.
      await firstValueFrom(
        this.http.post(`${this.api}/push/unsubscribe`, {
          endpoint: sub.endpoint,
        }),
      );
      await this.sw.unsubscribe();
    }
    this.enabled.set(false);
  }
  async test() {
    await this.run(async () => {
      const sub = await this.subscription();
      if (!sub) throw new Error('ابتدا اعلان‌ها را فعال کن.');
      await firstValueFrom(
        this.http.post(`${this.api}/push/test`, { endpoint: sub.endpoint }),
      );
      this.message.set('اعلان آزمایشی ارسال شد.');
    });
  }
  private async run(action: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      const denied =
        typeof Notification !== 'undefined' &&
        Notification.permission === 'denied';
      this.message.set(
        denied
          ? 'اجازهٔ اعلان بسته است؛ آن را در تنظیمات مرورگر یا گوشی فعال کن.'
          : error instanceof Error
            ? error.message
            : 'ارتباط برقرار نشد؛ دوباره تلاش کن.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
