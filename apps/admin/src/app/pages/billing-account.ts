import { firstValueFrom } from 'rxjs';
import {
  HttpClient,
  HttpErrorResponse,
  httpResource,
} from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import {
  email,
  form,
  FormField,
  FormRoot,
  max,
  maxLength,
  min,
  minLength,
  pattern,
  required,
  submit,
} from '@angular/forms/signals';
import {
  BILLING_REWARD_CAMPAIGNS,
  type BillingAccount,
  type BillingOrderSummary,
  type BillingPendingReward,
  type BillingRewardCampaign,
} from '@all-in-one/shared/schemas';
import {
  AioAsyncButton,
  AioBadge,
  AioButton,
  AioCardDirectives,
  AioConfirm,
  AioDatePipe,
  AioFormErrors,
  AioFormField,
  AioInput,
  AioLocale,
  AioNotifications,
  AioNumberField,
  AioSelectField,
  AioTableDirectives,
  AioToggleGroupDirectives,
  AioTranslate,
} from '@all-in-one/ui';
import { API_BASE_URL, apiErrorMessage } from '@all-in-one/web/shared';

type Action = 'extend' | 'end';

/** Look up one account's paid access and change it by hand, with a recorded reason. */
@Component({
  selector: 'admin-billing-account',
  imports: [
    AioAsyncButton,
    AioBadge,
    AioButton,
    AioCardDirectives,
    AioDatePipe,
    AioFormErrors,
    AioFormField,
    AioInput,
    AioNumberField,
    AioSelectField,
    AioTableDirectives,
    AioToggleGroupDirectives,
    AioTranslate,
    FormField,
    FormRoot,
  ],
  template: `
    <section aioCard aria-labelledby="account-title">
      <div aioCardHeader>
        <h2 aioCardTitle id="account-title">
          {{ 'اشتراک یک کاربر' | aioTranslate }}
        </h2>
        <p aioCardDescription>
          {{
            'تمدید یا پایان دستی اشتراک، با دلیلی که در سابقه می‌ماند.'
              | aioTranslate
          }}
        </p>
      </div>
      <div aioCardContent class="flex flex-col gap-6">
        <section
          class="flex min-w-0 flex-col gap-2"
          aria-labelledby="reward-requests-title"
        >
          <h3 id="reward-requests-title" class="font-semibold">
            {{ 'درخواست‌های هدیه' | aioTranslate }}
          </h3>
          @if (pendingRewards.hasValue()) {
            @for (request of pendingRewards.value(); track request.id) {
              <div
                class="border-border flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border p-2 text-sm"
              >
                <div class="min-w-0">
                  <p>{{ rewardLabels[request.campaign] | aioTranslate }}</p>
                  <p dir="ltr" class="break-all">
                    <bdi>{{ request.email }}</bdi> ·
                    <bdi>{{ request.handle }}</bdi>
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    aioBtn
                    type="button"
                    variant="outline"
                    (click)="reviewRewardRequest(request)"
                    [disabled]="finding()"
                  >
                    {{ 'بررسی حساب' | aioTranslate }}
                  </button>
                  <button
                    aioBtn
                    type="button"
                    variant="ghost"
                    (click)="dismissRewardRequest(request)"
                    [disabled]="rewardSaving()"
                  >
                    {{ 'رد درخواست' | aioTranslate }}
                  </button>
                </div>
              </div>
            } @empty {
              <p class="text-muted-foreground text-sm">
                {{ 'درخواست بازی وجود ندارد.' | aioTranslate }}
              </p>
            }
          } @else if (pendingRewards.error()) {
            <button
              aioBtn
              type="button"
              variant="outline"
              class="self-start"
              (click)="pendingRewards.reload()"
            >
              {{ 'دریافت دوباره' | aioTranslate }}
            </button>
          } @else {
            <p role="status" class="text-muted-foreground text-sm">
              {{ 'در حال دریافت درخواست‌ها…' | aioTranslate }}
            </p>
          }
        </section>
        <form
          class="flex flex-wrap items-end gap-3"
          [formRoot]="findForm"
          (submit)="$event.preventDefault(); find()"
        >
          <aio-form-field
            class="min-w-0 flex-1 basis-64"
            [label]="'ایمیل کاربر' | aioTranslate"
            controlId="account-email"
          >
            <input
              aioInput
              id="account-email"
              type="email"
              dir="ltr"
              lang="en"
              autocomplete="off"
              [formField]="findForm.email"
            />
            <aio-form-errors [errors]="findForm.email().errors()" />
          </aio-form-field>
          <button
            aioAsyncButton
            type="submit"
            variant="outline"
            class="min-h-11"
            label="پیدا کردن"
            busyLabel="در حال جستجو"
            [busy]="finding()"
          ></button>
        </form>

        @if (account(); as acc) {
          <div class="flex flex-col gap-1">
            <p class="font-medium" dir="ltr">{{ acc.email }}</p>
            <p>
              @if (acc.subscription.active) {
                {{
                  'فعال تا {0}'
                    | aioTranslate
                      : [
                          acc.subscription.paidUntil
                            | aioDate: { dateStyle: 'long' },
                        ]
                }}
              } @else if (acc.subscription.paidUntil) {
                {{
                  'پایان‌یافته در {0}'
                    | aioTranslate
                      : [
                          acc.subscription.paidUntil
                            | aioDate: { dateStyle: 'long' },
                        ]
                }}
              } @else {
                {{ 'بدون اشتراک' | aioTranslate }}
              }
            </p>
          </div>

          <form
            id="adjust-form"
            class="grid gap-4 sm:grid-cols-2"
            [formRoot]="adjustForm"
            (submit)="$event.preventDefault(); adjust()"
          >
            <div
              aioToggleGroup
              type="single"
              variant="outline"
              class="sm:col-span-2"
              [value]="adjustModel().action"
              (valueChange)="setAction($event)"
              [attr.aria-label]="'نوع تغییر' | aioTranslate"
            >
              <button
                aioToggleGroupItem
                type="button"
                value="extend"
                class="min-h-11 px-4"
              >
                {{ 'تمدید' | aioTranslate }}
              </button>
              <button
                aioToggleGroupItem
                type="button"
                value="end"
                class="min-h-11 px-4"
              >
                {{ 'پایان همین حالا' | aioTranslate }}
              </button>
            </div>
            @if (adjustModel().action === 'extend') {
              <aio-number-field
                label="چند روز"
                controlId="adjust-days"
                [field]="adjustForm.days"
                [showErrors]="true"
              />
            }
            <aio-form-field
              [class.sm:col-span-2]="adjustModel().action === 'end'"
              [label]="'دلیل (در سابقه می‌ماند)' | aioTranslate"
              controlId="adjust-reason"
            >
              <input
                aioInput
                id="adjust-reason"
                [formField]="adjustForm.reason"
              />
              <aio-form-errors [errors]="adjustForm.reason().errors()" />
            </aio-form-field>
            <div class="sm:col-span-2">
              <button
                aioAsyncButton
                type="submit"
                class="min-h-11"
                [variant]="
                  adjustModel().action === 'end' ? 'destructive' : 'default'
                "
                [label]="
                  adjustModel().action === 'end'
                    ? 'پایان اشتراک'
                    : 'تمدید اشتراک'
                "
                busyLabel="در حال ذخیره"
                [busy]="saving()"
                [disabled]="
                  adjustModel().action === 'end' && !acc.subscription.active
                "
              ></button>
            </div>
          </form>

          <section
            class="border-border flex min-w-0 flex-col gap-3 border-t pt-4"
            aria-labelledby="account-orders-title"
          >
            <h3 id="account-orders-title" class="font-semibold">
              {{ 'سفارش‌ها و بازپرداخت' | aioTranslate }}
            </h3>
            <p class="text-muted-foreground text-sm">
              {{
                'اول پول را از پنل زیبال یا با انتقال بانکی برگردان، بعد اینجا ثبت کن. هر سفارش یک بار بازپرداخت می‌شود.'
                  | aioTranslate
              }}
            </p>
            @for (order of acc.orders; track order.id) {
              <div
                class="border-border flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
              >
                <div class="min-w-0">
                  <p class="font-medium tabular-nums">
                    {{
                      '{0} تومان'
                        | aioTranslate: [locale.number(order.amountRial / 10)]
                    }}
                  </p>
                  <p class="text-muted-foreground">
                    {{
                      'اشتراک {0} ماهه'
                        | aioTranslate: [locale.number(order.months)]
                    }}
                  </p>
                  <p class="text-muted-foreground">
                    {{
                      order.paidAt ?? order.createdAt
                        | aioDate: { dateStyle: 'medium' }
                    }}
                  </p>
                  @if (order.refundedRial) {
                    <p class="text-muted-foreground">
                      {{
                        'بازپرداخت {0} تومان'
                          | aioTranslate
                            : [locale.number(order.refundedRial / 10)]
                      }}
                    </p>
                  }
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <span aioBadge [variant]="orderBadges[order.status]">{{
                    orderLabels[order.status] | aioTranslate
                  }}</span>
                  @if (order.status === 'PAID' && order.refundedRial === null) {
                    <button
                      aioBtn
                      type="button"
                      variant="outline"
                      class="min-h-11"
                      [attr.aria-expanded]="refundOrder()?.id === order.id"
                      aria-controls="refund-form"
                      (click)="startRefund(order)"
                    >
                      {{ 'بازپرداخت' | aioTranslate }}
                    </button>
                  }
                </div>
              </div>
            } @empty {
              <p class="text-muted-foreground text-sm">
                {{ 'سفارشی ثبت نشده است.' | aioTranslate }}
              </p>
            }
            @if (refundOrder(); as order) {
              <form
                id="refund-form"
                class="border-border grid gap-4 rounded-xl border p-3 sm:grid-cols-2"
                [formRoot]="refundForm"
                (submit)="$event.preventDefault(); refund()"
              >
                <p class="font-medium sm:col-span-2">
                  {{
                    'بازپرداخت سفارش {0} تومانی'
                      | aioTranslate: [locale.number(order.amountRial / 10)]
                  }}
                </p>
                <aio-number-field
                  label="مبلغ بازپرداخت (تومان)"
                  controlId="refund-amount"
                  [field]="refundForm.amountToman"
                  [showErrors]="true"
                />
                <aio-form-field
                  label="شمارهٔ پیگیری بازپرداخت (اختیاری)"
                  controlId="refund-reference"
                >
                  <input
                    aioInput
                    id="refund-reference"
                    dir="ltr"
                    lang="en"
                    autocomplete="off"
                    [formField]="refundForm.reference"
                  />
                  <aio-form-errors [errors]="refundForm.reference().errors()" />
                </aio-form-field>
                <div class="flex flex-col gap-2 sm:col-span-2">
                  <p id="refund-access-label" class="text-sm font-medium">
                    {{ 'مدت این سفارش از دسترسی پولی' | aioTranslate }}
                  </p>
                  <div
                    aioToggleGroup
                    type="single"
                    variant="outline"
                    class="self-start"
                    [value]="refundModel().access"
                    (valueChange)="setRefundAccess($event)"
                    aria-labelledby="refund-access-label"
                  >
                    <button
                      aioToggleGroupItem
                      type="button"
                      value="remove"
                      class="min-h-11 px-4"
                    >
                      {{ 'کم شود' | aioTranslate }}
                    </button>
                    <button
                      aioToggleGroupItem
                      type="button"
                      value="keep"
                      class="min-h-11 px-4"
                    >
                      {{ 'بماند' | aioTranslate }}
                    </button>
                  </div>
                </div>
                <aio-form-field
                  class="sm:col-span-2"
                  label="دلیل (در سابقه می‌ماند)"
                  controlId="refund-reason"
                >
                  <input
                    aioInput
                    id="refund-reason"
                    [formField]="refundForm.reason"
                  />
                  <aio-form-errors [errors]="refundForm.reason().errors()" />
                </aio-form-field>
                <div class="flex flex-wrap gap-2 sm:col-span-2">
                  <button
                    aioAsyncButton
                    type="submit"
                    variant="destructive"
                    class="min-h-11"
                    label="ثبت بازپرداخت"
                    busyLabel="در حال ذخیره"
                    [busy]="refunding()"
                  ></button>
                  <button
                    aioBtn
                    type="button"
                    variant="ghost"
                    class="min-h-11"
                    [disabled]="refunding()"
                    (click)="refundOrder.set(null)"
                  >
                    {{ 'انصراف' | aioTranslate }}
                  </button>
                </div>
              </form>
            }
            @for (row of acc.refunds; track row.orderId) {
              <div class="border-border rounded-xl border p-3 text-sm">
                <p class="font-medium tabular-nums">
                  {{
                    'بازپرداخت {0} تومان'
                      | aioTranslate: [locale.number(row.amountRial / 10)]
                  }}
                </p>
                <p>
                  {{
                    row.createdAt
                      | aioDate: { dateStyle: 'medium', timeStyle: 'short' }
                  }}
                </p>
                <p class="break-words">{{ row.reason }}</p>
                @if (row.reference) {
                  <p dir="ltr" class="break-all text-end">
                    {{ row.reference }}
                  </p>
                }
                <p dir="ltr" class="text-muted-foreground break-all text-xs">
                  {{ row.adminEmail }}
                </p>
              </div>
            }
          </section>

          <section
            class="border-border flex min-w-0 flex-col gap-3 border-t pt-4"
            aria-labelledby="reward-title"
          >
            <h3 id="reward-title" class="font-semibold">
              {{ 'هدیه‌های دسترسی' | aioTranslate }}
            </h3>
            <p class="text-muted-foreground text-sm">
              {{
                'بعد از تأیید عضویت، یک هفته دسترسی هوش مصنوعی ثبت کن. هر هدیه فقط یک بار قابل ثبت است.'
                  | aioTranslate
              }}
            </p>
            <form
              class="grid gap-3 sm:grid-cols-2"
              [formRoot]="rewardForm"
              (submit)="$event.preventDefault(); grantReward()"
            >
              <aio-select-field
                label="نوع هدیه"
                controlId="reward-campaign"
                [value]="rewardModel().campaign"
                [options]="rewardCampaigns"
                [optionLabels]="rewardLabels"
                (valueChange)="setRewardCampaign($event)"
              />
              <aio-form-field label="دلیل تأیید" controlId="reward-reason">
                <input
                  aioInput
                  id="reward-reason"
                  [formField]="rewardForm.reason"
                />
                <aio-form-errors [errors]="rewardForm.reason().errors()" />
              </aio-form-field>
              <div class="sm:col-span-2">
                <button
                  aioAsyncButton
                  type="submit"
                  label="ثبت یک هفته هدیه"
                  [busy]="rewardSaving()"
                  [disabled]="rewardAlreadyGranted(acc) || finding()"
                ></button>
              </div>
            </form>
            @for (reward of acc.rewards; track reward.campaign) {
              <div class="border-border rounded-xl border p-3 text-sm">
                <p class="font-medium">
                  {{ rewardLabels[reward.campaign] | aioTranslate }}
                </p>
                <p>
                  {{ reward.startsAt | aioDate: { dateStyle: 'medium' } }} –
                  {{ reward.expiresAt | aioDate: { dateStyle: 'medium' } }}
                </p>
                <p class="break-words">{{ reward.reason }}</p>
                <p dir="ltr" class="text-muted-foreground break-all text-xs">
                  {{ reward.adminEmail }}
                </p>
              </div>
            }
          </section>

          @if (acc.adjustments.length) {
            <div class="flex flex-col gap-2">
              <h3 class="font-semibold">
                {{ 'سابقهٔ تغییرهای دستی' | aioTranslate }}
              </h3>
              <div aioTableContainer>
                <table aioTable>
                  <thead aioTHead>
                    <tr aioTr>
                      <th aioTh>{{ 'زمان' | aioTranslate }}</th>
                      <th aioTh>{{ 'تغییر' | aioTranslate }}</th>
                      <th aioTh>{{ 'دلیل' | aioTranslate }}</th>
                      <th aioTh>{{ 'مدیر سیستم' | aioTranslate }}</th>
                    </tr>
                  </thead>
                  <tbody aioTBody>
                    @for (row of acc.adjustments; track row.id) {
                      <tr aioTr>
                        <td aioTd>
                          {{
                            row.createdAt
                              | aioDate
                                : { dateStyle: 'medium', timeStyle: 'short' }
                          }}
                        </td>
                        <td aioTd>
                          <span
                            aioBadge
                            [variant]="
                              row.action === 'EXTEND'
                                ? 'secondary'
                                : 'destructive'
                            "
                            >{{
                              (row.action === 'END'
                                ? 'پایان دستی'
                                : row.action === 'REFUND'
                                  ? 'کسر بابت بازپرداخت'
                                  : '{0} روز تمدید'
                              ) | aioTranslate: [locale.number(row.days ?? 0)]
                            }}</span
                          >
                          <span class="block text-xs text-muted-foreground">{{
                            'تا {0}'
                              | aioTranslate
                                : [
                                    row.newUntil
                                      | aioDate: { dateStyle: 'medium' },
                                  ]
                          }}</span>
                        </td>
                        <td aioTd>{{ row.reason }}</td>
                        <td aioTd dir="ltr" class="text-end text-xs">
                          {{ row.adminEmail }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        }
      </div>
    </section>
  `,
})
export class BillingAccountPanel {
  protected readonly locale = inject(AioLocale);
  private readonly api = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(AioNotifications);
  private readonly confirm = inject(AioConfirm);

