import { Component, computed, inject, input, signal } from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  submit,
  validateStandardSchema,
} from '@angular/forms/signals';
import { HttpErrorResponse } from '@angular/common/http';
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
import { loginSchema } from '@all-in-one/shared/schemas';
import { apiErrorMessage } from './auth.guards';
import { AuthStore } from './auth.store';

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
          [title]="mode() === 'login' ? 'ورود به ' + name() : 'ساخت حساب'"
          [level]="1"
          [description]="
            (mode() === 'login'
              ? 'با ایمیل و رمز عبورتان وارد شوید.'
              : 'چند ثانیه بیشتر طول نمی‌کشد.'
            ) | aioTranslate
          "
          titleClass="text-xl"
        ></div>
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
            <button aioBtn type="button" variant="link" (click)="toggleMode()">
              {{
                (mode() === 'login'
                  ? 'حساب ندارید؟ ثبت‌نام کنید'
                  : 'حساب دارید؟ وارد شوید'
                ) | aioTranslate
              }}
            </button>
          }
        </form>
      </section>
    </div>
  `,
})
export class LoginPage {
  private readonly notifications = inject(AioNotifications);

  // Route data binds these (withComponentInputBinding sets undefined when absent).
  readonly appName = input<string | undefined>();
  readonly allowRegister = input<boolean | undefined>();
  protected readonly name = computed(() => this.appName() ?? 'Poshtetgarm');
  protected readonly canRegister = computed(() => this.allowRegister() ?? true);

  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

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
    if (this.route.snapshot.queryParamMap.has('denied')) {
      this.notifications.error('این حساب به این بخش دسترسی ندارد.');
    }
  }

  protected toggleMode() {
    this.mode.update((m) => (m === 'login' ? 'register' : 'login'));
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
        const redirect =
          this.route.snapshot.queryParamMap.get('redirect') ?? '/';
        await this.router.navigateByUrl(
          redirect.startsWith('/') ? redirect : '/',
        );
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
