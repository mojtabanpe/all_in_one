import { httpResource, HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  BillingAccessState,
  ProgressNotificationSettings,
  WeeklyProgress,
} from '@all-in-one/shared/schemas';
import { API_BASE_URL } from '../api/api-base-url';
import { Location } from '@angular/common';
import { extractGrowthCampaign } from '@all-in-one/shared/schemas';
import { PushSettings } from './push-settings';
import {
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AioLanguageSwitcher,
  AioTranslate,
  AioButton,
  AioCardDirectives,
  AioFieldDirectives,
  AioInput,
  AioSpinner,
  AioSwitch,
  AioLocale,
  AioFormField,
  AioCardHeading,
  AioNotifications,
} from '@all-in-one/ui';
import { apiErrorMessage } from './auth.guards';
import { APP_VERSION } from '../release-version';
import { AiConnection } from './ai-connection';
import { localMobile, PhoneSettings } from './phone-settings';
import { PhoneReset } from './phone-reset';
import { AuthStore } from './auth.store';

const PAGE =
  'mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center';

/** "Forgot password": emails a single-use reset link (same answer for unknown emails). */
@Component({
  selector: 'web-forgot-password-page',
  imports: [
    PhoneReset,
    AioButton,
    AioCardDirectives,
    AioInput,
    RouterLink,
    AioFormField,
    AioCardHeading,
    AioLanguageSwitcher,
    AioTranslate,
  ],
  template: `
    <div [class]="page">
      <div class="mb-4 flex justify-end"><aio-language-switcher /></div>
      <section aioCard>
        <div
          aioCardHeading
          [title]="'بازیابی رمز' | aioTranslate"
          [level]="1"
          [description]="
            'ایمیلت را بنویس تا لینک انتخاب رمز تازه را بفرستیم.' | aioTranslate
          "
          titleClass="text-xl"
        ></div>
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
              {{
                'اگر حسابی با این ایمیل باشد، لینک بازیابی فرستاده شد. لینک یک ساعت اعتبار دارد.'
                  | aioTranslate
              }}
            </p>
          }
          <aio-form-field
            [label]="'ایمیل' | aioTranslate"
            controlId="forgot-email"
          >
            <input
              aioInput
              id="forgot-email"
              type="email"
              dir="ltr"
              autocomplete="email"
              [value]="email()"
              (input)="email.set($any($event.target).value)"
            />
          </aio-form-field>
          <button aioBtn type="submit" size="lg" [disabled]="busy()">
            {{ 'فرستادن لینک' | aioTranslate }}
          </button>
          <a aioBtn variant="link" routerLink="/login">{{
            'بازگشت به ورود' | aioTranslate
          }}</a>
        </form>
        <div aioCardFooter class="block"><web-phone-reset /></div>
      </section>
    </div>
  `,
})
export class ForgotPasswordPage {
  private readonly notifications = inject(AioNotifications);