  protected readonly account = signal<BillingAccount | null>(null);
  protected readonly finding = signal(false);
  protected readonly rewardSaving = signal(false);
  protected readonly pendingRewards = httpResource<BillingPendingReward[]>(
    () => `${this.api}/billing/admin/reward-requests`,
  );

  protected reviewRewardRequest(request: BillingPendingReward) {
    this.findModel.set({ email: request.email });
    this.rewardModel.set({ campaign: request.campaign, reason: '' });
    this.find();
  }

  protected async dismissRewardRequest(request: BillingPendingReward) {
    const ok = await this.confirm.ask({
      title: 'درخواست رد شود؟',
      description: 'کاربر می‌تواند دوباره درخواست بدهد.',
      confirmText: 'رد درخواست',
    });
    if (!ok) return;
    this.rewardSaving.set(true);
    try {
      await firstValueFrom(
        this.http.delete(
          `${this.api}/billing/admin/reward-requests/${request.id}`,
        ),
      );
      this.pendingRewards.reload();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.rewardSaving.set(false);
    }
  }

  protected readonly rewardCampaigns = BILLING_REWARD_CAMPAIGNS;
  protected readonly rewardLabels = {
    TELEGRAM_JOIN: 'عضویت در تلگرام',
    INSTAGRAM_FOLLOW: 'دنبال‌کردن در اینستاگرام',
  } as const;
  protected readonly rewardModel = signal<{
    campaign: BillingRewardCampaign;
    reason: string;
  }>({
    campaign: 'TELEGRAM_JOIN',
    reason: '',
  });
  protected readonly rewardForm = form(this.rewardModel, (path) => {
    required(path.reason, { message: 'دلیل را بنویس' });
    minLength(path.reason, 3, { message: 'دلیل را بنویس' });
    maxLength(path.reason, 200);
  });

