import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import type { AdminStats } from '@all-in-one/shared/schemas';
import {
  AioTranslate,
  AioCardDirectives,
  AioCardHeading,
  AioSkeletonRows,
  AioLocale,
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
