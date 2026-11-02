import { DOCUMENT } from '@angular/common';
import { AioLocale } from '@all-in-one/ui';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ReviewReminderSettings } from '@all-in-one/shared/schemas';
import { HttpClient } from '@angular/common/http';
import {
  DestroyRef,
  effect,
  inject,
  Injectable,
  signal,
  untracked,
} from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom, take, timeout } from 'rxjs';
import { API_BASE_URL } from '../api/api-base-url';
import { NativePush } from './native-push';

@Injectable({ providedIn: 'root' })
export class PushSettings {
  private readonly locale = inject(AioLocale);
  private readonly native = inject(NativePush);
  private readonly sw = inject(SwPush, { optional: true });
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private readonly userId = signal<string | null>(null);
  private readonly browserSubscription = signal<PushSubscription | null>(null);
  private readonly retry = signal(0);
  private pendingRegistration?: { key: string; promise: Promise<void> };
  readonly enabled = signal(false);
  readonly busy = signal(false);
  readonly message = signal(
    'برای دریافت یادآوری، اعلان‌های این دستگاه را فعال کن. در آیفون ابتدا برنامه را به صفحهٔ اصلی اضافه کن.',
  );
  readonly reviewEnabled = signal(false);
  readonly reviewTime = signal('20:00');
  readonly reviewLoaded = signal(false);
  readonly reviewSaving = signal(false);
  readonly reviewMessage = signal('در حال دریافت تنظیم یادآوری…');
  async loadReview() {
    if (this.reviewSaving()) return;
    this.reviewSaving.set(true);
    try {
      const settings = await firstValueFrom(
        this.http.get<ReviewReminderSettings>(
          `${this.api}/push/review-settings`,
        ),
      );
      this.reviewEnabled.set(settings.enabled);
      this.reviewTime.set(settings.time);
      this.reviewLoaded.set(true);
      this.reviewMessage.set(
        'فقط وقتی کارت آمادهٔ مرور داشته باشی، اعلان می‌فرستیم.',
      );
    } catch {
      this.reviewMessage.set('تنظیم یادآوری دریافت نشد. دوباره تلاش کن.');
    } finally {
      this.reviewSaving.set(false);
    }
  }
  async saveReview() {
    if (this.reviewSaving() || !this.reviewLoaded()) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(this.reviewTime())) {
      this.reviewMessage.set('ساعت یادآوری را مشخص کن.');
      return;
    }
    this.reviewSaving.set(true);
    try {
      const settings = await firstValueFrom(
        this.http.put<ReviewReminderSettings>(
          `${this.api}/push/review-settings`,
          {
            enabled: this.reviewEnabled(),
            time: this.reviewTime(),
          },
        ),
      );
      this.reviewEnabled.set(settings.enabled);
      this.reviewTime.set(settings.time);
      this.reviewMessage.set(
        settings.enabled
          ? this.enabled()
            ? 'یادآوری مرور زبان ذخیره شد.'
            : 'یادآوری ذخیره شد؛ برای دریافت روی این دستگاه، اعلان‌ها را هم فعال کن.'
          : 'یادآوری مرور زبان خاموش شد.',
      );
    } catch {
      this.reviewMessage.set('تنظیم یادآوری ذخیره نشد. دوباره تلاش کن.');
    } finally {
      this.reviewSaving.set(false);
    }
  }
  get supported() {
    return this.native.available() || !!this.sw?.isEnabled;
  }
  constructor() {
    effect(() => {
      const userId = this.userId();
      const sub = this.browserSubscription();
      const language = this.locale.language();
      this.retry();
      if (this.native.available()) return;
      if (!userId || !sub) {
        this.enabled.set(false);
        return;
      }
      untracked(() => {
        void this.register(sub, userId, language).catch(() => {
          if (
            this.userId() !== userId ||
            this.browserSubscription() !== sub ||
            this.locale.language() !== language
          )
            return;
          this.enabled.set(false);
          this.message.set('ارتباط برقرار نشد؛ دوباره تلاش کن.');
        });
      });
    });
    effect(() => {
      if (this.native.available()) this.enabled.set(this.native.enabled());
    });
    this.sw?.subscription.pipe(takeUntilDestroyed()).subscribe((sub) => {
      this.browserSubscription.set(sub);
    });
    const win = inject(DOCUMENT).defaultView;
    const reconnect = () => this.retry.update((value) => value + 1);
    win?.addEventListener('online', reconnect);
    inject(DestroyRef).onDestroy(() =>
      win?.removeEventListener('online', reconnect),
    );
  }
  setUser(userId: string | null) {
    if (userId !== this.userId()) this.enabled.set(false);
    this.userId.set(userId);
  }
  private register(
    sub: PushSubscription,
    userId: string,
    language: 'fa' | 'en',
  ): Promise<void> {
    const key = JSON.stringify([userId, sub.endpoint, language]);
    if (this.pendingRegistration?.key === key)
      return this.pendingRegistration.promise;
    const promise = firstValueFrom(
      this.http.put(`${this.api}/push/subscription`, {
        ...sub.toJSON(),
        language,
      }),
    )
      .then(() => {
        if (
          this.userId() === userId &&
          this.locale.language() === language &&
          this.browserSubscription() === sub
        ) {
          this.enabled.set(true);
          this.message.set(
            'اعلان‌های این دستگاه فعال شد. برای اطمینان یک اعلان آزمایشی بفرست.',
          );
        }
      })
      .finally(() => {
        if (this.pendingRegistration?.promise === promise)
          this.pendingRegistration = undefined;
      });
    this.pendingRegistration = { key, promise };
    return promise;
  }
  private subscription() {
    if (!this.sw?.isEnabled)
      throw new Error(
        'اعلان در این مرورگر در دسترس نیست. نسخهٔ نصب‌شدهٔ برنامه را باز کن.',
      );
    return firstValueFrom(this.sw.subscription.pipe(take(1), timeout(15000)));
  }
  async enable() {
    if (this.native.available()) {
      await this.run(async () => {
        await this.native.enable();
        this.message.set(
          'اعلان‌های اپ فعال شد. برای اطمینان یک اعلان آزمایشی بفرست.',
        );
      });
      return;
    }
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
      // Explicit reconnect must replace expired endpoints and subscriptions made
      // with an old VAPID key, rather than registering the same broken endpoint.
      if (await this.subscription()) await this.disconnect();
      const sub = await this.sw.requestSubscription({
        serverPublicKey: status.publicKey,
      });
      const userId = this.userId();
      if (!userId) throw new Error('ابتدا وارد حساب کاربری شو.');
      this.browserSubscription.set(sub);
      await this.register(sub, userId, this.locale.language());
    });
  }
  async disable() {
    await this.run(async () => {
      await this.disconnect();
      this.message.set('اعلان‌های این دستگاه غیرفعال شد.');
    });
  }
  async disconnect() {
    if (this.native.available()) {
      await this.native.disconnect();
      return;
    }
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
      if (this.native.available()) {
        await this.native.test();
        this.message.set('اعلان آزمایشی ارسال شد.');
        return;
      }
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