  protected setRewardCampaign(value: string): void {
    if (value === 'TELEGRAM_JOIN' || value === 'INSTAGRAM_FOLLOW')
      this.rewardModel.update((model) => ({ ...model, campaign: value }));
  }

  protected rewardAlreadyGranted(account: BillingAccount): boolean {
    return account.rewards.some(
      (reward) => reward.campaign === this.rewardModel().campaign,
    );
  }

  protected grantReward(): void {
    const account = this.account();
    if (!account || this.rewardSaving() || this.rewardAlreadyGranted(account))
      return;
    submit(this.rewardForm, async () => {
      const { campaign, reason } = this.rewardModel();
      const ok = await this.confirm.ask({
        title: 'هدیه ثبت شود؟',
        description: 'فقط اگر عضویت این حساب را بررسی کرده‌ای، هدیه را ثبت کن.',
        confirmText: 'ثبت یک هفته هدیه',
      });
      if (!ok || this.account()?.email !== account.email) return;
      this.rewardSaving.set(true);
      try {
        const updated = await firstValueFrom(
          this.http.post<BillingAccount>(`${this.api}/billing/admin/rewards`, {
            email: account.email,
            campaign,
            reason: reason.trim(),
          }),
        );
        if (this.account()?.email === account.email) this.account.set(updated);
        this.rewardModel.update((model) => ({ ...model, reason: '' }));
        this.pendingRewards.reload();
        this.notifications.success('هدیه ثبت شد.');
      } catch (error) {
        this.notifications.error('تغییر ثبت نشد', apiErrorMessage(error));
      } finally {
        this.rewardSaving.set(false);
      }
    });
  }