  private readonly auth = inject(AuthStore);
  protected readonly page = PAGE;
  protected readonly email = signal('');
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);

  protected async send() {
    if (!/^\S+@\S+\.\S+$/.test(this.email().trim())) {
      this.notifications.error('یک ایمیل درست بنویس.');
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.forgotPassword(this.email().trim());
      this.sent.set(true);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
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
    AioInput,
    RouterLink,
    AioFormField,
    AioCardHeading,
    AioLanguageSwitcher,
    AioTranslate,
  ],
  template: `
    <div [class]="page">
      <div class="mb-4 flex justify-end"><aio-language-switcher /></div>
      <section aioCard>
        <div
          aioCardHeading
          [title]="'رمز تازه' | aioTranslate"
          [level]="1"
          [description]="'رمزی با دست‌کم ۸ نویسه انتخاب کن.' | aioTranslate"
          titleClass="text-xl"
        ></div>
        <form
          aioCardContent
          class="flex flex-col gap-4"
          (submit)="$event.preventDefault(); save()"
        >
          @if (!token()) {
            <p class="text-destructive text-sm" role="alert">
              {{
                'این لینک ناقص است. دوباره درخواست بازیابی بده.' | aioTranslate
              }}
            </p>
          }
          <aio-form-field
            [label]="'رمز تازه' | aioTranslate"
            controlId="reset-password"
          >
            <input
              aioInput
              id="reset-password"
              type="password"
              dir="ltr"
              autocomplete="new-password"
              [value]="password()"
              (input)="password.set($any($event.target).value)"
            />
          </aio-form-field>
          <aio-form-field
            [label]="'تکرار رمز' | aioTranslate"
            controlId="reset-repeat"
          >
            <input
              aioInput
              id="reset-repeat"
              type="password"
              dir="ltr"
              autocomplete="new-password"
              [value]="repeat()"
              (input)="repeat.set($any($event.target).value)"
            />
          </aio-form-field>
          <button
            aioBtn
            type="submit"
            size="lg"
            [disabled]="busy() || !token()"
          >
            {{ 'ذخیره رمز' | aioTranslate }}
          </button>
          <a aioBtn variant="link" routerLink="/forgot-password">{{
            'لینک تازه می‌خواهم' | aioTranslate
          }}</a>
        </form>
      </section>
    </div>
  `,
})
export class ResetPasswordPage {
  private readonly notifications = inject(AioNotifications);

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
      this.notifications.error('رمز باید دست‌کم ۸ نویسه باشد.');
      return;
    }
    if (this.password() !== this.repeat()) {
      this.notifications.error('دو رمز یکی نیستند.');
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.resetPassword(this.token(), this.password());
      this.auth.expire();
      this.notifications.success('رمز عوض شد. با رمز تازه وارد شو.');
      await this.router.navigateByUrl('/login');
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Opens from the emailed confirmation link (`?token=`). */
@Component({
  selector: 'web-verify-email-page',
  imports: [
    AioButton,
    AioCardDirectives,
    AioSpinner,
    AioCardHeading,
    AioLanguageSwitcher,
    AioTranslate,
  ],
  template: `
    <div [class]="page">
      <div class="mb-4 flex justify-end"><aio-language-switcher /></div>
      <section aioCard>
        <div
          aioCardHeading
          [title]="'تأیید ایمیل' | aioTranslate"
          [level]="1"
          titleClass="text-xl"
        ></div>
        <div aioCardContent class="flex flex-col gap-4" role="status">
          @switch (state()) {
            @case ('working') {
              <p class="flex items-center gap-2">
                <aio-spinner /> {{ 'در حال تأیید…' | aioTranslate }}
              </p>
            }
            @case ('done') {
              <p>{{ 'ایمیلت تأیید شد. حالا وارد شو.' | aioTranslate }}</p>
              @if (rewardedWeek()) {
                <p
                  class="bg-accent text-accent-foreground rounded-2xl p-3 text-sm"
                >
                  {{
                    'یک هفته هوش مصنوعی هدیه به حسابت اضافه شد.' | aioTranslate
                  }}
                </p>
              }
              <a aioBtn size="lg" [href]="loginHref">
                {{ 'ورود' | aioTranslate }}
              </a>
            }
            @case ('failed') {
              <p class="text-destructive">{{ error() | aioTranslate }}</p>
              <a aioBtn variant="outline" [href]="loginHref">
                {{ 'بازگشت به ورود و فرستادن لینک تازه' | aioTranslate }}
              </a>
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
  private readonly router = inject(Router);
  protected readonly loginHref = inject(Location).prepareExternalUrl(
    this.router.serializeUrl(
      this.router.createUrlTree(['/login'], {
        queryParams: extractGrowthCampaign(this.route.snapshot.queryParamMap),
      }),
    ),
  );
  protected readonly page = PAGE;
  protected readonly state = signal<'working' | 'done' | 'failed'>('working');
  protected readonly error = signal('');
  protected readonly rewardedWeek = signal(false);

  async ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    try {
      const { rewardedWeek } = await this.auth.verifyEmail(token);
      this.rewardedWeek.set(rewardedWeek);
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
  imports: [
    PhoneSettings,
    RouterLink,
    AioButton,
    AioSwitch,
    AioCardDirectives,
    AioFieldDirectives,
    AioInput,
    AiConnection,
    AioFormField,
    AioCardHeading,
    AioLanguageSwitcher,
    AioTranslate,
  ],
  template: `
    <div class="mx-auto flex w-full max-w-lg flex-col gap-6">
      <header class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold">{{ 'حساب کاربری' | aioTranslate }}</h1>
        <p class="text-muted-foreground text-sm" dir="ltr" lang="en">
          {{ auth.user()?.email ?? localPhone() }}
        </p>
      </header>
      <!-- A phone-only account is created without a name (directive 119): set it here. -->
      <section aioCard>
        <div
          aioCardHeading
          [title]="'نام نمایشی' | aioTranslate"
          [level]="2"
          [description]="
            'این نام در حساب و اعلان‌ها دیده می‌شود.' | aioTranslate
          "
        ></div>
        <form
          aioCardContent
          class="flex flex-col gap-4"
          (submit)="$event.preventDefault(); saveName()"
        >
          <aio-form-field
            [label]="'نام' | aioTranslate"
            controlId="display-name"
          >
            <input
              aioInput
              id="display-name"
              autocomplete="name"
              [value]="displayName()"
              (input)="displayName.set($any($event.target).value)"
            />
          </aio-form-field>
          <button aioBtn type="submit" class="self-start" [disabled]="busy()">
            {{ 'ذخیرهٔ نام' | aioTranslate }}
          </button>
        </form>
      </section>
      @if (billing()) {
        <section aioCard>
          <div
            aioCardHeading
            [title]="'اشتراک' | aioTranslate"
            [level]="2"
          ></div>
          <div aioCardContent class="flex min-h-11 flex-col gap-1">
            @if (access.hasValue()) {
              @let state = access.value();
              <p class="font-medium">
                @switch (state.tier) {
                  @case ('paid') {
                    {{
                      'اشتراکت تا {0} فعال است.'
                        | aioTranslate: [longDate(state.paidUntil)]
                    }}
                  }
                  @case ('trial') {
                    {{
                      'دورهٔ آزمایشی تا {0} فعال است.'
                        | aioTranslate: [longDate(state.trialUntil)]
                    }}
                  }
                  @case ('earned') {
                    {{
                      'هدیهٔ هوش مصنوعی تا {0} فعال است.'
                        | aioTranslate: [longDate(state.earnedUntil)]
                    }}
                  }
                  @case ('staff') {
                    {{
                      'حساب مدیر است؛ هوش مصنوعی همیشه فعال است.' | aioTranslate
                    }}
                  }
                  @default {
                    {{ 'اشتراک فعالی نداری.' | aioTranslate }}
                  }
                }
              </p>
              @if (state.aiUntil && state.aiUntil > shownEnd(state)) {
                <!-- Weeks queued after the trial or paid time (directives 108, 121). -->
                <p class="text-muted-foreground text-sm">
                  {{
                    'با هفته‌های هدیه، هوش مصنوعی تا {0} فعال است.'
                      | aioTranslate: [longDate(state.aiUntil)]
                  }}
                </p>
              }
              @if (state.tier === 'free') {
                <p class="text-muted-foreground text-sm">
                  {{
                    'برنامه‌ریز، فلش‌کارت‌ها و سلامت رایگان می‌مانند. برای هوش مصنوعی یک پلن فعال کن.'
                      | aioTranslate
                  }}
                </p>
              }
            } @else if (access.error()) {
              <p class="text-muted-foreground text-sm" role="alert">
                {{ 'وضعیت اشتراک دریافت نشد.' | aioTranslate }}
              </p>
            } @else {
              <p class="text-muted-foreground text-sm" role="status">
                {{ 'در حال دریافت…' | aioTranslate }}
              </p>
            }
          </div>
          <div aioCardFooter>
            <a
              aioBtn
              [variant]="
                access.hasValue() && access.value().tier === 'free'
                  ? 'default'
                  : 'outline'
              "
              class="min-h-11"
              routerLink="/billing"
            >
              {{
                (access.hasValue() && access.value().tier === 'free'
                  ? 'دیدن پلن‌ها'
                  : 'مدیریت اشتراک'
                ) | aioTranslate
              }}
            </a>
          </div>
        </section>
      }
      <section aioCard>
        <div
          aioCardHeading
          [title]="'زبان برنامه' | aioTranslate"
          [level]="2"
          [description]="
            'زبان تمام بخش‌های برنامه را انتخاب کن.' | aioTranslate
          "
        ></div>
        <div aioCardContent><aio-language-switcher /></div>
        <div
          aioCardFooter
          class="flex-wrap justify-between gap-2 text-sm text-muted-foreground"
        >
          <span>{{ 'نسخهٔ برنامه' | aioTranslate }}</span>
          <bdi dir="ltr">{{ version }}</bdi>
        </div>
      </section>
      <!-- A password signs in with the email only: phone-only accounts (directive 119) sign in by SMS. -->
      @if (auth.user()?.email) {
        <section aioCard>
          <div
            aioCardHeading
            [title]="'تغییر رمز' | aioTranslate"
            [level]="2"
            [description]="
              'بعد از تغییر، دستگاه‌های دیگر از حساب خارج می‌شوند.'
                | aioTranslate
            "
          ></div>
          <form
            aioCardContent
            class="flex flex-col gap-4"
            (submit)="$event.preventDefault(); change()"
          >
            @if (auth.user()?.hasPassword) {
              <aio-form-field
                [label]="'رمز فعلی' | aioTranslate"
                controlId="current-password"
              >
                <input
                  aioInput
                  id="current-password"
                  type="password"
                  dir="ltr"
                  autocomplete="current-password"
                  [value]="current()"
                  (input)="current.set($any($event.target).value)"
                />
              </aio-form-field>
            }
            <aio-form-field
              [label]="'رمز تازه' | aioTranslate"
              controlId="new-password"
            >
              <input
                aioInput
                id="new-password"
                type="password"
                dir="ltr"
                autocomplete="new-password"
                [value]="next()"
                (input)="next.set($any($event.target).value)"
              />
            </aio-form-field>
            <button aioBtn type="submit" class="self-start" [disabled]="busy()">
              {{ 'ذخیره رمز تازه' | aioTranslate }}
            </button>
          </form>
        </section>
      }
      <web-phone-settings />
      @if (auth.user() && !auth.user()?.email) {
        <!-- Phone-only accounts add an email; confirming it earns one week (directive 121). -->
        <section aioCard>
          <div
            aioCardHeading
            [title]="'افزودن ایمیل' | aioTranslate"
            [level]="2"
            [description]="
              'با تأیید ایمیل، یک هفته هوش مصنوعی هدیه می‌گیری.' | aioTranslate
            "
          ></div>
          <form
            aioCardContent
            class="flex flex-col gap-4"
            (submit)="$event.preventDefault(); addEmail()"
          >
            @if (emailSentTo()) {
              <p
                class="bg-accent text-accent-foreground rounded-2xl p-3 text-sm"
                role="status"
              >
                {{
                  'لینک تأیید به {0} فرستاده شد. ایمیلت را باز کن و روی لینک بزن.'
                    | aioTranslate: [emailSentTo()]
                }}
              </p>
            }
            <aio-form-field
              [label]="'ایمیل' | aioTranslate"
              controlId="add-email"
            >
              <input
                aioInput
                id="add-email"
                type="email"
                dir="ltr"
                lang="en"
                autocomplete="email"
                [value]="newEmail()"
                (input)="newEmail.set($any($event.target).value)"
              />
            </aio-form-field>
            <button aioBtn type="submit" class="self-start" [disabled]="busy()">
              {{ 'فرستادن لینک تأیید' | aioTranslate }}
            </button>
          </form>
        </section>
      }
      <section aioCard>
        <div
          aioCardHeading
          [title]="'اعلان‌ها' | aioTranslate"
          [level]="2"
          [description]="
            'یادآوری کارهای زمان‌دار، حتی وقتی برنامه باز نیست.' | aioTranslate
          "
        ></div>
        <div aioCardContent class="flex flex-col gap-3">
          <p class="text-muted-foreground text-sm" role="status">
            {{ push.message() | aioTranslate }}
          </p>
          @if (push.supported) {
            <div class="flex flex-wrap gap-2">
              <button aioBtn [disabled]="push.busy()" (click)="push.enable()">
                {{
                  (push.enabled() ? 'تازه‌سازی اتصال' : 'فعال‌کردن اعلان‌ها')
                    | aioTranslate
                }}
              </button>
              @if (push.enabled()) {
                <button
                  aioBtn
                  variant="outline"
                  [disabled]="push.busy()"
                  (click)="push.test()"
                >
                  {{ 'ارسال آزمایشی' | aioTranslate }}
                </button>
                <button
                  aioBtn
                  variant="ghost"
                  [disabled]="push.busy()"
                  (click)="push.disable()"
                >
                  {{ 'غیرفعال‌کردن' | aioTranslate }}
                </button>
              }
            </div>
          } @else {
            <p class="text-muted-foreground text-sm">
              {{
                'اعلان در این نسخه در دسترس نیست؛ برنامه را با HTTPS و مرورگر پشتیبانی‌شده باز کن.'
                  | aioTranslate
              }}
            </p>
          }
          <form
            class="border-border mt-2 flex flex-col gap-3 border-t pt-4"
            (submit)="$event.preventDefault(); push.saveReview()"
          >
            <div class="flex min-h-11 items-center justify-between gap-3">
              <label aioFieldLabel for="review-reminder-enabled">{{
                'یادآوری مرور زبان' | aioTranslate
              }}</label>
              <aio-switch
                inputId="review-reminder-enabled"
                [checked]="push.reviewEnabled()"
                (checkedChange)="push.reviewEnabled.set($event)"
                [disabled]="push.reviewSaving() || !push.reviewLoaded()"
              />
            </div>
            <aio-form-field
              [label]="'ساعت یادآوری روزانه' | aioTranslate"
              controlId="review-reminder-time"
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
                {{
                  'به وقت تهران؛ برای دریافت یادآوری، اعلان‌های دستگاه را هم فعال کن.'
                    | aioTranslate
                }}
              </p>
            </aio-form-field>
            <p class="text-muted-foreground text-sm" role="status">
              {{ push.reviewMessage() | aioTranslate }}
            </p>
            @if (push.reviewLoaded()) {
              <button
                aioBtn
                type="submit"
                class="min-h-11 self-start"
                [disabled]="push.reviewSaving()"
              >
                {{ 'ذخیره یادآوری' | aioTranslate }}
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
                {{ 'دریافت دوباره تنظیمات' | aioTranslate }}
              </button>
            }
          </form>
        </div>
      </section>
      <section aioCard id="weekly-progress">
        <div
          aioCardHeading
          [title]="'گزارش هفتگی' | aioTranslate"
          [level]="2"
        ></div>
        <div aioCardContent class="flex flex-col gap-4">
          @if (weekly.isLoading()) {
            <p role="status">
              {{ 'در حال دریافت گزارش هفتگی…' | aioTranslate }}
            </p>
          } @else if (weekly.hasValue()) {
            <p>
              {{ locale.date(weekly.value().from) }} –
              {{ locale.date(weekly.value().to) }}
            </p>
            <dl class="grid grid-cols-2 gap-3">
              @for (metric of weeklyMetrics; track metric.key) {
                <div>
                  <dt>{{ metric.label | aioTranslate }}</dt>
                  <dd class="text-xl font-semibold">
                    {{ locale.number(weekly.value()[metric.key]) }}
                  </dd>
                </div>
              }
            </dl>
          } @else {
            <button
              aioBtn
              type="button"
              variant="outline"
              (click)="weekly.reload()"
            >
              {{ 'دریافت دوباره گزارش هفتگی' | aioTranslate }}
            </button>
          }
          @if (progress.hasValue()) {
            @for (option of progressOptions; track option.key) {
              <div class="flex min-h-11 items-center justify-between gap-3">
                <label [attr.for]="'progress-' + option.key">{{
                  option.label | aioTranslate
                }}</label>
                <aio-switch
                  [inputId]="'progress-' + option.key"
                  [checked]="progress.value()[option.key]"
                  [disabled]="progressSaving() || progress.isLoading()"
                  (checkedChange)="saveProgress(option.key, $event)"
                />
              </div>
            }
            <p class="text-muted-foreground text-sm">
              {{
                'اعلان‌های پیشرفت ساعت ۱۸ به وقت تهران ارسال می‌شوند. اعلان‌های دستگاه را هم فعال کن.'
                  | aioTranslate
              }}
            </p>
          } @else if (progress.isLoading()) {
            <p role="status">
              {{ 'در حال دریافت تنظیم یادآوری…' | aioTranslate }}
            </p>
          } @else {
            <button
              aioBtn
              type="button"
              variant="outline"
              (click)="progress.reload()"
            >
              {{ 'دریافت دوباره تنظیمات' | aioTranslate }}
            </button>
          }
        </div>
      </section>
      <web-ai-connection />
      <ng-content />
    </div>
  `,
})
export class AccountPage implements OnInit {
  protected readonly version = APP_VERSION;
  protected readonly locale = inject(AioLocale);
  private readonly api = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  /** Route data `{ billing: true }` (customer app): show the subscription card. */
  readonly billing = input<boolean | undefined>();
  /** The end the status line already shows for this tier. */
  protected shownEnd(state: BillingAccessState): string {
    return (
      (state.tier === 'paid'
        ? state.paidUntil
        : state.tier === 'earned'
          ? state.earnedUntil
          : state.trialUntil) ?? ''
    );
  }
  protected readonly access = httpResource<BillingAccessState>(() =>
    this.billing() ? `${this.api}/billing/access` : undefined,
  );
  protected longDate(iso: string | null): string {
    return this.locale.date(iso, { dateStyle: 'long' });
  }
  protected readonly weekly = httpResource<WeeklyProgress>(
    () => `${this.api}/push/weekly-progress`,
  );
  protected readonly progress = httpResource<ProgressNotificationSettings>(
    () => `${this.api}/push/progress-settings`,
  );
  protected readonly progressSaving = signal(false);
  protected readonly progressOptions = [
    { key: 'firstWeek', label: 'یادآوری روزهای ۱، ۳ و ۵ بعد از ثبت‌نام' },
    { key: 'weekly', label: 'اعلان گزارش هفتگی در شنبه' },
  ] as const;
  protected readonly weeklyMetrics = [
    { key: 'tasks', label: 'کارهای تکمیل‌شده' },
    { key: 'reviews', label: 'مرورهای فلش‌کارت' },
    { key: 'workouts', label: 'ورزش‌های ثبت‌شده' },
    { key: 'meals', label: 'وعده‌های ثبت‌شده' },
  ] as const;

  protected async saveProgress(
    key: keyof ProgressNotificationSettings,
    value: boolean,
  ) {
    if (this.progressSaving() || !this.progress.hasValue()) return;
    const previous = this.progress.value();
    const next = { ...previous, [key]: value };
    this.progressSaving.set(true);
    this.progress.set(next);
    try {
      this.progress.set(
        await firstValueFrom(
          this.http.put<ProgressNotificationSettings>(
            `${this.api}/push/progress-settings`,
            next,
          ),
        ),
      );
    } catch (error) {
      this.progress.set(previous);
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.progressSaving.set(false);
    }
  }

  private readonly notifications = inject(AioNotifications);

  ngOnInit() {
    this.displayName.set(this.auth.user()?.name ?? '');
    void this.push.loadReview();
  }
  protected readonly push = inject(PushSettings);
  protected readonly auth = inject(AuthStore);
  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly newEmail = signal('');
  protected readonly emailSentTo = signal('');
  protected readonly localPhone = computed(() => {
    const phone = this.auth.user()?.phone;
    return phone ? localMobile(phone) : '';
  });
  protected readonly displayName = signal('');
  protected readonly busy = signal(false);

  protected async saveName() {
    const name = this.displayName().trim();
    if (!name) {
      this.notifications.error(this.locale.text('نام نمی‌تواند خالی باشد.'));
      return;
    }
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.auth.updateName(name);
      this.displayName.set(name);
      this.notifications.success(this.locale.text('نام ذخیره شد.'));
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async addEmail() {
    const email = this.newEmail().trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      this.notifications.error('ایمیل معتبر وارد کن.');
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.addEmail(email);
      this.emailSentTo.set(email);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async change() {
    if (this.next().length < 8) {
      this.notifications.error('رمز تازه باید دست‌کم ۸ نویسه باشد.');
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.changePassword({
        // A phone-only account that added an email sets its first password (directive 121).
        currentPassword: this.auth.user()?.hasPassword
          ? this.current()
          : undefined,
        newPassword: this.next(),
      });
      this.auth.user.update((user) =>
        user ? { ...user, hasPassword: true } : user,
      );
      this.current.set('');
      this.next.set('');
      this.notifications.success('رمز عوض شد و دستگاه‌های دیگر خارج شدند.');
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
