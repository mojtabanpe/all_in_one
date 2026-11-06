import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import type { AdminStats, GrowthSummary } from '@all-in-one/shared/schemas';
import {
  AioTranslate,
  AioCardDirectives,
  AioCardHeading,
  AioSkeletonRows,
  AioLocale,
  AioButton,
  AioTableDirectives,
  AioEmptyState,
} from '@all-in-one/ui';
import { API_BASE_URL, ApiStatus } from '@all-in-one/web/shared';

@Component({
  selector: 'admin-dashboard',
  imports: [
    AioCardDirectives,
    ApiStatus,
    AioCardHeading,
    AioSkeletonRows,
    AioTranslate,
    AioButton,
    AioTableDirectives,
    AioEmptyState,
  ],
  template: `
    <div class="flex flex-col gap-4">
      <h1 class="text-2xl font-bold">{{ 'داشبورد' | aioTranslate }}</h1>
      @if (stats.value()) {
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          @for (tile of tiles(); track tile.label) {
            <section aioCard size="sm">
              <div
                aioCardHeading
                [title]="fa(tile.value) | aioTranslate"
                [level]="2"
                [description]="tile.label | aioTranslate"
                titleClass="text-2xl"
              ></div>
            </section>
          }
        </div>
      } @else {
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div
            aioSkeletonRows
            class="contents"
            [count]="4"
            itemClass="h-24 rounded-3xl"
          ></div>
        </div>
      }
      <section
        class="mt-4 flex flex-col gap-4"
        aria-labelledby="acquisition-heading"
      >
        <div>
          <h2 id="acquisition-heading" class="text-xl font-semibold">
            {{ 'جذب و ثبت‌نام' | aioTranslate }}
          </h2>
          <p class="mt-2 text-sm leading-7 text-muted-foreground">
            {{
              'بازدیدکنندگان یکتا در ۳۰ روز اخیر؛ حساب ساخته‌شده می‌تواند هنوز منتظر تأیید ایمیل باشد. این شمارنده‌ها نرخ تبدیل یک گروه ثابت نیستند.'
                | aioTranslate
            }}
          </p>
        </div>
        @if (growth.hasValue()) {
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            @for (tile of growthTiles(); track tile.label) {
              <section aioCard size="sm">
                <div
                  aioCardHeading
                  [title]="fa(tile.value)"
                  [level]="3"
                  [description]="tile.label | aioTranslate"
                  titleClass="text-2xl"
                ></div>
              </section>
            }
          </div>
          <h2 class="mt-4 text-xl font-semibold">
            {{ 'فعالیت و بازگشت' | aioTranslate }}
          </h2>
          <p class="text-sm leading-7 text-muted-foreground">
            {{
              'مرورگرهای یکتا، نه تعداد افراد؛ ساخت کار، مرور کارت یا ثبت وعده و ورزش موفق. روزها بر اساس تهران هستند و امروز هنوز کامل نشده است. دادهٔ گذشته بازسازی نمی‌شود.'
                | aioTranslate
            }}
          </p>
          <div class="grid gap-3 sm:grid-cols-3">
            @for (tile of activityTiles(); track tile.label) {
              <section aioCard size="sm">
                <div
                  aioCardHeading
                  [title]="fa(tile.value)"
                  [level]="3"
                  [description]="tile.label | aioTranslate"
                  titleClass="text-2xl"
                ></div>
              </section>
            }
          </div>
          <section aioCard size="sm">
            <div
              aioCardHeading
              [title]="'فعالیت در سه روز از هفتهٔ اول' | aioTranslate"
              [level]="3"
              [description]="
                'ثبت‌نام‌های ۳۰ روز اخیر در همین مرورگر که هفت روز کامل از آن‌ها گذشته؛ روز ثبت‌نام هم حساب می‌شود. ثبت‌نام تازه وارد مخرج نمی‌شود.'
                  | aioTranslate
              "
            ></div>
            <div aioCardContent class="flex flex-wrap gap-6">
              <p>
                {{ 'گروه واجد شرایط' | aioTranslate }}:
                {{ fa(growth.value().activity.eligibleSignupVisitors) }}
              </p>
              <p>
                {{ 'رسیده به هدف' | aioTranslate }}:
                {{ fa(growth.value().activity.threeDaySignupVisitors) }}
              </p>
            </div>
          </section>
          <h3 class="mt-4 font-semibold">
            {{ 'بازگشت در روز مشخص' | aioTranslate }}
          </h3>
          <p class="text-sm leading-7 text-muted-foreground">
            {{
              'فعالیت دقیقاً در روز اول، هفتم یا سی‌ام پس از اولین ثبت‌نام ثبت‌شدهٔ مرورگر. برای هر شاخص، ۳۰ روز کاملِ بازگشت تا دیروز بررسی می‌شود؛ بنابراین گروه‌های ثبت‌نام متفاوت‌اند. امروز شمرده نمی‌شود.'
                | aioTranslate
            }}
          </p>
          <div
            aioTableContainer
            class="max-w-full overflow-x-auto"
            tabindex="0"
            [attr.aria-label]="'بازگشت در روز مشخص' | aioTranslate"
          >
            <table aioTable>
              <caption aioCaption>
                {{
                  'نبود گروه واجد شرایط با صفر درصد بازگشت تفاوت دارد. آمار فقط فعالیت ثبت‌شده در این مرورگر را می‌سنجد.'
                    | aioTranslate
                }}
              </caption>
              <thead aioTHead>
                <tr aioTr>
                  <th aioTh scope="col">
                    {{ 'روز پس از ثبت‌نام' | aioTranslate }}
                  </th>
                  <th aioTh scope="col">
                    {{ 'گروه واجد شرایط' | aioTranslate }}
                  </th>
                  <th aioTh scope="col">{{ 'بازگشته' | aioTranslate }}</th>
                  <th aioTh scope="col">{{ 'نرخ بازگشت' | aioTranslate }}</th>
                </tr>
              </thead>
              <tbody aioTBody>
                @for (row of growth.value().retention; track row.day) {
                  <tr aioTr>
                    <th aioTh scope="row">{{ fa(row.day) }}</th>
                    <td aioTd>{{ fa(row.eligibleVisitors) }}</td>
                    <td aioTd>{{ fa(row.returnedVisitors) }}</td>
                    <td aioTd>
                      {{
                        row.eligibleVisitors
                          ? retentionRate(
                              row.returnedVisitors,
                              row.eligibleVisitors
                            )
                          : ('هنوز قابل سنجش نیست' | aioTranslate)
                      }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <h3 class="mt-4 font-semibold">
            {{ 'کانال‌های جذب' | aioTranslate }}
          </h3>
          <p class="text-sm leading-7 text-muted-foreground">
            {{
              '۲۰ کانال برتر بر اساس اولین منبع مشاهده‌شدهٔ هر بازدیدکننده در همین ۳۰ روز؛ مستقیم و نامشخص یعنی منبع ثبت نشده است.'
                | aioTranslate
            }}
          </p>
          @if (growth.value().channels.length) {
            <div
              aioTableContainer
              class="max-w-full overflow-x-auto"
              tabindex="0"
              [attr.aria-label]="'کانال‌های جذب' | aioTranslate"
            >
              <table aioTable>
                <caption aioCaption>
                  {{
                    'شمارش بازدیدکنندگان یکتا؛ اولین فعالیت یعنی ساخت کار یا مرور کارت در این مرورگر طی دورهٔ نگهداری آمار.'
                      | aioTranslate
                  }}
                </caption>
                <thead aioTHead>
                  <tr aioTr>
                    <th aioTh scope="col">{{ 'منبع' | aioTranslate }}</th>
                    <th aioTh scope="col">{{ 'رسانه' | aioTranslate }}</th>
                    <th aioTh scope="col">{{ 'بازدید' | aioTranslate }}</th>
                    <th aioTh scope="col">
                      {{ 'شروع ثبت‌نام' | aioTranslate }}
                    </th>
                    <th aioTh scope="col">
                      {{ 'حساب‌های ساخته‌شده' | aioTranslate }}
                    </th>
                    <th aioTh scope="col">
                      {{ 'اولین فعالیت' | aioTranslate }}
                    </th>
                  </tr>
                </thead>
                <tbody aioTBody>
                  @for (channel of growth.value().channels; track $index) {
                    <tr aioTr>
                      <td aioTd>
                        <bdi
                          class="inline-block max-w-40 whitespace-normal break-words"
                          >{{
                            channel.source === 'direct'
                              ? ('مستقیم' | aioTranslate)
                              : channel.source
                          }}</bdi
                        >
                      </td>
                      <td aioTd>
                        <bdi
                          class="inline-block max-w-40 whitespace-normal break-words"
                          >{{
                            channel.medium === 'unknown'
                              ? ('نامشخص' | aioTranslate)
                              : channel.medium
                          }}</bdi
                        >
                      </td>
                      <td aioTd>{{ fa(channel.landingVisitors) }}</td>
                      <td aioTd>{{ fa(channel.signupVisitors) }}</td>
                      <td aioTd>{{ fa(channel.completedSignupVisitors) }}</td>
                      <td aioTd>{{ fa(channel.activatedVisitors) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div
              aioEmptyState
              [title]="'هنوز کانالی ثبت نشده' | aioTranslate"
              [description]="
                'آمار پس از اولین بازدید یا فعالیت ثبت‌شده نمایش داده می‌شود.'
                  | aioTranslate
              "
            ></div>
          }
        } @else if (growth.error()) {
          <section aioCard size="sm">
            <div
              aioCardHeading
              [title]="'آمار جذب دریافت نشد' | aioTranslate"
              [level]="3"
              [description]="
                'دریافت نشدن آمار به معنی صفر بودن آن نیست.' | aioTranslate
              "
            ></div>
            <div aioCardFooter>
              <button
                aioBtn
                variant="outline"
                type="button"
                (click)="growth.reload()"
              >
                {{ 'تلاش دوباره' | aioTranslate }}
              </button>
            </div>
          </section>
        } @else {
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div
              aioSkeletonRows
              class="contents"
              [count]="5"
              itemClass="h-24 rounded-3xl"
            ></div>
          </div>
        }
      </section>
      <web-api-status />
    </div>
  `,
})
export class Dashboard {
  protected readonly locale = inject(AioLocale);