  protected readonly saving = signal(false);

  protected readonly orderLabels = {
    PAID: 'پرداخت‌شده',
    PENDING: 'در انتظار تأیید',
    FAILED: 'ناموفق',
    REFUNDED: 'بازپرداخت‌شده',
  } as const;
  protected readonly orderBadges = {
    PAID: 'default',
    PENDING: 'secondary',
    FAILED: 'destructive',
    REFUNDED: 'outline',
  } as const;

  protected readonly refunding = signal(false);
  protected readonly refundOrder = signal<BillingOrderSummary | null>(null);
  protected readonly refundModel = signal<{
    amountToman: number;
    reference: string;
    access: 'remove' | 'keep';
    reason: string;
  }>({ amountToman: 0, reference: '', access: 'remove', reason: '' });
  protected readonly refundForm = form(this.refundModel, (path) => {
    min(path.amountToman, 1, { message: 'مبلغ را وارد کن' });
    max(path.amountToman, () => (this.refundOrder()?.amountRial ?? 0) / 10, {
      message: 'بیشتر از مبلغ پرداخت‌شده نمی‌شود',
    });
    maxLength(path.reference, 64);
    pattern(path.reference, /^[\w./-]*$/, {
      message: 'فقط حروف انگلیسی، عدد و - / .',
    });
    required(path.reason, { message: 'دلیل را بنویس' });
    minLength(path.reason, 3, { message: 'دلیل را بنویس' });
    maxLength(path.reason, 200);
  });

