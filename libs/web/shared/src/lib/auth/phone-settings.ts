import { HttpClient, httpResource } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { iranMobile, type PhoneState } from '@all-in-one/shared/schemas';
import {
  AioButton,
  AioCardDirectives,
  AioCardHeading,
  AioConfirm,
  AioFormField,
  AioInput,
  AioLocale,
  AioNotifications,
  AioTranslate,
} from '@all-in-one/ui';
import { API_BASE_URL } from '../api/api-base-url';
import { apiErrorMessage } from './auth.guards';
import { AuthStore } from './auth.store';

/** `+989121234567` → `09121234567`, as people write it. */
export const localMobile = (phone: string) =>
  phone.startsWith('+98') ? '0' + phone.slice(3) : phone;

/**
 * The account's mobile number, confirmed by a 6-digit SMS code. Used for password reset by SMS and account
 * notices. Hidden while SMS is switched off on the server.
 */
@Component({
  selector: 'web-phone-settings',
  imports: [
    AioButton,
    AioCardDirectives,
    AioCardHeading,
    AioFormField,
    AioInput,
    AioTranslate,
  ],
  template: `
    @if (state.hasValue() && state.value().enabled) {
      @let s = state.value();
      <section aioCard>
        <div
          aioCardHeading
          [title]="'شمارهٔ موبایل' | aioTranslate"
          [level]="2"
          [description]="
            'برای بازیابی رمز با پیامک و خبر تمدید یا پایان اشتراک.'
              | aioTranslate
          "
        ></div>
        <div aioCardContent class="flex flex-col gap-4">
          @if (!s.phone) {
            <p class="bg-accent text-accent-foreground rounded-2xl p-3 text-sm">
              {{
                'با تأیید شماره، یک هفته هوش مصنوعی هدیه می‌گیری.'
                  | aioTranslate
              }}
            </p>
          }
          @if (s.phone) {
            <p class="flex flex-wrap items-center justify-between gap-2">
              <span>{{ 'تأییدشده' | aioTranslate }}</span>
              <bdi dir="ltr" class="font-medium">{{ local(s.phone) }}</bdi>
            </p>
            @if (auth.user()?.email) {
              <button
                aioBtn
                type="button"
                variant="outline"
                class="min-h-11 self-start"
                [disabled]="busy()"
                (click)="remove()"
              >
                {{ 'حذف شماره' | aioTranslate }}
              </button>
            }
          } @else if (s.pending && !changing()) {
            <form
              class="flex flex-col gap-4"
              (submit)="$event.preventDefault(); confirm()"
            >
              <aio-form-field
                [label]="
                  'کد ۶ رقمی فرستاده‌شده به {0}'
                    | aioTranslate: [local(s.pending)]
                "
                controlId="phone-code"
              >
                <input
                  aioInput
                  id="phone-code"
                  dir="ltr"
                  lang="en"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  maxlength="6"
                  [value]="code()"
                  (input)="code.set($any($event.target).value)"
                />
              </aio-form-field>
              <div class="flex flex-wrap gap-2">
                <button
                  aioBtn
                  type="submit"
                  class="min-h-11"
                  [disabled]="busy()"
                >
                  {{ 'تأیید شماره' | aioTranslate }}
                </button>
                <button
                  aioBtn
                  type="button"
                  variant="outline"
                  class="min-h-11"
                  [disabled]="busy()"
                  (click)="send(s.pending)"
                >
                  {{ 'ارسال دوباره' | aioTranslate }}
                </button>
                <button
                  aioBtn
                  type="button"
                  variant="ghost"
                  class="min-h-11"
                  [disabled]="busy()"
                  (click)="changing.set(true)"
                >
                  {{ 'شمارهٔ دیگر' | aioTranslate }}
                </button>
              </div>
            </form>
          } @else {
            <form
              class="flex flex-col gap-4"
              (submit)="$event.preventDefault(); send(phone())"
            >
              <aio-form-field
                [label]="'شمارهٔ موبایل' | aioTranslate"
                controlId="phone-number"
              >
                <input
                  aioInput
                  id="phone-number"
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
              <button
                aioBtn
                type="submit"
                class="min-h-11 self-start"
                [disabled]="busy()"
              >
                {{ 'ارسال کد' | aioTranslate }}
              </button>
            </form>
          }
        </div>
      </section>
    }
  `,
})
export class PhoneSettings {
  private readonly api = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(AioNotifications);
  private readonly ask = inject(AioConfirm);
  /** A phone-only account signs in with this number: it cannot remove it (directive 119). */
  protected readonly auth = inject(AuthStore);
  protected readonly locale = inject(AioLocale);
  protected readonly state = httpResource<PhoneState>(
    () => `${this.api}/auth/phone`,
  );
  protected readonly phone = signal('');
  protected readonly code = signal('');
  protected readonly busy = signal(false);
  protected readonly changing = signal(false);
  protected readonly local = localMobile;

  private async run(work: () => Promise<PhoneState>, success?: string) {
    this.busy.set(true);
    try {
      const state = await work();
      this.state.set(state);
      if (state.rewardedWeek)
        this.notifications.success(
          'شماره تأیید شد و یک هفته هوش مصنوعی هدیه به حسابت اضافه شد.',
        );
      else if (success) this.notifications.success(success);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected send(value: string) {
    const phone = iranMobile(value);
    if (!phone) {
      this.notifications.error('شمارهٔ موبایل درست نیست.');
      return;
    }
    void this.run(async () => {
      const state = await firstValueFrom(
        this.http.post<PhoneState>(`${this.api}/auth/phone`, { phone }),
      );
      this.code.set('');
      this.changing.set(false);
      return state;
    }, 'کد فرستاده شد.');
  }

  protected confirm() {
    const code = this.code().trim();
    if (!/^\d{6}$/.test(iranDigits(code))) {
      this.notifications.error('کد ۶ رقمی را بنویس.');
      return;
    }
    void this.run(
      () =>
        firstValueFrom(
          this.http.post<PhoneState>(`${this.api}/auth/phone/confirm`, {
            code: iranDigits(code),
          }),
        ),
      'شماره تأیید شد.',
    );
  }

  protected async remove() {
    const ok = await this.ask.ask({
      title: 'شماره حذف شود؟',
      description: 'دیگر نمی‌توانی رمز را با پیامک بازیابی کنی.',
      confirmText: 'حذف شماره',
      destructive: true,
    });
    if (!ok) return;
    void this.run(() =>
      firstValueFrom(this.http.delete<PhoneState>(`${this.api}/auth/phone`)),
    );
  }
}

/** Persian or Arabic digits → Latin (codes typed on a Persian keyboard). */
export function iranDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (d) =>
    String(
      '۰۱۲۳۴۵۶۷۸۹'.indexOf(d) >= 0
        ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)
        : '٠١٢٣٤٥٦٧٨٩'.indexOf(d),
    ),
  );
}
