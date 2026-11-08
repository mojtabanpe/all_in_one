import { httpResource } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import type {
  BillingAdminOrderPage,
  BillingMetrics,
  BillingOrderStatus,
} from '@all-in-one/shared/schemas';
import {
  AioBadge,
  AioButton,
  AioDatePipe,
  AioLocale,
  AioMetric,
  AioTableDirectives,
  AioTranslate,
  verbatim,
} from '@all-in-one/ui';
import { API_BASE_URL } from '@all-in-one/web/shared';

/** Support view of every payment, with the last 30 days at a glance. */
@Component({
  selector: 'admin-billing-orders',
  imports: [
    AioBadge,
    AioButton,
    AioDatePipe,
    AioMetric,
    AioTableDirectives,
    AioTranslate,
  ],
  template: `
    <section aria-labelledby="orders-title" class="flex flex-col gap-4">
      <h2 id="recurring-title" class="text-xl font-semibold">
        {{ 'درآمد تکرارشونده' | aioTranslate }}
      </h2>
      @if (commercial.error()) {
        <p role="alert" class="flex flex-wrap items-center gap-2">
          {{ 'آمار اشتراک دریافت نشد.' | aioTranslate }}
          <button
            aioBtn
            variant="outline"
            class="min-h-11"
            (click)="commercial.reload()"
          >
            {{ 'تلاش دوباره' | aioTranslate }}
          </button>
        </p>
      } @else {
        <dl
          class="grid grid-cols-2 gap-3 lg:grid-cols-5"
          aria-labelledby="recurring-title"
        >
          @for (metric of recurring(); track metric.label) {
            <div
              aioMetric
              [definition]="true"
              class="glass flex flex-col-reverse gap-1 rounded-2xl p-4"
              valueClass="text-2xl font-bold tabular-nums"
              [label]="metric.label"
              [value]="metric.value"
            ></div>
          }
        </dl>
        <p class="text-sm text-muted-foreground">
          {{
            'درآمد ماهانه: آخرین پرداخت هر مشترک فعال (منهای بازپرداخت) تقسیم بر ماه‌های آن. تمدید دستی در آن حساب نمی‌شود. بقیهٔ آمار مربوط به ۳۰ روز اخیر است.'
              | aioTranslate
          }}
        </p>
      }
      <h2 id="orders-title" class="text-xl font-semibold">
        {{ 'پرداخت‌ها' | aioTranslate }}
      </h2>
      <dl class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        @for (metric of metrics(); track metric.label) {
          <div
            aioMetric
            [definition]="true"
            class="glass flex flex-col-reverse gap-1 rounded-2xl p-4"
            valueClass="text-2xl font-bold tabular-nums"
            [label]="metric.label"
            [value]="metric.value"
          ></div>
        }
      </dl>
      <p class="text-sm text-muted-foreground">
        {{
          'سفارش‌های درگاه بر اساس زمان ایجاد سفارش و پرداخت‌های تأییدشده بر اساس زمان تأیید شمرده می‌شوند.'
            | aioTranslate
        }}
      </p>
      <div
        class="flex flex-wrap gap-2"
        role="group"
        [attr.aria-label]="'فیلتر وضعیت' | aioTranslate"
      >
        @for (filter of filters; track filter.label) {
          <button
            aioBtn
            size="sm"
            class="min-h-11"
            [variant]="status() === filter.status ? 'default' : 'outline'"
            [attr.aria-pressed]="status() === filter.status"
            (click)="status.set(filter.status); page.set(1)"
          >
            {{ filter.label | aioTranslate }}
          </button>
        }
      </div>
      @if (list.hasValue()) {
        @if (list.value().orders.length) {
          <div aioTableContainer class="glass rounded-3xl p-2">
            <table aioTable>
              <thead aioTHead>
                <tr aioTr>
                  <th aioTh>{{ 'کاربر' | aioTranslate }}</th>
                  <th aioTh>{{ 'مبلغ' | aioTranslate }}</th>
                  <th aioTh>{{ 'وضعیت' | aioTranslate }}</th>
                  <th aioTh>{{ 'زمان' | aioTranslate }}</th>
                  <th aioTh>{{ 'شمارهٔ پیگیری' | aioTranslate }}</th>
                </tr>
              </thead>
              <tbody aioTBody>
                @for (order of list.value().orders; track order.id) {
                  <tr aioTr>
                    <td aioTd dir="ltr" class="text-end">{{ order.email }}</td>
                    <td aioTd class="tabular-nums">
                      {{
                        '{0} تومان'
                          | aioTranslate: [locale.number(order.amountRial / 10)]
                      }}
                      <span class="block text-xs text-muted-foreground">{{
                        'اشتراک {0} ماهه'
                          | aioTranslate: [locale.number(order.months)]
                      }}</span>
                    </td>
                    <td aioTd>
                      <span aioBadge [variant]="badge[order.status]">{{
                        label[order.status] | aioTranslate
                      }}</span>
                      @if (order.refundedRial && order.status === 'PAID') {
                        <span class="block text-xs text-muted-foreground">{{
                          'بازپرداخت {0} تومان'
                            | aioTranslate
                              : [locale.number(order.refundedRial / 10)]
                        }}</span>
                      }
                    </td>
                    <td aioTd>
                      {{
                        order.createdAt
                          | aioDate: { dateStyle: 'medium', timeStyle: 'short' }
                      }}
                    </td>
                    <td aioTd dir="ltr" class="text-end text-xs">
                      {{ order.refNumber ?? '—' }}
                      @if (order.trackId) {
                        <span class="block text-muted-foreground">{{
                          'زیبال {0}' | aioTranslate: [verbatim(order.trackId)]
                        }}</span>
                      } @else if (order.provider !== 'ZIBAL') {
                        <span class="block text-muted-foreground">{{
                          (order.provider === 'BAZAAR' ? 'کافه‌بازار' : 'مایکت')
                            | aioTranslate
                        }}</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="flex justify-center gap-2">
            <button
              aioBtn
              variant="outline"
              class="min-h-11"
              [disabled]="page() === 1"
              (click)="page.update((p) => p - 1)"
            >
              {{ 'قبلی' | aioTranslate }}
            </button>
            <button
              aioBtn
              variant="outline"
              class="min-h-11"
              [disabled]="page() * 50 >= list.value().total"
              (click)="page.update((p) => p + 1)"
            >
              {{ 'بعدی' | aioTranslate }}
            </button>
          </div>
        } @else {
          <p class="text-muted-foreground">
            {{ 'پرداختی با این وضعیت نیست.' | aioTranslate }}
          </p>
        }
      } @else if (list.error()) {
        <p role="alert">{{ 'پرداخت‌ها دریافت نشدند.' | aioTranslate }}</p>
        <button
          aioBtn
          variant="outline"
          class="min-h-11 w-fit"
          (click)="list.reload()"
        >
          {{ 'تلاش دوباره' | aioTranslate }}
        </button>
      }
    </section>
  `,
})
export class BillingOrders {
  protected readonly locale = inject(AioLocale);
  private readonly api = inject(API_BASE_URL);
  protected readonly verbatim = verbatim;
  protected readonly status = signal<BillingOrderStatus | undefined>(undefined);
  protected readonly page = signal(1);
  protected readonly list = httpResource<BillingAdminOrderPage>(() => ({
    url: `${this.api}/billing/admin/orders`,
    params: {
      page: this.page(),
      ...(this.status() ? { status: this.status() as string } : {}),
    },
  }));
  protected readonly filters = [
    { label: 'همه', status: undefined },
    { label: 'پرداخت‌شده', status: 'PAID' },
    { label: 'در انتظار تأیید', status: 'PENDING' },
    { label: 'ناموفق', status: 'FAILED' },
    { label: 'بازپرداخت‌شده', status: 'REFUNDED' },
  ] as const;
  protected readonly label = {
    PAID: 'پرداخت‌شده',
    PENDING: 'در انتظار تأیید',
    FAILED: 'ناموفق',
    REFUNDED: 'بازپرداخت‌شده',
  } as const;
  protected readonly badge = {
    PAID: 'default',
    PENDING: 'secondary',
    FAILED: 'destructive',
    REFUNDED: 'outline',
  } as const;

