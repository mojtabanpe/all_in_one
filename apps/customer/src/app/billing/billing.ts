import { firstValueFrom } from 'rxjs';
import { DOCUMENT } from '@angular/common';
import {
  HttpClient,
  HttpErrorResponse,
  httpResource,
} from '@angular/common/http';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type {
  BillingOrderSummary,
  BillingPlan,
  BillingReturnStatus,
  BillingAccessState,
  BillingRewardCampaign,
  BillingRewardOffer,
  AiKind,
  AiUsageView,
} from '@all-in-one/shared/schemas';
import {
  billingRewardRequestSchema,
  billingStoreSku,
  canBuyPlan,
} from '@all-in-one/shared/schemas';
import {
  AioAlertDirectives,
  AioAsyncButton,
  AioBadge,
  AioButton,
  AioCardDirectives,
  AioDatePipe,
  AioEmptyState,
  AioIcon,
  AioFormField,
  AioInput,
  AioLocale,
  AioNotifications,
  AioProgressDirectives,
  AioSkeletonRows,
  AioTranslate,
  provideIcons,
  verbatim,
} from '@all-in-one/ui';
import { API_BASE_URL, apiErrorMessage } from '@all-in-one/web/shared';
import {
  lucideCircleAlert,
  lucideCircleCheck,
  lucideClock,
  lucideReceipt,
} from '@ng-icons/lucide';
import { StoreBilling, StorePurchaseCanceled } from './store-billing';

const RESULTS: readonly BillingReturnStatus[] = ['paid', 'failed', 'pending'];
const GATEWAY = 'https://gateway.zibal.ir/start/';

/**
 * Plans, subscription state, Zibal checkout and the result of a return from the gateway. The Android store
 * builds buy through the store's in-app billing instead and never show the gateway (both stores require it).
 */
