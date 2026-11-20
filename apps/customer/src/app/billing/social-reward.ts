import { HttpClient, httpResource } from '@angular/common/http';
import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  billingRewardRequestSchema,
  type BillingRewardOffer,
  type TelegramRewardCheck,
  type TelegramStatus,
} from '@all-in-one/shared/schemas';
import {
  AioAsyncButton,
  AioButton,
  AioFormField,
  AioInput,
  AioNotifications,
  AioTranslate,
  verbatim,
} from '@all-in-one/ui';
import {
  API_BASE_URL,
  apiErrorMessage,
  TelegramSettings,
} from '@all-in-one/web/shared';

/**
 * One Telegram or Instagram week (directives 108, 189), shared by the subscription page and the in-app sheet:
 * the official address stays visible with its link, each state says what happens next, and the Telegram week is
 * checked by the bot for a linked account instead of waiting for support.
 */
@Component({
  selector: 'customer-social-reward',
  imports: [
    AioAsyncButton,
    AioButton,
    AioFormField,
    AioInput,
    AioTranslate,
    TelegramSettings,
  ],
  template: `
    @let o = offer();
    <div class="flex min-w-0 flex-col gap-3">
      <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 class="font-semibold">{{ title() | aioTranslate }}</h3>
        @if (o.account) {
          <a
            class="text-primary min-h-11 content-center text-sm font-medium underline-offset-4 hover:underline"
            [href]="o.url"
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
            >&#64;{{ o.account }}</a
          >
        }
      </div>
      @switch (o.status) {
        @case ('earned') {
          <p>{{ 'هفتهٔ هدیه به اشتراکت اضافه شد.' | aioTranslate }}</p>
        }
        @case ('pending') {
          <p role="status">
            {{
              'نام کاربری {0} فرستاده شد. عضویتت را بررسی می‌کنیم و بعد از تأیید، هفتهٔ هدیه خودکار اضافه می‌شود و در برنامه خبرت می‌کنیم.'
                | aioTranslate: [verbatim('@' + (o.handle ?? ''))]
            }}
          </p>
          <a
            aioBtn
            variant="outline"
            class="min-h-11 self-start"
            [href]="o.url"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ openLabel() | aioTranslate }}
          </a>
        }
        @default {
          <a
            aioBtn
            variant="outline"
            class="min-h-11 self-start"
            [href]="o.url"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ openLabel() | aioTranslate }}
          </a>
          @if (
            o.campaign === 'TELEGRAM_JOIN' && o.telegramLinked && !manual()
          ) {
            <p class="text-muted-foreground text-sm">
              {{
                'بعد از عضویت در کانال، دکمهٔ زیر را بزن؛ ربات عضویتت را بررسی می‌کند و هفتهٔ هدیه همان لحظه اضافه می‌شود.'
                  | aioTranslate
              }}
            </p>
            <button
              aioAsyncButton
              type="button"
              label="عضو شدم، بررسی کن"
              class="min-h-11 self-start"
              [busy]="busy()"
              [disabled]="busy()"
              (click)="check()"
            ></button>
          } @else {
            @if (
              o.campaign === 'TELEGRAM_JOIN' &&
              !o.telegramLinked &&
              telegram.hasValue() &&
              telegram.value().available
            ) {
              <p class="text-muted-foreground text-sm">
                {{
                  'ربات Poshtetgarm را وصل کن تا عضویتت در کانال خودکار بررسی شود و هفتهٔ هدیه همان لحظه اضافه شود.'
                    | aioTranslate
                }}
              </p>
              <web-telegram-settings
                [chrome]="false"
                (linked)="changed.emit()"
              />
              <p class="text-muted-foreground text-sm">
                {{ 'یا نام کاربری تلگرامت را بفرست:' | aioTranslate }}
              </p>
            } @else {
              <p class="text-muted-foreground text-sm">
                {{
                  'بعد از عضویت، نام کاربری‌ات را بفرست. عضویت را بررسی می‌کنیم و بعد از تأیید، هفتهٔ هدیه خودکار اضافه می‌شود و در برنامه خبرت می‌کنیم.'
                    | aioTranslate
                }}
              </p>
            }
            <form
              class="flex flex-col gap-3"
              (submit)="$event.preventDefault(); request(handle.value)"
            >
              <aio-form-field
                [label]="handleLabel()"
                [controlId]="idPrefix() + o.campaign"
              >
                <input
                  aioInput
                  #handle
                  [id]="idPrefix() + o.campaign"
                  type="text"
                  dir="ltr"
                  autocomplete="off"
                  autocapitalize="off"
                  maxlength="31"
                  placeholder="@username"
                  required
                />
              </aio-form-field>
              <button
                aioAsyncButton
                type="submit"
                label="فرستادن برای بررسی"
                class="min-h-11 self-start"
                [busy]="busy()"
                [disabled]="busy()"
              ></button>
            </form>
          }
        }
      }
    </div>
  `,
})
export class SocialReward {
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private readonly notifications = inject(AioNotifications);
  readonly offer = input.required<BillingRewardOffer>();
  /** Keeps field ids unique when the page and the sheet show the same offer. */
  readonly idPrefix = input('offer-');
  /** The offers after a change (request sent, week granted, bot linked: then empty, reload). */
  readonly changed = output<BillingRewardOffer[] | void>();
  protected readonly busy = signal(false);
  /** Whether the bot is set up, so linking it is offered (only asked for an unlinked Telegram offer). */
  protected readonly telegram = httpResource<TelegramStatus>(() =>
    this.offer().campaign === 'TELEGRAM_JOIN' &&
    this.offer().status === 'available' &&
    !this.offer().telegramLinked
      ? `${this.api}/telegram/status`
      : undefined,
  );
  /** The bot could not read the channel: fall back to the username request. */
  protected readonly manual = signal(false);
  protected readonly verbatim = verbatim;
  protected readonly title = computed(() =>
    this.offer().campaign === 'TELEGRAM_JOIN'
      ? 'عضویت در کانال تلگرام'
      : 'دنبال‌کردن در اینستاگرام',
  );
  protected readonly openLabel = computed(() =>
    this.offer().campaign === 'TELEGRAM_JOIN'
      ? 'باز کردن کانال در تلگرام'
      : 'باز کردن صفحه در اینستاگرام',
  );
  protected readonly handleLabel = computed(() =>
    this.offer().campaign === 'TELEGRAM_JOIN'
      ? 'نام کاربری تلگرام'
      : 'نام کاربری اینستاگرام',
  );

