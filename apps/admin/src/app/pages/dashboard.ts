import { CampaignReport } from './campaign-report';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import type {
  AdminStats,
  GrowthRetentionCohort,
  GrowthChurnReport,
  GrowthSummary,
  GrowthMonitoring,
  GrowthClient,
  GrowthClientReport,
} from '@all-in-one/shared/schemas';
import {
  AioTranslate,
  AioCardDirectives,
  AioCardHeading,
  AioSkeletonRows,
  AioLocale,
  AioButton,
  AioTableDirectives,
  AioEmptyState,
  AioFormField,
  AioNativeSelect,
  AioNativeSelectOption,
} from '@all-in-one/ui';
import { API_BASE_URL, ApiStatus } from '@all-in-one/web/shared';

@Component({
  selector: 'admin-dashboard',
  imports: [
    CampaignReport,
    AioCardDirectives,
    ApiStatus,
    AioCardHeading,
    AioSkeletonRows,
    AioTranslate,
    AioButton,
    AioTableDirectives,
    AioEmptyState,
    AioFormField,
    AioNativeSelect,
    AioNativeSelectOption,
  ],
  template: `
    <div class="flex flex-col gap-4">
      <h1 class="text-2xl font-bold">{{ 'داشبورد' | aioTranslate }}</h1>
      @if (stats.hasValue()) {
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
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          <p class="text-sm text-muted-foreground">
            {{
              'آمار نصب فقط از مرورگرهایی می‌آید که رویداد نصب را گزارش می‌کنند. باز کردن راهنمای نصب دستی در این شمارش نمی‌آید.'
                | aioTranslate
            }}
          </p>
          <h2 class="mt-4 text-xl font-semibold">
            {{ 'شروع کار بر اساس هدف' | aioTranslate }}
          </h2>
          <p class="text-sm leading-7 text-muted-foreground">
            {{
              'حساب‌های مشتری ساخته‌شده در ۳۰ روز اخیر بر اساس روزهای تهران، از جمله حساب‌های منتظر تأیید ایمیل. نخستین هدف ثبت‌شده برای حساب‌های قدیمی از هدف زمان مهاجرت شروع می‌شود. با تغییر هدف، تکمیل قدم اول از نو سنجیده می‌شود. ستون هفت‌روزه فقط حساب‌های دست‌کم هفت‌روزه را می‌شمارد.'
                | aioTranslate
            }}
          </p>
          <div class="grid gap-3 sm:grid-cols-3">
            @for (tile of onboardingTiles(); track tile.label) {
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
          <div
            aioTableContainer
            class="max-w-full overflow-x-auto"
            tabindex="0"
            [attr.aria-label]="'شروع کار بر اساس هدف' | aioTranslate"
          >
            <table aioTable>
              <caption aioCaption>
                {{
                  'قدم اول فقط پس از فعالیت موفق مرتبط با هدف کامل می‌شود. باز کردن صفحه کافی نیست. همهٔ اعداد این بخش بر اساس حساب هستند.'
                    | aioTranslate
                }}
              </caption>
              <thead aioTHead>
                <tr aioTr>
                  <th aioTh scope="col">
                    {{ 'نوع هدف' | aioTranslate }}
                  </th>
                  <th aioTh scope="col">
                    {{ 'نخستین هدف ثبت‌شده' | aioTranslate }}
                  </th>
                  <th aioTh scope="col">
                    {{ 'هدف فعلی' | aioTranslate }}
                  </th>
                  <th aioTh scope="col">{{ 'قدم اول کامل' | aioTranslate }}</th>
                  <th aioTh scope="col">
                    {{ 'در انتظار قدم اول' | aioTranslate }}
                  </th>
                  <th aioTh scope="col">
                    {{ 'قدم اول در هفت روز' | aioTranslate }}
                  </th>
                </tr>
              </thead>
              <tbody aioTBody>
                @for (row of growth.value().onboarding.goals; track row.goal) {
                  <tr aioTr>
                    <th aioTh scope="row">
                      {{ goalLabels[row.goal] | aioTranslate }}
                    </th>
                    <td aioTd>{{ fa(row.firstGoalAccounts) }}</td>
                    <td aioTd>{{ fa(row.selectedAccounts) }}</td>
                    <td aioTd>{{ fa(row.completedAccounts) }}</td>
                    <td aioTd>
                      {{ fa(row.selectedAccounts - row.completedAccounts) }}
                    </td>
                    <td aioTd>
                      @if (row.firstWeekEligibleAccounts) {
                        <bdi>{{
                          '{0} از {1}'
                            | aioTranslate
                              : [
                                  fa(row.firstWeekCompletedAccounts),
                                  fa(row.firstWeekEligibleAccounts),
                                ]
                        }}</bdi>
                      } @else {
                        —
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
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
                    'شمارش بازدیدکنندگان یکتا؛ اولین فعالیت یعنی ساخت کار، مرور کارت یا ثبت وعده و ورزش در این مرورگر طی دورهٔ نگهداری آمار.'
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
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div
              aioSkeletonRows
              class="contents"
              [count]="8"
              itemClass="h-24 rounded-3xl"
            ></div>
          </div>
        }
      </section>
      <section aioCard>
        <div
          aioCardHeading
          [title]="'نگهداشت به تفکیک هفتهٔ ثبت‌نام' | aioTranslate"
          [level]="2"
        ></div>
        <div aioCardContent class="flex min-w-0 flex-col gap-3">
          <p class="text-sm text-muted-foreground">
            {{
              'مرورگرهای ثبت‌نام‌شده در ۹۰ روز اخیر، گروه‌بندی‌شده از شنبه. فقط روزهای کامل در نرخ بازگشت حساب می‌شوند.'
                | aioTranslate
            }}
          </p>
          @if (cohortChannels().length) {
            <aio-form-field
              label="کانال جذب برای گزارش نگهداشت"
              controlId="retention-channel"
              class="w-full max-w-sm"
            >
              <aio-native-select
                selectId="retention-channel"
                [value]="cohortChannel()"
                (valueChange)="cohortChannel.set($event)"
              >
                <option aioNativeSelectOption value="">
                  {{ 'جمع همهٔ کانال‌ها' | aioTranslate }}
                </option>
                @for (channel of cohortChannels(); track channel.query) {
                  <option
                    aioNativeSelectOption
                    [value]="channel.query"
                    dir="ltr"
                  >
                    {{ channel.source }} / {{ channel.medium }}
                  </option>
                }
              </aio-native-select>
            </aio-form-field>
          }
          @if (cohorts.isLoading()) {
            <div aioSkeletonRows [count]="4" itemClass="h-10"></div>
          } @else if (cohorts.hasValue()) {
            @if (cohorts.value().length) {
              <div
                aioTableContainer
                class="max-w-full overflow-x-auto"
                tabindex="0"
                [attr.aria-label]="
                  'نگهداشت به تفکیک هفتهٔ ثبت‌نام' | aioTranslate
                "
              >
                <table aioTable>
                  <thead aioTHead>
                    <tr aioTr>
                      <th aioTh scope="col">
                        {{ 'شروع هفته' | aioTranslate }}
                      </th>
                      <th aioTh scope="col">
                        {{ 'ثبت‌نام‌ها' | aioTranslate }}
                      </th>
                      <th aioTh scope="col">D1</th>
                      <th aioTh scope="col">D7</th>
                      <th aioTh scope="col">D30</th>
                    </tr>
                  </thead>
                  <tbody aioTBody>
                    @for (cohort of cohorts.value(); track cohort.week) {
                      <tr aioTr>
                        <th aioTh scope="row">
                          {{ locale.date(cohort.week) }}
                        </th>
                        <td aioTd>{{ fa(cohort.signups) }}</td>
                        @for (day of cohort.days; track day.day) {
                          <td aioTd>
                            @if (day.eligible) {
                              <bdi>{{
                                retentionRate(day.returned, day.eligible)
                              }}</bdi>
                              <bdi class="text-muted-foreground"
                                >({{ fa(day.returned) }}/{{
                                  fa(day.eligible)
                                }})</bdi
                              >
                            } @else {
                              —
                            }
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p>
                {{ 'هنوز داده‌ای برای نگهداشت ثبت نشده است.' | aioTranslate }}
              </p>
            }
          } @else {
            <button
              aioBtn
              type="button"
              variant="outline"
              class="self-start"
              (click)="cohorts.reload()"
            >
              {{ 'دریافت دوباره آمار نگهداشت' | aioTranslate }}
            </button>
          }
        </div>
      </section>
      <section aioCard>
        <div
          aioCardHeading
          [title]="'ریزش کاربران به تفکیک کانال' | aioTranslate"
          [level]="2"
        ></div>
        <div aioCardContent class="flex min-w-0 flex-col gap-3">
          <p class="text-sm text-muted-foreground">
            {{
              'مرورگرهای ثبت‌نام‌شده در ۹۰ روز اخیر، بر اساس اولین منبع و رسانه. هر ثبت‌نام بعد از ۱۴ روز سنجیده می‌شود: ریزش یعنی هیچ فعالیتی در ۱۴ روز اخیر؛ «هرگز فعال نشده» یعنی بعد از ثبت‌نام اصلاً فعالیتی نداشته است.'
                | aioTranslate
            }}
          </p>
          @if (churn.isLoading()) {
            <div aioSkeletonRows [count]="4" itemClass="h-10"></div>
          } @else if (churn.hasValue()) {
            @let report = churn.value();
            @if (report.rows.length) {
              <div
                aioTableContainer
                class="max-w-full overflow-x-auto"
                tabindex="0"
                [attr.aria-label]="'ریزش کاربران به تفکیک کانال' | aioTranslate"
              >
                <table aioTable>
                  <thead aioTHead>
                    <tr aioTr>
                      <th aioTh scope="col">
                        {{ 'منبع / رسانه' | aioTranslate }}
                      </th>
                      <th aioTh scope="col">
                        {{ 'ثبت‌نام‌ها' | aioTranslate }}
                      </th>
                      <th aioTh scope="col">
                        {{ 'سنجیده‌شده (۱۴+ روز)' | aioTranslate }}
                      </th>
                      <th aioTh scope="col">{{ 'ریزش' | aioTranslate }}</th>
                      <th aioTh scope="col">
                        {{ 'هرگز فعال نشده' | aioTranslate }}
                      </th>
                    </tr>
                  </thead>
                  <tbody aioTBody>
                    @for (row of churnRows(); track row.key) {
                      <tr aioTr>
                        <th aioTh scope="row">
                          @if (row.total) {
                            {{ 'جمع همهٔ کانال‌ها' | aioTranslate }}
                          } @else {
                            <bdi dir="ltr" lang="en"
                              >{{ row.source }} / {{ row.medium }}</bdi
                            >
                          }
                        </th>
                        <td aioTd>{{ fa(row.signups) }}</td>
                        <td aioTd>{{ fa(row.mature) }}</td>
                        <td aioTd>
                          @if (row.mature) {
                            <bdi>{{
                              retentionRate(row.churned, row.mature)
                            }}</bdi>
                            <bdi class="text-muted-foreground"
                              >({{ fa(row.churned) }}/{{ fa(row.mature) }})</bdi
                            >
                          } @else {
                            —
                          }
                        </td>
                        <td aioTd>
                          @if (row.mature) {
                            <bdi>{{
                              retentionRate(row.neverActive, row.mature)
                            }}</bdi>
                          } @else {
                            —
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p>
                {{ 'هنوز ثبت‌نامی برای سنجش ریزش نیست.' | aioTranslate }}
              </p>
            }
          } @else {
            <button
              aioBtn
              type="button"
              variant="outline"
              class="self-start"
              (click)="churn.reload()"
            >
              {{ 'دریافت دوباره آمار ریزش' | aioTranslate }}
            </button>
          }
        </div>
      </section>
      <section
        class="flex min-w-0 flex-col gap-4"
        aria-labelledby="clients-heading"
      >
        <h2 id="clients-heading" class="text-xl font-semibold">
          {{ 'استفاده به تفکیک نسخهٔ برنامه' | aioTranslate }}
        </h2>
        <p class="text-sm leading-7 text-muted-foreground">
          {{
            'مرورگرها و نسخه‌های برنامهٔ بازشده در ۳۰ روز اخیر؛ منبع کمپین جداست. یک نفر می‌تواند در چند ردیف باشد. این آمار تعداد نصب یا افراد یکتا نیست و از زمان فعال‌سازی گزارش جمع می‌شود.'
              | aioTranslate
          }}
        </p>
        @if (clients.isLoading()) {
          <div aioSkeletonRows [count]="7" itemClass="h-11 rounded-xl"></div>
        } @else if (clients.hasValue()) {
          <div aioTableContainer class="max-w-full overflow-x-auto">
            <table aioTable class="w-full table-fixed">
              <caption aioCaption>
                {{
                  'شناسه‌های یکتا در هر نسخه؛ برچسب بازار و مایکت نسخهٔ فایل را مشخص می‌کند، نه فروشگاه نصب‌کننده را.'
                    | aioTranslate
                }}
              </caption>
              <thead aioTHead>
                <tr aioTr>
                  <th aioTh scope="col" class="w-2/3 whitespace-normal">
                    {{ 'نسخهٔ برنامه' | aioTranslate }}
                  </th>
                  <th aioTh scope="col" class="whitespace-normal">
                    {{ 'شناسه‌های یکتا' | aioTranslate }}
                  </th>
                </tr>
              </thead>
              <tbody aioTBody>
                @for (row of clients.value().rows; track row.client) {
                  <tr aioTr>
                    <th aioTh scope="row" class="whitespace-normal">
                      {{ clientLabel(row.client) | aioTranslate }}
                    </th>
                    <td aioTd>{{ fa(row.visitors) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (clients.error()) {
          <div
            aioEmptyState
            [title]="'آمار نسخه‌های برنامه دریافت نشد' | aioTranslate"
            [description]="
              'دریافت نشدن آمار به معنی صفر بودن آن نیست.' | aioTranslate
            "
          >
            <button aioBtn variant="outline" (click)="clients.reload()">
              {{ 'تلاش دوباره' | aioTranslate }}
            </button>
          </div>
        }
      </section>
      <admin-campaign-report (exported)="monitoring.reload()" />
      <section aioCard aria-labelledby="growth-monitoring-heading">
        <div aioCardHeader>
          <h2 id="growth-monitoring-heading" aioCardTitle>
            {{ 'پایش هفتگی رشد' | aioTranslate }}
          </h2>
          <p aioCardDescription>
            {{
              'دو بازهٔ هفت‌روزهٔ کامل تهران تا دیروز. فعال‌سازی یعنی ثبت اولین کار، مرور کارت یا ثبت وعده و ورزش.'
                | aioTranslate
            }}
          </p>
        </div>
        <div aioCardContent class="flex min-w-0 flex-col gap-4">
          <button
            aioBtn
            variant="outline"
            type="button"
            class="min-h-11 self-start"
            [disabled]="monitoring.isLoading()"
            (click)="monitoring.reload()"
          >
            {{ 'به‌روزرسانی پایش رشد' | aioTranslate }}
          </button>
          @if (monitoring.hasValue()) {
            @for (alert of growthAlerts(); track alert) {
              <p
                class="rounded-lg border border-warning bg-warning/15 p-3 text-sm"
              >
                {{ alert | aioTranslate }}
              </p>
            }
            <div
              aioTableContainer
              class="max-w-full overflow-x-auto"
              tabindex="0"
              [attr.aria-label]="'پایش هفتگی رشد' | aioTranslate"
            >
              <table aioTable>
                <thead aioTHead>
                  <tr aioTr>
                    <th aioTh scope="col">
                      {{ 'بازهٔ هفت‌روزه' | aioTranslate }}
                    </th>
                    <th aioTh scope="col">
                      {{ 'حساب‌های ساخته‌شده' | aioTranslate }}
                    </th>
                    <th aioTh scope="col">{{ 'فعال‌سازی' | aioTranslate }}</th>
                  </tr>
                </thead>
                <tbody aioTBody>
                  @for (week of monitoring.value().weeks; track week.from) {
                    <tr aioTr>
                      <th aioTh scope="row">
                        {{
                          '{0} تا {1}'
                            | aioTranslate
                              : [locale.date(week.from), locale.date(week.to)]
                        }}
                      </th>
                      <td aioTd>{{ fa(week.signups) }}</td>
                      <td aioTd>{{ fa(week.activations) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <h3 class="font-semibold">
              {{ 'فعالیت اخیر گزارش‌ها' | aioTranslate }}
            </h3>
            @if (monitoring.value().audit.length) {
              <div
                aioTableContainer
                class="max-w-full overflow-x-auto"
                tabindex="0"
                [attr.aria-label]="'فعالیت اخیر گزارش‌ها' | aioTranslate"
              >
                <table aioTable>
                  <thead aioTHead>
                    <tr aioTr>
                      <th aioTh scope="col">{{ 'زمان' | aioTranslate }}</th>
                      <th aioTh scope="col">{{ 'گزارش' | aioTranslate }}</th>
                      <th aioTh scope="col">
                        {{ 'نوع فعالیت' | aioTranslate }}
                      </th>
                      <th aioTh scope="col">
                        {{ 'شناسهٔ مدیر' | aioTranslate }}
                      </th>
                    </tr>
                  </thead>
                  <tbody aioTBody>
                    @for (entry of monitoring.value().audit; track entry.id) {
                      <tr aioTr>
                        <td aioTd>
                          {{ locale.date(entry.createdAt, auditDateOptions) }}
                        </td>
                        <td aioTd>
                          {{ auditReportLabels[entry.report] | aioTranslate }}
                        </td>
                        <td aioTd>
                          {{
                            (entry.action === 'EXPORT'
                              ? 'درخواست خروجی CSV'
                              : 'بازدید گزارش'
                            ) | aioTranslate
                          }}
                        </td>
                        <td aioTd>
                          <bdi class="font-mono text-xs">{{
                            entry.actorId
                          }}</bdi>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="text-sm text-muted-foreground">
                {{ 'هنوز فعالیتی برای گزارش‌ها ثبت نشده است.' | aioTranslate }}
              </p>
            }
          } @else if (monitoring.error()) {
            <p class="text-sm text-muted-foreground" role="status">
              {{ 'داده‌های پایش رشد در دسترس نیست.' | aioTranslate }}
            </p>
          } @else {
            <div aioSkeletonRows [count]="3" itemClass="h-12 rounded-xl"></div>
          }
        </div>
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
  protected readonly churn = httpResource<GrowthChurnReport>(
    () => `${this.api}/growth/churn`,
  );
  protected readonly cohortChannel = signal('');
  protected readonly cohortChannels = computed(() =>
    (this.churn.hasValue() ? this.churn.value().rows : []).map(
      ({ source, medium }) => ({
        source,
        medium,
        query: new URLSearchParams({ source, medium }).toString(),
      }),
    ),
  );
  protected readonly cohorts = httpResource<GrowthRetentionCohort[]>(() => {
    const channel = this.cohortChannel();
    return `${this.api}/growth/retention-cohorts${channel ? '?' + channel : ''}`;
  });
  /** Channels, then the total row (only when there is more than one channel). */
  protected readonly churnRows = computed(() => {
    if (!this.churn.hasValue()) return [];
    const { rows, totals } = this.churn.value();
    return [
      ...rows.map((row) => ({
        ...row,
        key: `${row.source}\u0000${row.medium}`,
        total: false,
      })),
      ...(rows.length > 1
        ? [{ ...totals, source: '', medium: '', key: 'total', total: true }]
        : []),
    ];
  });
  protected readonly growth = httpResource<GrowthSummary>(
    () => `${this.api}/growth/summary`,
  );
  protected readonly monitoring = httpResource<GrowthMonitoring>(
    () => `${this.api}/growth/monitoring`,
  );
  protected readonly clients = httpResource<GrowthClientReport>(
    () => `${this.api}/growth/clients`,
  );
  protected clientLabel(client: GrowthClient): string {
    return {
      bazaar: 'کافه‌بازار',
      myket: 'مایکت',
      direct_apk: 'اندروید مستقیم (APK عمومی)',
      pwa: 'وب‌اپ نصب‌شده (PWA)',
      web: 'مرورگر وب',
      macos: 'برنامهٔ مک',
      unknown_app: 'برنامهٔ شناسایی‌نشده',
    }[client];
  }
  protected readonly growthAlerts = computed(() => {
    if (!this.monitoring.hasValue()) return [];
    const [current, previous] = this.monitoring.value().weeks;
    if (!current || !previous) return [];
    const alerts: string[] = [];
    if (current.signups < previous.signups)
      alerts.push('تعداد ثبت‌نام‌ها نسبت به هفت روز قبل کمتر شده است.');
    if (current.activations < previous.activations)
      alerts.push('تعداد فعال‌سازی‌ها نسبت به هفت روز قبل کمتر شده است.');
    return alerts;
  });
  protected readonly auditDateOptions = {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  } satisfies Intl.DateTimeFormatOptions;
  protected readonly auditReportLabels = {
    SUMMARY: 'خلاصهٔ جذب',
    CAMPAIGNS: 'عملکرد کمپین‌ها',
    RETENTION: 'بازگشت هفتگی',
    CHURN: 'ریزش کاربران به تفکیک کانال',
  };
  protected readonly goalLabels = {
    planner: 'برنامه‌ریز',
    english: 'زبان',
    health: 'سلامت',
  };
  protected readonly onboardingTiles = computed(() => {
    const data = this.growth.hasValue()
      ? this.growth.value().onboarding
      : undefined;
    return data
      ? [
          { label: 'حساب‌های مشتری تازه', value: data.accounts },
          {
            label: 'هنوز هدف انتخاب نکرده‌اند',
            value: data.unselectedAccounts,
          },
          { label: 'راهنما را رد کرده‌اند', value: data.skippedAccounts },
        ]
      : [];
  });
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
          { label: 'نمایش درخواست نصب وب‌اپ', value: data.pwaPromptVisitors },
          {
            label: 'نصب وب‌اپ تأییدشده توسط مرورگر',
            value: data.pwaInstalledVisitors,
          },
          {
            label: 'مشاهدهٔ پنجرهٔ ارتقای هوش مصنوعی',
            value: data.paywallVisitors,
          },
        ]
      : [];
  });
  protected readonly tiles = computed(() => {
    // value() throws in the error state, which would stop the whole dashboard from updating.
    if (!this.stats.hasValue()) return [];
    const s = this.stats.value();
    return [
      // Staff accounts are not customers, so the count the operator reads is customers only.
      { label: 'کاربران', value: s.customers },
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