@Component({
  selector: 'customer-billing',
  imports: [
    AioAlertDirectives,
    AioAsyncButton,
    AioBadge,
    AioButton,
    AioCardDirectives,
    AioDatePipe,
    AioEmptyState,
    AioIcon,
    AioFormField,
    AioInput,
    AioProgressDirectives,
    AioSkeletonRows,
    AioTranslate,
  ],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideCircleCheck,
      lucideClock,
      lucideReceipt,
    }),
  ],
  template: `
    <div class="flex flex-col gap-8">
      <header>
        <h1 class="aio-page-title">{{ 'اشتراک' | aioTranslate }}</h1>
      </header>

      @switch (result()) {
        @case ('paid') {
          <div aioAlert class="grid-cols-[auto_1fr] gap-x-2.5" role="status">
            <aio-icon
              name="lucideCircleCheck"
              class="row-span-2 mt-0.5 text-primary"
            />
            <h2 aioAlertTitle>{{ 'پرداخت تأیید شد' | aioTranslate }}</h2>
            <p aioAlertDescription>
              {{ 'اشتراکت فعال شد.' | aioTranslate }}
            </p>
          </div>
        }
        @case ('failed') {
          <div
            aioAlert
            variant="destructive"
            class="grid-cols-[auto_1fr] gap-x-2.5"
            role="alert"
          >
            <aio-icon name="lucideCircleAlert" class="row-span-2 mt-0.5" />
            <h2 aioAlertTitle>{{ 'پرداخت انجام نشد' | aioTranslate }}</h2>
            <p aioAlertDescription>
              {{
                'اشتراکی فعال نشد. اگر مبلغی از حسابت کم شده باشد، بانک معمولاً آن را برمی‌گرداند.'
                  | aioTranslate
              }}
            </p>
          </div>
        }
        @case ('pending') {
          <div aioAlert class="grid-cols-[auto_1fr] gap-x-2.5" role="status">
            <aio-icon name="lucideClock" class="row-span-2 mt-0.5" />
            <h2 aioAlertTitle>{{ 'پرداخت هنوز تأیید نشده' | aioTranslate }}</h2>
            <p aioAlertDescription>
              {{ 'چند دقیقه بعد، «بررسی دوباره» را بزن.' | aioTranslate }}
            </p>
          </div>
        }
      }

      <section aioCard aria-labelledby="subscription-heading">
        <div aioCardHeader>
          <h2 aioCardTitle id="subscription-heading">
            {{ 'وضعیت اشتراک' | aioTranslate }}
          </h2>
        </div>
        <div aioCardContent>
          @if (access.hasValue()) {
            @let state = access.value();
            @if (state.tier === 'paid') {
              <p class="text-lg font-semibold">
                {{
                  'اشتراکت تا {0} فعال است.'
                    | aioTranslate
                      : [state.paidUntil | aioDate: { dateStyle: 'long' }]
                }}
              </p>
            } @else if (state.tier === 'staff') {
              <p class="text-lg font-semibold">
                {{ 'حساب مدیر است؛ هوش مصنوعی همیشه فعال است.' | aioTranslate }}
              </p>
            } @else if (state.tier === 'trial' || state.tier === 'earned') {
              <p class="text-lg font-semibold">
                {{
                  (state.tier === 'trial'
                    ? 'دورهٔ آزمایشی تا {0} فعال است.'
                    : 'هدیهٔ هوش مصنوعی تا {0} فعال است.'
                  )
                    | aioTranslate
                      : [
                          (state.tier === 'trial'
                            ? state.trialUntil
                            : state.earnedUntil
                          ) | aioDate: { dateStyle: 'long' },
                        ]
                }}
              </p>
            } @else if (state.paidUntil) {
              <p>
                {{
                  'اشتراکت در {0} تمام شد.'
                    | aioTranslate
                      : [state.paidUntil | aioDate: { dateStyle: 'long' }]
                }}
              </p>
            } @else {
              <p>{{ 'اشتراک فعالی نداری.' | aioTranslate }}</p>
            }
          } @else if (access.error()) {
            <p role="alert">
              {{ 'وضعیت اشتراک دریافت نشد.' | aioTranslate }}
            </p>
          } @else {
            <div aioSkeletonRows [count]="1" itemClass="h-7 rounded-lg"></div>
          }
        </div>
      </section>

      @if (usage.hasValue() && hasLimits()) {
        <section aioCard aria-labelledby="usage-heading">
          <div aioCardHeader>
            <h2 aioCardTitle id="usage-heading">
              {{ 'مصرف امروز هوش مصنوعی' | aioTranslate }}
            </h2>
            <p aioCardDescription>
              {{
                'سهمیه هر روز ساعت ۰۰:۰۰ به وقت تهران تازه می‌شود.'
                  | aioTranslate
              }}
            </p>
          </div>
          <div aioCardContent class="flex flex-col gap-4">
            @for (row of usageRows(); track row.kind) {
              <div class="flex flex-col gap-1.5">
                <div class="flex items-baseline justify-between gap-3 text-sm">
                  <span class="font-medium">{{
                    row.label | aioTranslate
                  }}</span>
                  <span class="text-muted-foreground">{{
                    '{0}٪ مصرف شده' | aioTranslate: [locale.number(row.percent)]
                  }}</span>
                </div>
                <div
                  aioProgress
                  class="bg-muted h-2 rounded-full"
                  [value]="row.percent"
                  [attr.aria-label]="row.label | aioTranslate"
                >
                  <div aioProgressIndicator class="rounded-full"></div>
                </div>
              </div>
            }
          </div>
        </section>
      }

      @if (offers.hasValue() && offers.value().length) {
        <section aioCard aria-labelledby="offers-heading">
          <div aioCardHeader>
            <h2 aioCardTitle id="offers-heading">
              {{ 'یک هفته هوش مصنوعی هدیه' | aioTranslate }}
            </h2>
          </div>
          <div aioCardContent class="grid gap-4 sm:grid-cols-2">
            @for (offer of offers.value(); track offer.campaign) {
              <article
                class="border-border flex min-w-0 flex-col gap-3 rounded-xl border p-3"
              >
                <h3 class="font-semibold">
                  {{ rewardLabels[offer.campaign] | aioTranslate }}
                </h3>
                @switch (offer.status) {
                  @case ('earned') {
                    <p>{{ 'هدیه ثبت شد.' | aioTranslate }}</p>
                  }
                  @case ('pending') {
                    <p role="status">
                      {{ 'درخواست در انتظار بررسی است.' | aioTranslate }}
                    </p>
                  }
                  @case ('available') {
                    <a
                      aioBtn
                      variant="outline"
                      class="min-h-11 self-start"
                      [href]="offer.url"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {{ 'باز کردن صفحهٔ رسمی' | aioTranslate }}
                    </a>
                    <form
                      class="flex flex-col gap-3"
                      (submit)="
                        $event.preventDefault();
                        requestReward(offer.campaign, handle.value)
                      "
                    >
                      <aio-form-field
                        label="نام کاربری شبکهٔ اجتماعی"
                        [controlId]="'offer-' + offer.campaign"
                      >
                        <input
                          aioInput
                          #handle
                          [id]="'offer-' + offer.campaign"
                          type="text"
                          dir="ltr"
                          autocomplete="off"
                          maxlength="31"
                          required
                        />
                      </aio-form-field>
                      <p class="text-muted-foreground text-xs">
                        {{
                          'بعد از عضویت، نام کاربری را برای بررسی بفرست.'
                            | aioTranslate
                        }}
                      </p>
                      <button
                        aioAsyncButton
                        type="submit"
                        label="درخواست هدیه"
                        class="min-h-11 self-start"
                        [busy]="requesting() === offer.campaign"
                        [disabled]="requesting() !== null"
                      ></button>
                    </form>
                  }
                }
              </article>
            }
          </div>
        </section>
      }

      <section aria-labelledby="plans-heading" class="flex flex-col gap-4">
        <h2 id="plans-heading" class="text-xl font-semibold">
          {{ 'پلن‌ها' | aioTranslate }}
        </h2>
        @if (plans.hasValue()) {
          @if (plans.value().length) {
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              @for (plan of plans.value(); track plan.code) {
                <article aioCard>
                  <div aioCardHeader>
                    <h3 aioCardTitle>{{ planTitle(plan) }}</h3>
                    <p aioCardDescription>
                      {{
                        'اشتراک {0} ماهه'
                          | aioTranslate: [locale.number(plan.months)]
                      }}
                    </p>
                  </div>
                  <div aioCardContent>
                    <p class="text-2xl font-bold tabular-nums">
                      {{ '{0} تومان' | aioTranslate: [toman(plan.priceRial)] }}
                    </p>
                  </div>
                  @if (canBuy()) {
                    <div aioCardFooter class="flex-col items-stretch gap-2">
                      <button
                        aioAsyncButton
                        class="min-h-11 w-full"
                        [label]="
                          paid() ? 'پرداخت و تمدید' : 'پرداخت و فعال‌سازی'
                        "
                        [busyLabel]="
                          store ? 'در حال خرید' : 'در حال رفتن به درگاه'
                        "
                        [busy]="paying() === plan.code"
                        [disabled]="!!paying() || !sellable(plan.code)"
                        (click)="pay(plan.code)"
                      ></button>
                      @if (!sellable(plan.code)) {
                        <p class="text-muted-foreground text-xs">
                          {{
                            'این پلن هنوز در فروشگاه عرضه نشده است.'
                              | aioTranslate
                          }}
                        </p>
                      }
                    </div>
                  }
                </article>
              }
            </div>
            <p class="text-sm text-muted-foreground">
              {{
                (!canBuy()
                  ? 'اشتراکت فعال است. تمدید از سه روز مانده به پایان آن ممکن می‌شود و از همان روز پایان ادامه پیدا می‌کند.'
                  : store === 'bazaar'
                    ? 'خرید با پرداخت درون‌برنامه‌ای کافه‌بازار انجام می‌شود. تمدید از پایان اشتراک فعلی شروع می‌شود.'
                    : store === 'myket'
                      ? 'خرید با پرداخت درون‌برنامه‌ای مایکت انجام می‌شود. تمدید از پایان اشتراک فعلی شروع می‌شود.'
                      : 'پرداخت در درگاه زیبال انجام می‌شود. تمدید از پایان اشتراک فعلی شروع می‌شود.'
                ) | aioTranslate
              }}
            </p>
          } @else {
            <div
              aioEmptyState
              icon="lucideReceipt"
              [level]="3"
              [title]="'هنوز پلنی برای خرید نیست' | aioTranslate"
              description="امکانات رایگان بدون اشتراک در دسترس‌اند."
            ></div>
          }
        } @else if (plans.error()) {
          <p role="alert">{{ 'پلن‌ها دریافت نشدند.' | aioTranslate }}</p>
          <button
            aioBtn
            variant="outline"
            class="w-fit"
            (click)="plans.reload()"
          >
            {{ 'تلاش دوباره' | aioTranslate }}
          </button>
        } @else {
          <div
            class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aioSkeletonRows
            [count]="2"
            itemClass="h-48 rounded-2xl"
          ></div>
        }
      </section>

      @if (orders.value()?.length) {
        <section aria-labelledby="orders-heading" class="flex flex-col gap-4">
          <h2 id="orders-heading" class="text-xl font-semibold">
            {{ 'پرداخت‌ها' | aioTranslate }}
          </h2>
          <ul aioCard class="divide-y divide-border p-0">
            @for (order of orders.value(); track order.id) {
              <li class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div class="min-w-0 flex-1">
                  <p class="font-medium">
                    {{
                      'اشتراک {0} ماهه'
                        | aioTranslate: [locale.number(order.months)]
                    }}
                  </p>
                  <p class="text-sm text-muted-foreground">
                    {{
                      '{0} تومان، {1}'
                        | aioTranslate
                          : [
                              toman(order.amountRial),
                              order.createdAt
                                | aioDate
                                  : { dateStyle: 'medium', timeStyle: 'short' },
                            ]
                    }}
                  </p>
                  @if (order.refNumber) {
                    <p class="text-sm text-muted-foreground">
                      {{
                        'شمارهٔ پیگیری {0}'
                          | aioTranslate: [verbatim(order.refNumber)]
                      }}
                    </p>
                  }
                </div>
                <div class="flex items-center gap-3">
                  <span
                    aioBadge
                    [variant]="
                      order.status === 'PAID'
                        ? 'default'
                        : order.status === 'FAILED'
                          ? 'destructive'
                          : 'secondary'
                    "
                    >{{ statusLabel[order.status] | aioTranslate }}</span
                  >
                  @if (order.refundedRial && order.status === 'PAID') {
                    <span class="text-sm text-muted-foreground">{{
                      'بازپرداخت {0} تومان'
                        | aioTranslate: [locale.number(order.refundedRial / 10)]
                    }}</span>
                  }
                  @if (order.status === 'PENDING') {
                    <button
                      aioAsyncButton
                      variant="outline"
                      class="min-h-11"
                      label="بررسی دوباره"
                      busyLabel="در حال بررسی"
                      [busy]="checking() === order.id"
                      [disabled]="!!checking()"
                      (click)="recheck(order.id)"
                    ></button>
                  }
                </div>
              </li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class Billing {
  protected readonly locale = inject(AioLocale);
  private readonly api = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(AioNotifications);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly storeBilling = inject(StoreBilling);
  /** Set in the Android store builds: purchases go through the store, never the web gateway. */
  protected readonly store = this.storeBilling.store;
  /** SKUs the store offers; null until known or when the store cannot be asked (then every plan stays buyable). */
  private readonly storeSkus = signal<Set<string> | null>(null);

  constructor() {
    if (!this.store) return;
    // A purchase that never reached the server (closed app, outage) is activated on the next visit.
    void this.storeBilling
      .restore()
      .then((count) => {
        if (count) this.refresh();
      })
      .catch(() => undefined);
  }

  /** `?payment=` from the gateway callback redirect. */
  readonly payment = input<string>();
  private readonly checked = signal<BillingReturnStatus | null>(null);
  protected readonly result = computed(() => {
    const value = this.checked() ?? this.payment();
    return RESULTS.find((status) => status === value) ?? null;
  });

  protected readonly plans = httpResource<BillingPlan[]>(
    () => `${this.api}/billing/plans`,
  );
  protected readonly access = httpResource<BillingAccessState>(
    () => `${this.api}/billing/access`,
  );
  protected readonly usage = httpResource<AiUsageView>(
    () => `${this.api}/ai/usage`,
  );
  private readonly usageLabels: Record<AiKind, string> = {
    chat: 'گفتگو و دستیار',
    tts: 'متن به گفتار',
    stt: 'گفتار به متن',
  };
  /** Shown only to accounts with limited AI (trial, earned, paid); admins and free accounts have no bars. */
  protected readonly hasLimits = computed(
    () =>
      this.usage.hasValue() &&
      Object.values(this.usage.value().kinds).some((k) => !!k.limit),
  );
  protected readonly usageRows = computed(() => {
    if (!this.usage.hasValue()) return [];
    const kinds = this.usage.value().kinds;
    return (Object.keys(this.usageLabels) as AiKind[]).flatMap((kind) => {
      const { used, limit } = kinds[kind];
      return limit
        ? [
            {
              kind,
              label: this.usageLabels[kind],
              percent: Math.min(100, Math.round((used / limit) * 100)),
            },
          ]
        : [];
    });
  });
  protected readonly offers = httpResource<BillingRewardOffer[]>(
    () => `${this.api}/billing/reward-offers`,
  );
  protected readonly requesting = signal<BillingRewardCampaign | null>(null);
  protected readonly rewardLabels = {
    TELEGRAM_JOIN: 'عضویت در تلگرام',
    INSTAGRAM_FOLLOW: 'دنبال‌کردن در اینستاگرام',
  } as const;

  protected async requestReward(
    campaign: BillingRewardCampaign,
    handle: string,
  ) {
    if (this.requesting()) return;
    const input = billingRewardRequestSchema.safeParse({ campaign, handle });
    if (!input.success) {
      this.notifications.error('نام کاربری معتبر وارد کن.');
      return;
    }
    this.requesting.set(campaign);
    try {
      this.offers.set(
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
      this.requesting.set(null);
    }
  }

  protected readonly paid = computed(
    () => this.access.hasValue() && this.access.value().tier === 'paid',
  );
  /** Paid access with more than three days left hides the buy buttons (directive 118); the server refuses too. */
  protected readonly canBuy = computed(
    () => !this.paid() || canBuyPlan(this.access.value()?.paidUntil ?? null),
  );
  protected readonly orders = httpResource<BillingOrderSummary[]>(
    () => `${this.api}/billing/orders`,
  );
  protected readonly paying = signal<string | null>(null);
  protected readonly checking = signal<string | null>(null);
  protected readonly verbatim = verbatim;
  protected readonly statusLabel = {
    PAID: 'پرداخت‌شده',
    PENDING: 'در انتظار تأیید',
    FAILED: 'ناموفق',
    REFUNDED: 'بازپرداخت‌شده',
  } as const;

  protected sellable(code: string): boolean {
    const skus = this.storeSkus();
    return !skus || skus.has(billingStoreSku(code));
  }

  private readonly loadStoreSkus = effect(() => {
    if (!this.store || !this.plans.hasValue()) return;
    const skus = this.plans.value().map((plan) => billingStoreSku(plan.code));
    void this.storeBilling.products(skus).then((sold) => {
      // An empty answer is a store that could not list products, not one that sells nothing.
      this.storeSkus.set(sold?.size ? sold : null);
    });
  });

  private refresh(): void {
    this.orders.reload();
    this.access.reload();
    this.usage.reload();
  }

  protected planTitle(plan: BillingPlan): string {
    return this.locale.english() ? plan.titleEn : plan.titleFa;
  }

  /** Amounts are Rial; people read Toman. */
  protected toman(rial: number): string {
    return this.locale.number(rial / 10);
  }

  protected async pay(plan: string): Promise<void> {
    if (this.store) return this.buyInStore(plan);
    this.paying.set(plan);
    try {
      const { paymentUrl } = await firstValueFrom(
        this.http.post<{ paymentUrl: string }>(`${this.api}/billing/checkout`, {
          plan,
        }),
      );
      if (!paymentUrl.startsWith(GATEWAY)) throw new Error('Unexpected url');
      // Stays busy: the page is leaving for the gateway.
      this.window?.location.assign(paymentUrl);
    } catch (error) {
      this.paying.set(null);
      this.orders.reload();
      this.notifications.error(
        'رفتن به درگاه پرداخت ممکن نشد',
        apiErrorMessage(error),
      );
    }
  }

  private async buyInStore(plan: string): Promise<void> {
    this.paying.set(plan);
    try {
      this.checked.set(await this.storeBilling.buy(plan));
      this.refresh();
    } catch (error) {
      if (!(error instanceof StorePurchaseCanceled))
        this.notifications.error(
          'خرید انجام نشد',
          error instanceof Error && !(error instanceof HttpErrorResponse)
            ? error.message
            : apiErrorMessage(error),
        );
      this.orders.reload();
    } finally {
      this.paying.set(null);
    }
  }

  protected async recheck(id: string): Promise<void> {
    this.checking.set(id);
    try {
      const { status } = await firstValueFrom(
        this.http.post<{ status: BillingReturnStatus }>(
          `${this.api}/billing/orders/${id}/verify`,
          {},
        ),
      );
      this.checked.set(status);
      this.orders.reload();
      this.access.reload();
    } catch (error) {
      this.notifications.error('بررسی پرداخت ممکن نشد', apiErrorMessage(error));
    } finally {
      this.checking.set(null);
    }
  }
}
