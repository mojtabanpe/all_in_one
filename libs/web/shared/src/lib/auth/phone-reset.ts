import { HttpClient, httpResource } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { iranMobile } from '@all-in-one/shared/schemas';
import {
  AioButton,
  AioFormField,
  AioInput,
  AioNotifications,
  AioTranslate,
} from '@all-in-one/ui';
import { API_BASE_URL } from '../api/api-base-url';
import { apiErrorMessage } from './auth.guards';
import { iranDigits, localMobile } from './phone-settings';

/**
 * «Forgot password» by SMS, for accounts with a confirmed number: the number, then the code and a new password.
 * Shown only while SMS is switched on; answers the same way for unknown numbers.
 */
@Component({
  selector: 'web-phone-reset',
  imports: [AioButton, AioFormField, AioInput, AioTranslate],
  template: `
    @if (sms.hasValue() && sms.value().enabled) {
      <div class="border-border flex flex-col gap-4 border-t pt-4">
        @if (!open()) {
          <button
            aioBtn
            type="button"
            variant="outline"
            class="min-h-11"
            (click)="open.set(true)"
          >
            {{ 'بازیابی با پیامک' | aioTranslate }}
          </button>
        } @else if (!sentTo()) {
          <form
            class="flex flex-col gap-4"
            (submit)="$event.preventDefault(); request()"
          >
            <aio-form-field
              [label]="'شمارهٔ موبایل تأییدشدهٔ حساب' | aioTranslate"
              controlId="reset-phone"
            >
              <input
                aioInput
                id="reset-phone"
                type="tel"
                dir="ltr"
                lang="en"
                inputmode="tel"
                autocomplete="tel"
                placeholder="09121234567"
                [value]="phone()"
                (input)="phone.set($any($event.target).value)"
              />
            </aio-form-field>
            <button aioBtn type="submit" class="min-h-11" [disabled]="busy()">
              {{ 'فرستادن کد' | aioTranslate }}
            </button>
          </form>
        } @else {
          <form
            class="flex flex-col gap-4"
            (submit)="$event.preventDefault(); reset()"
          >
            <p
              class="bg-accent text-accent-foreground rounded-2xl p-3 text-sm"
              role="status"
            >
              {{
                'اگر این شماره برای حسابی تأیید شده باشد، کد ۶ رقمی به {0} فرستاده شد. کد ۱۰ دقیقه اعتبار دارد.'
                  | aioTranslate: [local(sentTo()!)]
              }}
            </p>
            <aio-form-field
              [label]="'کد پیامک' | aioTranslate"
              controlId="reset-code"
            >
              <input
                aioInput
                id="reset-code"
                dir="ltr"
                lang="en"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="6"
                [value]="code()"
                (input)="code.set($any($event.target).value)"
              />
            </aio-form-field>
            <aio-form-field
              [label]="'رمز تازه' | aioTranslate"
              controlId="reset-password-sms"
            >
              <input
                aioInput
                id="reset-password-sms"
                type="password"
                dir="ltr"
                autocomplete="new-password"
                [value]="password()"
                (input)="password.set($any($event.target).value)"
              />
            </aio-form-field>
            <button aioBtn type="submit" class="min-h-11" [disabled]="busy()">
              {{ 'ذخیره رمز تازه' | aioTranslate }}
            </button>
            <button
              aioBtn
              type="button"
              variant="ghost"
              class="min-h-11"
              [disabled]="busy()"
              (click)="sentTo.set(null)"
            >
              {{ 'شمارهٔ دیگر' | aioTranslate }}
            </button>
          </form>
        }
      </div>
    }
  `,
})
export class PhoneReset {
  private readonly api = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly notifications = inject(AioNotifications);
  protected readonly sms = httpResource<{ enabled: boolean }>(
    () => `${this.api}/auth/sms`,
  );
  protected readonly open = signal(false);
  protected readonly phone = signal('');
  protected readonly sentTo = signal<string | null>(null);
  protected readonly code = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly local = localMobile;

  protected async request() {
    const phone = iranMobile(this.phone());
    if (!phone) {
      this.notifications.error('شمارهٔ موبایل درست نیست.');
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/auth/forgot-password-sms`, { phone }),
      );
      this.sentTo.set(phone);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async reset() {
    const code = iranDigits(this.code().trim());
    if (!/^\d{6}$/.test(code)) {
      this.notifications.error('کد ۶ رقمی را بنویس.');
      return;
    }
    if (this.password().length < 8) {
      this.notifications.error('رمز باید دست‌کم ۸ نویسه باشد.');
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/auth/reset-password-sms`, {
          phone: this.sentTo(),
          code,
          password: this.password(),
        }),
      );
      this.notifications.success('رمز عوض شد. با رمز تازه وارد شو.');
      await this.router.navigate(['/login']);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