  protected async check() {
    this.busy.set(true);
    try {
      const { result } = await firstValueFrom(
        this.http.post<{ result: TelegramRewardCheck }>(
          `${this.api}/telegram/reward`,
          {},
        ),
      );
      if (result === 'granted' || result === 'earned') {
        this.notifications.success('یک هفته هوش مصنوعی به اشتراکت اضافه شد.');
        this.changed.emit();
      } else if (result === 'not_member') {
        this.notifications.error(
          'هنوز عضو کانال نیستی. اول در کانال عضو شو و دوباره بزن.',
        );
      } else if (result === 'not_linked') {
        this.changed.emit();
      } else {
        this.manual.set(true);
        this.notifications.error(
          'الان نمی‌توانیم عضویت را خودکار بررسی کنیم؛ نام کاربری‌ات را بفرست.',
        );
      }
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async request(handle: string) {
    if (this.busy()) return;
    const input = billingRewardRequestSchema.safeParse({
      campaign: this.offer().campaign,
      handle,
    });
    if (!input.success) {
      this.notifications.error('نام کاربری معتبر وارد کن.');
      return;
    }
    this.busy.set(true);
    try {
      this.changed.emit(
        await firstValueFrom(
          this.http.post<BillingRewardOffer[]>(
            `${this.api}/billing/reward-requests`,
            input.data,
          ),
        ),
      );
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
