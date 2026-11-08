import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  OnInit,
} from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  submit,
  validateStandardSchema,
} from '@angular/forms/signals';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AioLanguageSwitcher,
  AioTranslate,
  AioButton,
  AioCardDirectives,
  AioInput,
  AioFormField,
  AioFormErrors,
  AioCardHeading,
  AioNotifications,
} from '@all-in-one/ui';
import {
  extractGrowthCampaign,
  iranMobile,
  loginSchema,
} from '@all-in-one/shared/schemas';
import { API_BASE_URL } from '../api/api-base-url';
import { iranDigits, localMobile } from './phone-settings';
import { apiErrorMessage } from './auth.guards';
import { AuthStore } from './auth.store';
import { GrowthAnalytics } from '../growth-analytics';
import { safeAuthRedirect } from './safe-redirect';

/**
 * Login (and optional sign-up) page. Route it at `/login` with `guestGuard`;
 * configure with route data `{ appName, allowRegister }`.
 * Redirects to `?redirect=` (or `/`) after success.
 */
@Component({
  selector: 'web-login-page',
  imports: [
    AioButton,
    AioCardDirectives,
    AioInput,
    FormField,
    FormRoot,
    RouterLink,
    AioFormField,
    AioFormErrors,
    AioCardHeading,
    AioLanguageSwitcher,
    AioTranslate,
  ],
  template: `
    <div class="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center">
      <div class="mb-4 flex justify-end"><aio-language-switcher /></div>
      <section aioCard>
        <div
          aioCardHeading
          [title]="
            smsMode()
              ? ('ورود یا ثبت‌نام' | aioTranslate)
              : mode() === 'login'
                ? 'ورود به ' + name()
                : 'ساخت حساب'
          "
          [level]="1"
          [description]="
            (smsMode()
              ? 'با شمارهٔ موبایل؛ کد ورود برایت پیامک می‌شود.'
              : mode() === 'login'
                ? 'با ایمیل و رمز عبورتان وارد شوید.'
                : 'چند ثانیه بیشتر طول نمی‌کشد.'
            ) | aioTranslate
          "
          titleClass="text-xl"
        ></div>
        @if (smsMode()) {
          <div aioCardContent class="flex flex-col gap-4">
            @if (!smsSentTo()) {
              <form
                class="flex flex-col gap-4"
                (submit)="$event.preventDefault(); requestCode()"
              >
                <aio-form-field
                  [label]="'شمارهٔ موبایل' | aioTranslate"
                  controlId="login-phone"
                >
                  <input
                    aioInput
                    id="login-phone"
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
                <button aioBtn type="submit" size="lg" [disabled]="busy()">
                  {{ 'دریافت کد' | aioTranslate }}
                </button>
              </form>
            } @else {
              <form
                class="flex flex-col gap-4"
                (submit)="$event.preventDefault(); verifyCode()"
              >
                <p
                  class="bg-accent text-accent-foreground rounded-2xl p-3 text-sm"
                  role="status"
                >
                  {{
                    'کد ۶ رقمی به {0} فرستاده شد. کد ۵ دقیقه اعتبار دارد.'
                      | aioTranslate: [local(smsSentTo()!)]
                  }}
                </p>
                <aio-form-field
                  [label]="'کد پیامک' | aioTranslate"
                  controlId="login-code"
                >
                  <input
                    aioInput
                    id="login-code"
                    dir="ltr"
                    lang="en"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    maxlength="6"
                    [value]="code()"
                    (input)="code.set($any($event.target).value)"
                  />
                </aio-form-field>
                <button aioBtn type="submit" size="lg" [disabled]="busy()">
                  {{ 'ورود' | aioTranslate }}
                </button>
                <div class="flex flex-wrap gap-x-4">
                  <button
                    aioBtn
                    type="button"
                    variant="link"
                    class="px-0"
                    [disabled]="busy()"
                    (click)="requestCode()"
                  >
                    {{ 'دوباره بفرست' | aioTranslate }}
                  </button>
                  <button
                    aioBtn
                    type="button"
                    variant="link"
                    class="px-0"
                    [disabled]="busy()"
                    (click)="smsSentTo.set(null); code.set('')"
                  >
                    {{ 'شمارهٔ دیگر' | aioTranslate }}
                  </button>
                </div>
              </form>
            }
            <button
              aioBtn
              type="button"
              variant="link"
              (click)="method.set('email')"
            >
              {{ 'ورود با ایمیل و رمز' | aioTranslate }}
            </button>
          </div>
        } @else {
          <form
            aioCardContent
            class="flex flex-col gap-4"
            [formRoot]="authForm"
            (submit)="$event.preventDefault(); send()"
          >
            @if (mode() === 'register') {
              <aio-form-field [label]="'نام' | aioTranslate" controlId="name">
                <input
                  aioInput
                  id="name"
                  autocomplete="name"
                  [formField]="authForm.name"
                />
              </aio-form-field>
            }
            <aio-form-field [label]="'ایمیل' | aioTranslate" controlId="email">
              <input
                aioInput
                id="email"
                type="email"
                dir="ltr"
                autocomplete="email"
                [formField]="authForm.email"
              />
              <aio-form-errors [errors]="authForm.email().errors()" />
            </aio-form-field>
            <aio-form-field
              [label]="'رمز عبور' | aioTranslate"
              controlId="password"
            >
              <input
                aioInput
                id="password"
                type="password"
                dir="ltr"
                [attr.autocomplete]="
                  mode() === 'login' ? 'current-password' : 'new-password'
                "
                [formField]="authForm.password"
              />
              <aio-form-errors [errors]="authForm.password().errors()" />
            </aio-form-field>
            @if (pendingEmail()) {
              <div
                class="bg-accent text-accent-foreground flex flex-col gap-2 rounded-2xl p-3 text-sm"
                role="status"
              >
                <p>
                  {{ 'لینک تأیید به' | aioTranslate }}
                  <span dir="ltr">{{ pendingEmail() | aioTranslate }}</span>
                  {{
                    'فرستاده شد. ایمیلت را باز کن و روی لینک بزن، بعد وارد شو.'
                      | aioTranslate
                  }}
                </p>
                <button
                  aioBtn
                  type="button"
                  variant="outline"
                  size="sm"
                  class="self-start"
                  [disabled]="busy()"
                  (click)="resend()"
                >
                  {{ 'دوباره بفرست' | aioTranslate }}
                </button>
              </div>
            }
            <button aioBtn type="submit" size="lg" [disabled]="busy()">
              {{ (mode() === 'login' ? 'ورود' : 'ساخت حساب') | aioTranslate }}
            </button>
            @if (mode() === 'login') {
              <a aioBtn variant="link" routerLink="/forgot-password">{{
                'رمز را فراموش کرده‌ای؟' | aioTranslate
              }}</a>
            }
            @if (canRegister()) {
              <button
                aioBtn
                type="button"
                variant="link"
                (click)="toggleMode()"
              >
                {{
                  (mode() === 'login'
                    ? 'حساب ندارید؟ ثبت‌نام کنید'
                    : 'حساب دارید؟ وارد شوید'
                  ) | aioTranslate
                }}
              </button>
            }
            @if (smsAvailable()) {
              <button
                aioBtn
                type="button"
                variant="link"
                (click)="method.set('sms')"
              >
                {{ 'ورود یا ثبت‌نام با شمارهٔ موبایل' | aioTranslate }}
              </button>
            }
          </form>
        }
      </section>
    </div>
  `,
})
export class LoginPage implements OnInit {
  protected readonly analytics = inject(GrowthAnalytics);
  private readonly notifications = inject(AioNotifications);

