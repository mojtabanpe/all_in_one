import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  type FitnessWeek,
  type HealthProfile,
  HEALTH_GOAL_LABELS,
  type MealLog,
} from '@all-in-one/applets/health/contracts';
import { toIsoDate } from '@all-in-one/shared/schemas';
import {
  AioButton,
  AioCardDirectives,
  AioIcon,
  AioProgressDirectives,
  provideIcons,
} from '@all-in-one/ui';
import { faNumber } from '@all-in-one/web/shared';
import { lucideDumbbell, lucideSalad, lucideUserRound } from '@ng-icons/lucide';
import { HealthApi } from './health-api';

@Component({
  selector: 'health-overview',
  imports: [
    AioButton,
    AioCardDirectives,
    AioIcon,
    AioProgressDirectives,
    RouterLink,
  ],
  providers: [provideIcons({ lucideDumbbell, lucideSalad, lucideUserRound })],
  template: `
    <div class="grid gap-3 sm:grid-cols-2">
      <section aioCard>
        <div aioCardHeader>
          <h2 aioCardTitle class="flex items-center gap-2">
            <aio-icon name="lucideUserRound" size="sm" />نیاز روزانه
          </h2>
          <p aioCardDescription>
            {{
              profile.value()?.calorieTarget
                ? 'بر اساس مشخصات و هدف شما (' + goalLabel() + ')'
                : 'برای محاسبه، مشخصاتتان را کامل کنید.'
            }}
          </p>
        </div>
        <div aioCardContent>
          @if (profile.value()?.calorieTarget; as target) {
            <p class="text-3xl font-bold">
              {{ fa(target) }}
              <span class="text-muted-foreground text-base font-normal"
                >کالری</span
              >
            </p>
          } @else {
            <a aioBtn variant="outline" routerLink="profile">تکمیل مشخصات</a>
          }
        </div>
      </section>

      <section aioCard>
        <div aioCardHeader>
          <h2 aioCardTitle class="flex items-center gap-2">
            <aio-icon name="lucideDumbbell" size="sm" />فعالیت ۷ روز اخیر
          </h2>
          <p aioCardDescription>هدف سازمان جهانی بهداشت: ۱۵۰ دقیقه در هفته</p>
        </div>
        <div aioCardContent class="flex flex-col gap-2">
          <div
            aioProgress
            [value]="Math.min(week.value()?.minutes ?? 0, 150)"
            [max]="150"
            aria-label="دقیقه فعالیت هفته"
          >
            <div aioProgressIndicator></div>
          </div>
          <p class="text-sm">
            {{ fa(week.value()?.minutes ?? 0) }} دقیقه ·
            {{ fa(week.value()?.sessions ?? 0) }} جلسه ·
            {{ fa(week.value()?.calories ?? 0) }} کالری
          </p>
        </div>
        <div aioCardFooter>
          <a aioBtn variant="outline" size="sm" routerLink="fitness"
            >ثبت ورزش</a
          >
        </div>
      </section>

      <section aioCard class="sm:col-span-2">
        <div aioCardHeader>
          <h2 aioCardTitle class="flex items-center gap-2">
            <aio-icon name="lucideSalad" size="sm" />وعده‌های امروز
          </h2>
          <p aioCardDescription>
            @if (meals.value()?.length) {
              {{ fa(meals.value()!.length) }} وعده ثبت شده · میانگین امتیاز
              {{ fa(averageScore()) }} از ۱۰۰
            } @else {
              هنوز وعده‌ای برای امروز ثبت نکرده‌اید.
            }
          </p>
        </div>
        <div aioCardFooter>
          <a aioBtn size="sm" routerLink="nutrition">ثبت و سنجش وعده</a>
        </div>
      </section>
    </div>
  `,
})
export class HealthOverview {
  private readonly api = inject(HealthApi);
  private readonly today = toIsoDate(new Date());
  protected readonly Math = Math;
  protected readonly profile = httpResource<HealthProfile>(
    () => `${this.api.base}/profile`,
  );
  protected readonly week = httpResource<FitnessWeek>(
    () => `${this.api.base}/workouts/week?date=${this.today}`,
  );
  protected readonly meals = httpResource<MealLog[]>(
    () => `${this.api.base}/meals?date=${this.today}`,
  );
  protected readonly goalLabel = computed(
    () => HEALTH_GOAL_LABELS[this.profile.value()?.goal ?? 'MAINTAIN'],
  );
  protected readonly averageScore = computed(() => {
    const list = this.meals.value() ?? [];
    return list.length
      ? Math.round(list.reduce((s, m) => s + m.score, 0) / list.length)
      : 0;
  });
  protected readonly fa = (n: number) => faNumber(n);
}