  private readonly api = inject(API_BASE_URL);
  protected readonly stats = httpResource<AdminStats>(
    () => `${this.api}/admin/stats`,
  );
  protected readonly fa = (n: number) => this.locale.number(n);
  protected readonly retentionRate = (returned: number, eligible: number) =>
    this.locale.number(returned / eligible, {
      style: 'percent',
      maximumFractionDigits: 1,
    });
  protected readonly growth = httpResource<GrowthSummary>(
    () => `${this.api}/growth/summary`,
  );
  protected readonly activityTiles = computed(() => {
    const data = this.growth.hasValue()
      ? this.growth.value().activity
      : undefined;
    return data
      ? [
          { label: 'فعال امروز', value: data.dailyVisitors },
          { label: 'فعال در هفت روز اخیر', value: data.weeklyVisitors },
          { label: 'فعال در سی روز اخیر', value: data.monthlyVisitors },
        ]
      : [];
  });
  protected readonly growthTiles = computed(() => {
    const data = this.growth.hasValue() ? this.growth.value() : undefined;
    return data
      ? [
          { label: 'بازدیدکنندگان صفحهٔ معرفی', value: data.landingVisitors },
          { label: 'شروع‌کنندگان ثبت‌نام', value: data.signupVisitors },
          {
            label: 'بازدیدکنندگان با حساب ساخته‌شده',
            value: data.completedSignupVisitors,
          },
          { label: 'اولین ساخت کار در مرورگر', value: data.firstTaskVisitors },
          {
            label: 'اولین مرور کارت در مرورگر',
            value: data.firstReviewVisitors,
          },
        ]
      : [];
  });
  protected readonly tiles = computed(() => {
    const s = this.stats.value();
    if (!s) return [];
    return [
      { label: 'کاربران', value: s.users },
      { label: 'کاربران جدید این هفته', value: s.newUsersThisWeek },
      { label: 'کارهای برنامه‌ریز', value: s.plannerTasks },
      { label: 'کارت‌های انگلیسی', value: s.englishCards },
      { label: 'ورزش‌های ثبت‌شده', value: s.workouts },
      { label: 'وعده‌های سنجیده‌شده', value: s.meals },
      { label: 'برنامه‌های غذایی', value: s.mealPlans },
      { label: 'مدیران', value: s.admins },
    ];
  });
}
