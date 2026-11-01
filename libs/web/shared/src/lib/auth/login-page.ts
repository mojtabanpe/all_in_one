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
  AioButton,
  AioCardDirectives,
  AioFieldDirectives,
  AioFieldError,
  AioInput,
  aioToast,
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
    AioFieldDirectives,
    AioFieldError,
    AioInput,
    FormField,
    FormRoot,
    RouterLink,
  ],
  template: `
    <div class="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center">
      <section aioCard>
        <div aioCardHeader>
          <h1 aioCardTitle class="text-xl">
            {{ mode() === 'login' ? 'ورود به ' + name() : 'ساخت حساب' }}
          </h1>
          <p aioCardDescription>
            {{
              mode() === 'login'
                ? 'با ایمیل و رمز عبورتان وارد شوید.'
                : 'چند ثانیه بیشتر طول نمی‌کشد.'
            }}
          </p>
        </div>
        <form
          aioCardContent
          class="flex flex-col gap-4"
          [formRoot]="authForm"
          (submit)="$event.preventDefault(); send()"
        >
          @if (mode() === 'register') {
            <div aioField>
              <label aioFieldLabel for="name">نام</label>
              <input
                aioInput
                id="name"
                autocomplete="name"
                [formField]="authForm.name"
              />
            </div>
          }
          <div aioField>
            <label aioFieldLabel for="email">ایمیل</label>
            <input
              aioInput
              id="email"
              type="email"
              dir="ltr"
              autocomplete="email"
              [formField]="authForm.email"
            />
            @for (error of authForm.email().errors(); track error.kind) {
              <aio-field-error [validator]="error.kind">{{
                error.message
              }}</aio-field-error>
            }
          </div>
          <div aioField>
            <label aioFieldLabel for="password">رمز عبور</label>
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
            @for (error of authForm.password().errors(); track error.kind) {
              <aio-field-error [validator]="error.kind">{{
                error.message
              }}</aio-field-error>
            }
          </div>
          @if (pendingEmail()) {
            <div
              class="bg-accent text-accent-foreground flex flex-col gap-2 rounded-2xl p-3 text-sm"
              role="status"
            >
              <p>
                لینک تأیید به
                <span dir="ltr">{{ pendingEmail() }}</span> فرستاده شد. ایمیلت
                را باز کن و روی لینک بزن، بعد وارد شو.
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
                دوباره بفرست
              </button>
            </div>
          }
          <button aioBtn type="submit" size="lg" [disabled]="busy()">
            {{ mode() === 'login' ? 'ورود' : 'ساخت حساب' }}
          </button>
          @if (mode() === 'login') {
            <a aioBtn variant="link" routerLink="/forgot-password"
              >رمز را فراموش کرده‌ای؟</a
            >
          }
          @if (canRegister()) {
            <button aioBtn type="button" variant="link" (click)="toggleMode()">
              {{
                mode() === 'login'
                  ? 'حساب ندارید؟ ثبت‌نام کنید'
                  : 'حساب دارید؟ وارد شوید'
              }}
            </button>
          }
        </form>
      </section>
    </div>
  `,
})
export class LoginPage {
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
      aioToast.error('این حساب به این بخش دسترسی ندارد.');
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
        aioToast.error(apiErrorMessage(error));
      } finally {
        this.busy.set(false);
      }
    });
  }

  protected async resend() {
    this.busy.set(true);
    try {
      await this.auth.resendVerification(this.pendingEmail());
      aioToast.success(
        'اگر حسابی با این ایمیل منتظر تأیید باشد، لینک تازه فرستاده شد.',
      );
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