  protected readonly commercial = httpResource<BillingMetrics>(
    () => `${this.api}/billing/admin/metrics`,
  );

  protected recurring() {
    const value = this.commercial.hasValue()
      ? this.commercial.value()
      : undefined;
    const n = (x: number | undefined) =>
      x === undefined ? '—' : this.locale.number(x);
    return [
      {
        label: 'درآمد ماهانهٔ تکرارشونده (تومان)',
        value: n(value && Math.round(value.mrrRial / 10)),
      },
      {
        label: 'مشترک پولی فعال',
        value:
          value && value.manualPaidUsers
            ? this.locale.text('{0} (دستی: {1})', [
                n(value.paidUsers),
                n(value.manualPaidUsers),
              ])
            : n(value?.paidUsers),
      },
      { label: 'مشترک تازه در ۳۰ روز', value: n(value?.newPaidUsers) },
      { label: 'تمدید در ۳۰ روز', value: n(value?.renewals) },
      { label: 'اشتراک تمام‌شده در ۳۰ روز', value: n(value?.endedPaidUsers) },
    ];
  }

  protected metrics() {
    const overview = this.list.hasValue()
      ? this.list.value().overview
      : undefined;
    const n = (value: number | undefined) =>
      value === undefined ? '—' : this.locale.number(value);
    return [
      {
        label: 'درآمد ۳۰ روز (تومان)',
        value: n(overview && overview.paidRial / 10),
      },
      {
        label: 'سفارش‌های دارای شناسهٔ درگاه در ۳۰ روز',
        value: n(overview?.gatewayOrders),
      },
      {
        label: 'پرداخت‌های تأییدشده در ۳۰ روز',
        value: n(overview?.paidOrders),
      },
      { label: 'پرداخت ناموفق در ۳۰ روز', value: n(overview?.failedOrders) },
      { label: 'در انتظار تأیید', value: n(overview?.pendingOrders) },
      { label: 'بازپرداخت در ۳۰ روز', value: n(overview?.refunds) },
      {
        label: 'مبلغ بازپرداخت ۳۰ روز (تومان)',
        value: n(overview && overview.refundedRial / 10),
      },
    ];
  }
}