  protected startRefund(order: BillingOrderSummary): void {
    this.refundOrder.set(order);
    this.refundModel.set({
      amountToman: order.amountRial / 10,
      reference: '',
      access: 'remove',
      reason: '',
    });
    this.refundForm().reset();
  }

  protected setRefundAccess(value: unknown): void {
    if (value === 'remove' || value === 'keep')
      this.refundModel.update((model) => ({ ...model, access: value }));
  }

  protected refund(): void {
    const account = this.account();
    const order = this.refundOrder();
    if (!account || !order || this.refunding()) return;
    submit(this.refundForm, async () => {
      const { amountToman, reference, access, reason } = this.refundModel();
      const ok = await this.confirm.ask({
        title: 'بازپرداخت ثبت شود؟',
        description:
          access === 'remove'
            ? 'ثبت بازپرداخت قابل برگشت نیست و مدت این سفارش از دسترسی پولی کم می‌شود.'
            : 'ثبت بازپرداخت قابل برگشت نیست. دسترسی پولی تغییر نمی‌کند.',
        confirmText: 'ثبت بازپرداخت',
        destructive: true,
      });
      if (!ok || this.account()?.email !== account.email) return;
      this.refunding.set(true);
      try {
        const updated = await firstValueFrom(
          this.http.post<BillingAccount>(`${this.api}/billing/admin/refunds`, {
            orderId: order.id,
            amountRial: Math.round(amountToman) * 10,
            access,
            reason: reason.trim(),
            ...(reference.trim() ? { reference: reference.trim() } : {}),
          }),
        );
        if (this.account()?.email === account.email) this.account.set(updated);
        this.refundOrder.set(null);
        this.notifications.success('بازپرداخت ثبت شد');
      } catch (error) {
        this.notifications.error('بازپرداخت ثبت نشد', apiErrorMessage(error));
      } finally {
        this.refunding.set(false);
      }
    });
  }