  // Route data binds these (withComponentInputBinding sets undefined when absent).
  readonly appName = input<string | undefined>();
  readonly allowRegister = input<boolean | undefined>();
  protected readonly name = computed(() => this.appName() ?? 'Poshtetgarm');
  protected readonly canRegister = computed(() => this.allowRegister() ?? true);

  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(API_BASE_URL);

  /** SMS sign-in (directive 119) is the default where sign-up is allowed; admin sign-in stays email-only. */
  protected readonly method = signal<'sms' | 'email'>('sms');
  private readonly sms = httpResource<{ enabled: boolean }>(
    () => `${this.api}/auth/sms`,
  );
  protected readonly smsAvailable = computed(
    () =>
      this.canRegister() &&
      !this.sms.error() &&
      (this.sms.isLoading() || !!this.sms.value()?.enabled),
  );
  protected readonly smsMode = computed(
    () => this.method() === 'sms' && this.smsAvailable(),
  );
  protected readonly phone = signal('');
  protected readonly code = signal('');
  protected readonly smsSentTo = signal<string | null>(null);
  protected readonly local = localMobile;

  protected readonly mode = signal<'login' | 'register'>('login');
  protected readonly busy = signal(false);
  /** Set when an account waits for its emailed confirmation link. */
  protected readonly pendingEmail = signal('');
  protected readonly model = signal({ name: '', email: '', password: '' });
  // Email and password rules are the same for both modes; the name is optional.
  protected readonly authForm = form(this.model, (path) => {
    validateStandardSchema(path, loginSchema);
  });

