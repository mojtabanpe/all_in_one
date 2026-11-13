import { firstValueFrom } from 'rxjs';
import {
  Component,
  computed,
  effect,
  inject,
  isDevMode,
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
import {
  HttpClient,
  HttpErrorResponse,
  httpResource,
} from '@angular/common/http';
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
  AioAlertDirectives,
} from '@all-in-one/ui';
import {
  extractGrowthCampaign,
  iranMobile,
  loginSchema,
  onboardingGoalSchema,
  GOAL_APP_PATHS,
  type OnboardingState,
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
    AioAlertDirectives,
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
    <div
      class="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom))] md:px-8 md:pb-12"
    >
      <header class="flex items-center justify-between gap-3">
        <span class="flex items-center gap-2">
          <img
            src="brand-logo.png"
            alt=""
            width="36"
            height="36"
            class="size-9 rounded-xl"
          />
          <span class="text-base font-semibold" dir="ltr">Poshtetgarm</span>
        </span>
        <aio-language-switcher />
      </header>

      <main class="flex flex-1 flex-col justify-center py-8">
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
                ? smsPreview()
                  ? 'پیش‌نمایش محلی فرم ورود با شمارهٔ موبایل.'
                  : 'فقط شمارهٔ موبایل؛ کد ورود برایت پیامک می‌شود.'
                : mode() === 'login'
                  ? 'با ایمیل و رمز عبورتان وارد شوید.'
                  : 'فقط ایمیل و یک رمز؛ نام را بعداً در حساب کاربری می‌گذاری.'
              ) | aioTranslate
            "
            titleClass="text-2xl"
          ></div>

          <div aioCardContent class="flex flex-col gap-4">
            @if (smsAvailable()) {
              <div
                class="bg-muted grid grid-cols-2 gap-1 rounded-2xl p-1"
                role="group"
                [attr.aria-label]="'روش ورود' | aioTranslate"
              >
                <button
                  aioBtn
                  type="button"
                  size="sm"
                  class="w-full"
                  [variant]="smsMode() ? 'default' : 'ghost'"
                  (click)="method.set('sms')"
                >
                  {{ 'شمارهٔ موبایل' | aioTranslate }}
                </button>
                <button
                  aioBtn
                  type="button"
                  size="sm"
                  class="w-full"
                  [variant]="smsMode() ? 'ghost' : 'default'"
                  (click)="method.set('email')"
                >
                  {{ 'ایمیل' | aioTranslate }}
                </button>
              </div>
            }

            @if (smsMode()) {
              @if (smsPreview()) {
                <div aioAlert>
                  <h2 aioAlertTitle>{{ 'پیش‌نمایش محلی' | aioTranslate }}</h2>
                  <p aioAlertDescription>
                    {{
                      'کلید پیامک خالی است؛ فرم برای بررسی نمایش داده می‌شود و پیامکی ارسال نمی‌شود.'
                        | aioTranslate
                    }}
                  </p>
                </div>
              }
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
                  <button
                    aioBtn
                    type="submit"
                    size="lg"
                    class="w-full"
                    [disabled]="busy() || smsPreview()"
                  >
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
                  <button
                    aioBtn
                    type="submit"
                    size="lg"
                    class="w-full"
                    [disabled]="busy()"
                  >
                    {{ 'ورود' | aioTranslate }}
                  </button>
                  <div class="flex flex-wrap justify-center gap-x-4">
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
            } @else {
              <form
                class="flex flex-col gap-4"
                [formRoot]="authForm"
                (submit)="$event.preventDefault(); send()"
              >
                <aio-form-field
                  [label]="'ایمیل' | aioTranslate"
                  controlId="email"
                >
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
                <button
                  aioBtn
                  type="submit"
                  size="lg"
                  class="w-full"
                  [disabled]="busy()"
                >
                  {{
                    (mode() === 'login' ? 'ورود' : 'ساخت حساب') | aioTranslate
                  }}
                </button>
                @if (mode() === 'login' || canRegister()) {
                  <div class="flex flex-col items-center gap-1 pt-1">
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
                  </div>
                }
              </form>
            }
          </div>
        </section>
      </main>
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
  /** Development-only visual preview. It never enables the SMS provider or sends a code. */
  protected readonly smsPreview = computed(
    () =>
      isDevMode() &&
      this.canRegister() &&
      this.sms.hasValue() &&
      !this.sms.value().enabled,
  );
  protected readonly smsAvailable = computed(
    () =>
      this.canRegister() &&
      !this.sms.error() &&
      (this.sms.isLoading() ||
        !!this.sms.value()?.enabled ||
        this.smsPreview()),
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
  // Sign-up asks for the least that can work: an email and a password. The name is set later in
  // the account page (it is optional in `registerSchema`), so a new account never stalls here.
  protected readonly model = signal({ email: '', password: '' });
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
    if (this.smsPreview()) return;
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
      await this.auth.smsLogin(phone, code, this.entryGoal());
      await this.goNext();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private readonly http = inject(HttpClient);
  private entryGoal() {
    const parsed = onboardingGoalSchema.safeParse(
      this.route.snapshot.queryParamMap.get('goal'),
    );
    return parsed.success ? parsed.data : undefined;
  }

  private async goNext() {
    let target = safeAuthRedirect(
      this.route.snapshot.queryParamMap.get('redirect'),
    );
    if (target === '/') {
      const goal = this.entryGoal();
      if (goal) target = GOAL_APP_PATHS[goal];
      else if (this.canRegister()) {
        // Email verification may happen on another device: the chosen goal belongs to the account.
        try {
          const state = await firstValueFrom(
            this.http.get<OnboardingState>(`${this.api}/onboarding`),
          );
          if (
            state.goal &&
            !state.completed &&
            !state.skipped &&
            !state.established
          )
            target = GOAL_APP_PATHS[state.goal];
        } catch {
          /* Signing in must still work when onboarding is unavailable. */
        }
      }
    }
    const destination = this.router.parseUrl(target);
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
        const { email, password } = this.model();
        if (this.mode() === 'login') await this.auth.login({ email, password });
        else {
          const result = await this.auth.register({
            email,
            password,
            goal: this.entryGoal(),
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