  protected readonly findModel = signal({ email: '' });
  protected readonly findForm = form(this.findModel, (path) => {
    required(path.email, { message: 'ایمیل را وارد کن' });
    email(path.email, { message: 'ایمیل معتبر وارد کن.' });
  });

  protected readonly adjustModel = signal<{
    action: Action;
    days: number;
    reason: string;
  }>({ action: 'extend', days: 30, reason: '' });
  protected readonly adjustForm = form(this.adjustModel, (path) => {
    min(path.days, 1, { message: 'بین ۱ تا ۳۶۶ روز' });
    max(path.days, 366, { message: 'بین ۱ تا ۳۶۶ روز' });
    required(path.reason, { message: 'دلیل را بنویس' });
    minLength(path.reason, 3, { message: 'دلیل را بنویس' });
  });

  protected setAction(value: unknown): void {
    if (value === 'extend' || value === 'end')
      this.adjustModel.update((model) => ({ ...model, action: value }));
  }

  protected find(): void {
    submit(this.findForm, async () => {
      this.finding.set(true);
      try {
        this.account.set(
          await firstValueFrom(
            this.http.get<BillingAccount>(`${this.api}/billing/admin/account`, {
              params: { email: this.findModel().email.trim() },
            }),
          ),
        );
      } catch (error) {
        this.account.set(null);
        this.notifications.error(
          error instanceof HttpErrorResponse && error.status === 404
            ? 'حسابی با این ایمیل نیست'
            : 'حساب پیدا نشد',
          error instanceof HttpErrorResponse && error.status === 404
            ? undefined
            : apiErrorMessage(error),
        );
      } finally {
        this.finding.set(false);
      }
    });
  }