  constructor() {
    effect(() => {
      if (
        this.mode() === 'register' &&
        this.canRegister() &&
        this.analytics.ready() &&
        this.analytics.choice() === 'granted'
      )
        void this.analytics.track('signup_started');
    });
    if (this.route.snapshot.queryParamMap.has('denied')) {
      this.notifications.error('این حساب به این بخش دسترسی ندارد.');
    }
  }

  ngOnInit(): void {
    if (
      this.canRegister() &&
      this.route.snapshot.queryParamMap.get('mode') === 'register'
    ) {
      this.mode.set('register');
    }
  }

  protected toggleMode() {
    this.mode.update((m) => (m === 'login' ? 'register' : 'login'));
  }

  protected async requestCode() {
    const phone = iranMobile(this.phone());
    if (!phone) {
      this.notifications.error('شمارهٔ موبایل درست نیست.');
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.requestSmsLogin(phone);
      this.smsSentTo.set(phone);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async verifyCode() {
    const code = iranDigits(this.code().trim());
    const phone = this.smsSentTo();
    if (!phone || !/^\d{6}$/.test(code)) {
      this.notifications.error('کد ۶ رقمی را بنویس.');
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.smsLogin(phone, code);
      await this.goNext();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async goNext() {
    const destination = this.router.parseUrl(
      safeAuthRedirect(this.route.snapshot.queryParamMap.get('redirect')),
    );
    destination.queryParams = {
      ...destination.queryParams,
      ...extractGrowthCampaign(this.route.snapshot.queryParamMap),
    };
    await this.router.navigateByUrl(destination);
  }

  protected send() {
    submit(this.authForm, async () => {
      this.busy.set(true);
      try {
        const { name, email, password } = this.model();
        if (this.mode() === 'login') await this.auth.login({ email, password });
        else {
          const result = await this.auth.register({
            email,
            password,
            name: name.trim() || undefined,
          });
          if (result.status === 'verify-email') {
            this.pendingEmail.set(result.email);
            this.mode.set('login');
            return;
          }
        }
        await this.goNext();
      } catch (error) {
        // 403 on login: the account exists but its email is not confirmed yet.
        if (error instanceof HttpErrorResponse && error.status === 403)
          this.pendingEmail.set(this.model().email);
        this.notifications.error(apiErrorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }

  protected async resend() {
    this.busy.set(true);
    try {
      await this.auth.resendVerification(this.pendingEmail());
      this.notifications.success(
        'اگر حسابی با این ایمیل منتظر تأیید باشد، لینک تازه فرستاده شد.',
      );
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
