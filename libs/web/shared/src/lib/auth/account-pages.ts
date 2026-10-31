import { PushSettings } from './push-settings';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AioButton,
  AioCardDirectives,
  AioFieldDirectives,
  AioInput,
  AioSpinner,
  AioSwitch,
  aioToast,
} from '@all-in-one/ui';
import { apiErrorMessage } from './auth.guards';
import { AiSettingsCard } from './ai-settings';
import { ChatGptConnection } from './chatgpt-connection';
import { AuthStore } from './auth.store';

const PAGE =
  'mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center';

/** "Forgot password": emails a single-use reset link (same answer for unknown emails). */
@Component({
  selector: 'web-forgot-password-page',
  imports: [
    AioButton,
    AioCardDirectives,
    AioFieldDirectives,
    AioInput,
    RouterLink,
  ],
  template: `
    <div [class]="page">
      <section aioCard>
        <div aioCardHeader>
          <h1 aioCardTitle class="text-xl">بازیابی رمز</h1>
          <p aioCardDescription>
            ایمیلت را بنویس تا لینک انتخاب رمز تازه را بفرستیم.
          </p>
        </div>
        <form
          aioCardContent
          class="flex flex-col gap-4"
          (submit)="$event.preventDefault(); send()"
        >
          @if (sent()) {
            <p
              class="bg-accent text-accent-foreground rounded-2xl p-3 text-sm"
              role="status"
            >
              اگر حسابی با این ایمیل باشد، لینک بازیابی فرستاده شد. لینک یک ساعت
              اعتبار دارد.
            </p>
          }
          <div aioField>
            <label aioFieldLabel for="forgot-email">ایمیل</label>
            <input
              aioInput
              id="forgot-email"
              type="email"
              dir="ltr"
              autocomplete="email"
              [value]="email()"
              (input)="email.set($any($event.target).value)"
            />
          </div>
          <button aioBtn type="submit" size="lg" [disabled]="busy()">
            فرستادن لینک
          </button>
          <a aioBtn variant="link" routerLink="/login">بازگشت به ورود</a>
        </form>
      </section>
    </div>
  `,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthStore);
  protected readonly page = PAGE;
  protected readonly email = signal('');
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);

  protected async send() {
    if (!/^\S+@\S+\.\S+$/.test(this.email().trim())) {
      aioToast.error('یک ایمیل درست بنویس.');
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.forgotPassword(this.email().trim());
      this.sent.set(true);
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Opens from the emailed link (`?token=`): sets a new password and signs out every session. */
@Component({
  selector: 'web-reset-password-page',
  imports: [
    AioButton,
    AioCardDirectives,
    AioFieldDirectives,
    AioInput,
    RouterLink,
  ],
  template: `
    <div [class]="page">
      <section aioCard>
        <div aioCardHeader>
          <h1 aioCardTitle class="text-xl">رمز تازه</h1>
          <p aioCardDescription>رمزی با دست‌کم ۸ نویسه انتخاب کن.</p>
        </div>
        <form
          aioCardContent
          class="flex flex-col gap-4"
          (submit)="$event.preventDefault(); save()"
        >
          @if (!token()) {
            <p class="text-destructive text-sm" role="alert">
              این لینک ناقص است. دوباره درخواست بازیابی بده.
            </p>
          }
          <div aioField>
            <label aioFieldLabel for="reset-password">رمز تازه</label>
            <input
              aioInput
              id="reset-password"
              type="password"
              dir="ltr"
              autocomplete="new-password"
              [value]="password()"
              (input)="password.set($any($event.target).value)"
            />
          </div>
          <div aioField>
            <label aioFieldLabel for="reset-repeat">تکرار رمز</label>
            <input
              aioInput
              id="reset-repeat"
              type="password"
              dir="ltr"
              autocomplete="new-password"
              [value]="repeat()"
              (input)="repeat.set($any($event.target).value)"
            />
          </div>
          <button
            aioBtn
            type="submit"
            size="lg"
            [disabled]="busy() || !token()"
          >
            ذخیره رمز
          </button>
          <a aioBtn variant="link" routerLink="/forgot-password"
            >لینک تازه می‌خواهم</a
          >
        </form>
      </section>
    </div>
  `,
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly page = PAGE;
  protected readonly token = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '',
  );
  protected readonly password = signal('');
  protected readonly repeat = signal('');
  protected readonly busy = signal(false);

  protected async save() {
    if (this.password().length < 8) {
      aioToast.error('رمز باید دست‌کم ۸ نویسه باشد.');
      return;
    }
    if (this.password() !== this.repeat()) {
      aioToast.error('دو رمز یکی نیستند.');
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.resetPassword(this.token(), this.password());
      this.auth.expire();
      aioToast.success('رمز عوض شد. با رمز تازه وارد شو.');
      await this.router.navigateByUrl('/login');
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Opens from the emailed confirmation link (`?token=`). */
@Component({
  selector: 'web-verify-email-page',
  imports: [AioButton, AioCardDirectives, AioSpinner, RouterLink],
  template: `
    <div [class]="page">
      <section aioCard>
        <div aioCardHeader>
          <h1 aioCardTitle class="text-xl">تأیید ایمیل</h1>
        </div>
        <div aioCardContent class="flex flex-col gap-4" role="status">
          @switch (state()) {
            @case ('working') {
              <p class="flex items-center gap-2">
                <aio-spinner /> در حال تأیید…
              </p>
            }
            @case ('done') {
              <p>ایمیلت تأیید شد. حالا وارد شو.</p>
              <a aioBtn size="lg" routerLink="/login">ورود</a>
            }
            @case ('failed') {
              <p class="text-destructive">{{ error() }}</p>
              <a aioBtn variant="outline" routerLink="/login"
                >بازگشت به ورود و فرستادن لینک تازه</a
              >
            }
          }
        </div>
      </section>
    </div>
  `,
})
export class VerifyEmailPage implements OnInit {
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly page = PAGE;
  protected readonly state = signal<'working' | 'done' | 'failed'>('working');
  protected readonly error = signal('');

  async ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    try {
      await this.auth.verifyEmail(token);
      this.state.set('done');
    } catch (error) {
      this.error.set(
        apiErrorMessage(error, 'این لینک تأیید نامعتبر است یا منقضی شده.'),
      );
      this.state.set('failed');
    }
  }
}

/** Signed-in account settings: change password (other devices are signed out). */
@Component({
  selector: 'web-account-page',
  providers: [PushSettings],
  imports: [
    AioButton,
    AioSwitch,
    AioCardDirectives,
    AioFieldDirectives,
    AioInput,
    AiSettingsCard,
    ChatGptConnection,
  ],
  template: `
    <div class="mx-auto flex w-full max-w-lg flex-col gap-6">
      <header class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold">حساب کاربری</h1>
        <p class="text-muted-foreground text-sm" dir="ltr">
          {{ auth.user()?.email }}
        </p>
      </header>
      <section aioCard>
        <div aioCardHeader>
          <h2 aioCardTitle>تغییر رمز</h2>
          <p aioCardDescription>
            بعد از تغییر، دستگاه‌های دیگر از حساب خارج می‌شوند.
          </p>
        </div>
        <form
          aioCardContent
          class="flex flex-col gap-4"
          (submit)="$event.preventDefault(); change()"
        >
          <div aioField>
            <label aioFieldLabel for="current-password">رمز فعلی</label>
            <input
              aioInput
              id="current-password"
              type="password"
              dir="ltr"
              autocomplete="current-password"
              [value]="current()"
              (input)="current.set($any($event.target).value)"
            />
          </div>
          <div aioField>
            <label aioFieldLabel for="new-password">رمز تازه</label>
            <input
              aioInput
              id="new-password"
              type="password"
              dir="ltr"
              autocomplete="new-password"
              [value]="next()"
              (input)="next.set($any($event.target).value)"
            />
          </div>
          <button aioBtn type="submit" class="self-start" [disabled]="busy()">
            ذخیره رمز تازه
          </button>
        </form>
      </section>
      <section aioCard>
        <div aioCardHeader>
          <h2 aioCardTitle>اعلان‌ها</h2>
          <p aioCardDescription>
            یادآوری کارهای زمان‌دار، حتی وقتی برنامه باز نیست.
          </p>
        </div>
        <div aioCardContent class="flex flex-col gap-3">
          <p class="text-muted-foreground text-sm" role="status">
            {{ push.message() }}
          </p>
          @if (push.supported) {
            <div class="flex flex-wrap gap-2">
              <button aioBtn [disabled]="push.busy()" (click)="push.enable()">
                {{ push.enabled() ? 'تازه‌سازی اتصال' : 'فعال‌کردن اعلان‌ها' }}
              </button>
              @if (push.enabled()) {
                <button
                  aioBtn
                  variant="outline"
                  [disabled]="push.busy()"
                  (click)="push.test()"
                >
                  ارسال آزمایشی
                </button>
                <button
                  aioBtn
                  variant="ghost"
                  [disabled]="push.busy()"
                  (click)="push.disable()"
                >
                  غیرفعال‌کردن
                </button>
              }
            </div>
          } @else {
            <p class="text-muted-foreground text-sm">
              اعلان در این نسخه در دسترس نیست؛ برنامه را با HTTPS و مرورگر
              پشتیبانی‌شده باز کن.
            </p>
          }
          <form
            class="border-border mt-2 flex flex-col gap-3 border-t pt-4"
            (submit)="$event.preventDefault(); push.saveReview()"
          >
            <div class="flex min-h-11 items-center justify-between gap-3">
              <label aioFieldLabel for="review-reminder-enabled"
                >یادآوری مرور زبان</label
              >
              <aio-switch
                inputId="review-reminder-enabled"
                [checked]="push.reviewEnabled()"
                (checkedChange)="push.reviewEnabled.set($event)"
                [disabled]="push.reviewSaving() || !push.reviewLoaded()"
              />
            </div>
            <div aioField>
              <label aioFieldLabel for="review-reminder-time"
                >ساعت یادآوری روزانه</label
              >
              <input
                aioInput
                id="review-reminder-time"
                type="time"
                required
                class="min-w-0 max-w-full"
                aria-describedby="review-reminder-description"
                [value]="push.reviewTime()"
                (input)="push.reviewTime.set($any($event.target).value)"
                [disabled]="push.reviewSaving() || !push.reviewLoaded()"
              />
              <p
                id="review-reminder-description"
                class="text-muted-foreground text-xs"
              >
                به وقت تهران؛ برای دریافت یادآوری، اعلان‌های دستگاه را هم فعال
                کن.
              </p>
            </div>
            <p class="text-muted-foreground text-sm" role="status">
              {{ push.reviewMessage() }}
            </p>
            @if (push.reviewLoaded()) {
              <button
                aioBtn
                type="submit"
                class="min-h-11 self-start"
                [disabled]="push.reviewSaving()"
              >
                ذخیره یادآوری
              </button>
            } @else {
              <button
                aioBtn
                type="button"
                variant="outline"
                class="min-h-11 self-start"
                [disabled]="push.reviewSaving()"
                (click)="push.loadReview()"
              >
                دریافت دوباره تنظیمات
              </button>
            }
          </form>
        </div>
      </section>
      <web-ai-settings />
      <web-chatgpt-connection />
      <ng-content />
    </div>
  `,
})
export class AccountPage implements OnInit {
  ngOnInit() {
    void this.push.loadReview();
  }
  protected readonly push = inject(PushSettings);
  protected readonly auth = inject(AuthStore);
  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly busy = signal(false);

  protected async change() {
    if (this.next().length < 8) {
      aioToast.error('رمز تازه باید دست‌کم ۸ نویسه باشد.');
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.changePassword({
        currentPassword: this.current(),
        newPassword: this.next(),
      });
      this.current.set('');
      this.next.set('');
      aioToast.success('رمز عوض شد و دستگاه‌های دیگر خارج شدند.');
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