  protected adjust(): void {
    const account = this.account();
    if (!account) return;
    submit(this.adjustForm, async () => {
      const { action, days, reason } = this.adjustModel();
      const ok = await this.confirm.ask(
        action === 'end'
          ? {
              title: 'اشتراک همین حالا تمام شود؟',
              description: 'دسترسی پولی این کاربر بلافاصله قطع می‌شود.',
              confirmText: 'پایان اشتراک',
              destructive: true,
            }
          : {
              title: 'اشتراک تمدید شود؟',
              description:
                'روزها از پایان اشتراک فعلی، یا از امروز اگر تمام شده، اضافه می‌شوند.',
              confirmText: 'تمدید اشتراک',
            },
      );
      if (!ok) return;
      this.saving.set(true);
      try {
        this.account.set(
          await firstValueFrom(
            this.http.post<BillingAccount>(
              `${this.api}/billing/admin/adjustments`,
              action === 'end'
                ? { email: account.email, action, reason: reason.trim() }
                : { email: account.email, action, days, reason: reason.trim() },
            ),
          ),
        );
        this.adjustModel.set({ action: 'extend', days: 30, reason: '' });
        this.adjustForm().reset();
        this.notifications.success('تغییر ثبت شد');
      } catch (error) {
        this.notifications.error('تغییر ثبت نشد', apiErrorMessage(error));
      } finally {
        this.saving.set(false);
      }
    });
  }
}
