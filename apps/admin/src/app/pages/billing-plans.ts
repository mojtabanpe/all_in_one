import { firstValueFrom } from 'rxjs';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import {
  form,
  FormField,
  FormRoot,
  max,
  min,
  pattern,
  readonly,
  required,
  submit,
} from '@angular/forms/signals';
import type { BillingPlan } from '@all-in-one/shared/schemas';
import {
  AioAsyncButton,
  AioBadge,
  AioButton,
  AioCardDirectives,
  AioFieldDirectives,
  AioFormErrors,
  AioFormField,
  AioInput,
  AioLocale,
  AioNotifications,
  AioNumberField,
  AioSwitch,
  AioTableDirectives,
  AioTranslate,
  verbatim,
} from '@all-in-one/ui';
import { API_BASE_URL, apiErrorMessage } from '@all-in-one/web/shared';
import { BillingOrders } from './billing-orders';

interface PlanModel {
  code: string;
  titleFa: string;
  titleEn: string;
  months: number;
  priceToman: number;
  active: boolean;
}

const EMPTY: PlanModel = {
  code: '',
  titleFa: '',
  titleEn: '',
  months: 1,
  priceToman: 0,
  active: false,
};

/** Subscription plans and prices. Nothing is sold until a plan is active. */
@Component({
  selector: 'admin-billing-plans',
  imports: [
    BillingOrders,
    AioAsyncButton,
    AioBadge,
    AioButton,
    AioCardDirectives,
    AioFormErrors,
    AioFieldDirectives,
    AioFormField,
    AioInput,
    AioNumberField,
    AioSwitch,
    AioTableDirectives,
    AioTranslate,
    FormField,
    FormRoot,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <header>
        <h1 class="text-2xl font-bold">
          {{ 'پلن‌های اشتراک' | aioTranslate }}
        </h1>
        <p class="mt-2 text-muted-foreground">
          {{
            'قیمت‌ها به تومان وارد می‌شوند و به ریال به زیبال می‌روند. فقط پلن‌های فعال به کاربران نشان داده می‌شوند؛ تغییر قیمت روی سفارش‌های قبلی اثری ندارد.'
              | aioTranslate
          }}
        </p>
      </header>

      @if (plans.hasValue() && plans.value().length) {
        <div aioTableContainer class="glass rounded-3xl p-2">
          <table aioTable>
            <thead aioTHead>
              <tr aioTr>
                <th aioTh>{{ 'پلن' | aioTranslate }}</th>
                <th aioTh>{{ 'مدت اشتراک' | aioTranslate }}</th>
                <th aioTh>{{ 'قیمت' | aioTranslate }}</th>
                <th aioTh>{{ 'وضعیت' | aioTranslate }}</th>
                <th aioTh>
                  <span class="sr-only">{{ 'ویرایش' | aioTranslate }}</span>
                </th>
              </tr>
            </thead>
            <tbody aioTBody>
              @for (plan of plans.value(); track plan.code) {
                <tr aioTr>
                  <td aioTd>
                    <span class="font-medium">{{
                      locale.english() ? plan.titleEn : plan.titleFa
                    }}</span>
                    <span
                      class="block text-xs text-muted-foreground"
                      dir="ltr"
                      >{{ plan.code }}</span
                    >
                  </td>
                  <td aioTd>
                    {{ '{0} ماه' | aioTranslate: [locale.number(plan.months)] }}
                  </td>
                  <td aioTd class="tabular-nums">
                    {{
                      '{0} تومان'
                        | aioTranslate: [locale.number(plan.priceRial / 10)]
                    }}
                  </td>
                  <td aioTd>
                    <span
                      aioBadge
                      [variant]="plan.active ? 'default' : 'secondary'"
                      >{{
                        (plan.active ? 'فعال' : 'فعال نیست') | aioTranslate
                      }}</span
                    >
                  </td>
                  <td aioTd class="text-end">
                    <button
                      aioBtn
                      variant="ghost"
                      class="min-h-11"
                      [attr.aria-label]="
                        'ویرایش {0}' | aioTranslate: [verbatim(plan.code)]
                      "
                      (click)="edit(plan)"
                    >
                      {{ 'ویرایش' | aioTranslate }}
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (plans.hasValue()) {
        <p class="text-muted-foreground">
          {{
            'هنوز پلنی تعریف نشده و پرداخت برای کاربران بسته است.'
              | aioTranslate
          }}
        </p>
      } @else if (plans.error()) {
        <p role="alert">{{ 'پلن‌ها دریافت نشدند.' | aioTranslate }}</p>
      }

      <section aioCard class="max-w-2xl" aria-labelledby="plan-form-heading">
        <div aioCardHeader>
          <h2 aioCardTitle id="plan-form-heading">
            {{ (editing() ? 'ویرایش پلن' : 'پلن تازه') | aioTranslate }}
          </h2>
        </div>
        <div aioCardContent>
          <form
            id="plan-form"
            class="grid gap-4 sm:grid-cols-2"
            [formRoot]="planForm"
            (submit)="$event.preventDefault(); save()"
          >
            <aio-form-field
              class="sm:col-span-2"
              [label]="'شناسه (انگلیسی، مثل monthly)' | aioTranslate"
              controlId="plan-code"
            >
              <input
                aioInput
                id="plan-code"
                dir="ltr"
                lang="en"
                autocomplete="off"
                [formField]="planForm.code"
              />
              <aio-form-errors [errors]="planForm.code().errors()" />
            </aio-form-field>
            <aio-form-field
              [label]="'عنوان فارسی' | aioTranslate"
              controlId="plan-fa"
            >
              <input aioInput id="plan-fa" [formField]="planForm.titleFa" />
              <aio-form-errors [errors]="planForm.titleFa().errors()" />
            </aio-form-field>
            <aio-form-field
              [label]="'عنوان انگلیسی' | aioTranslate"
              controlId="plan-en"
            >
              <input
                aioInput
                id="plan-en"
                dir="ltr"
                lang="en"
                [formField]="planForm.titleEn"
              />
              <aio-form-errors [errors]="planForm.titleEn().errors()" />
            </aio-form-field>
            <aio-number-field
              label="مدت (ماه)"
              controlId="plan-months"
              [field]="planForm.months"
              [showErrors]="true"
            />
            <aio-number-field
              label="قیمت (تومان)"
              controlId="plan-price"
              [field]="planForm.priceToman"
              [showErrors]="true"
            />
            <div class="flex min-h-11 items-center gap-3 sm:col-span-2">
              <aio-switch inputId="plan-active" [formField]="planForm.active" />
              <label aioFieldLabel for="plan-active">{{
                'فعال و قابل خرید' | aioTranslate
              }}</label>
            </div>
          </form>
        </div>
        <div aioCardFooter class="flex flex-wrap gap-3">
          <button
            aioAsyncButton
            type="submit"
            form="plan-form"
            class="min-h-11"
            label="ذخیرهٔ پلن"
            busyLabel="در حال ذخیره"
            [busy]="saving()"
          ></button>
          @if (editing()) {
            <button aioBtn variant="outline" class="min-h-11" (click)="reset()">
              {{ 'انصراف' | aioTranslate }}
            </button>
          }
        </div>
      </section>

      <admin-billing-orders />
    </div>
  `,
})
export class BillingPlans {
  protected readonly locale = inject(AioLocale);
  private readonly api = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(AioNotifications);
  protected readonly verbatim = verbatim;

  protected readonly plans = httpResource<BillingPlan[]>(
    () => `${this.api}/billing/admin/plans`,
  );
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly model = signal<PlanModel>({ ...EMPTY });
  protected readonly planForm = form(this.model, (path) => {
    required(path.code, { message: 'شناسه را وارد کن' });
    // A plan is identified by its code: editing changes everything else.
    readonly(path.code, () => this.editing());
    pattern(path.code, /^[a-z0-9][a-z0-9-]{0,31}$/, {
      message: 'فقط حروف کوچک انگلیسی، عدد و خط تیره',
    });
    required(path.titleFa, { message: 'عنوان فارسی را وارد کن' });
    required(path.titleEn, { message: 'عنوان انگلیسی را وارد کن' });
    min(path.months, 1, { message: 'بین ۱ تا ۲۴ ماه' });
    max(path.months, 24, { message: 'بین ۱ تا ۲۴ ماه' });
    min(path.priceToman, 1000, { message: 'دست‌کم ۱٬۰۰۰ تومان' });
    max(path.priceToman, 200_000_000, { message: 'حداکثر ۲۰۰ میلیون تومان' });
  });

  protected edit(plan: BillingPlan): void {
    this.model.set({
      code: plan.code,
      titleFa: plan.titleFa,
      titleEn: plan.titleEn,
      months: plan.months,
      priceToman: plan.priceRial / 10,
      active: plan.active,
    });
    this.editing.set(true);
  }

  protected reset(): void {
    this.model.set({ ...EMPTY });
    this.planForm().reset();
    this.editing.set(false);
  }

  protected save(): void {
    submit(this.planForm, async () => {
      const { priceToman, ...plan } = this.model();
      if (!Number.isInteger(priceToman)) {
        this.notifications.error('قیمت باید عدد صحیح تومان باشد');
        return;
      }
      this.saving.set(true);
      try {
        await firstValueFrom(
          this.http.put<BillingPlan>(`${this.api}/billing/admin/plans`, {
            ...plan,
            titleFa: plan.titleFa.trim(),
            titleEn: plan.titleEn.trim(),
            priceRial: priceToman * 10,
          }),
        );
        this.notifications.success('پلن ذخیره شد');
        this.plans.reload();
        this.reset();
      } catch (error) {
        this.notifications.error('پلن ذخیره نشد', apiErrorMessage(error));
      } finally {
        this.saving.set(false);
      }
    });
  }
}
