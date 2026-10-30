import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import type { AdminStats } from '@all-in-one/shared/schemas';
import { AioCardDirectives, AioSkeleton } from '@all-in-one/ui';
import { API_BASE_URL, ApiStatus, faNumber } from '@all-in-one/web/shared';

@Component({
  selector: 'admin-dashboard',
  imports: [AioCardDirectives, AioSkeleton, ApiStatus],
  template: `
    <div class="flex flex-col gap-4">
      <h1 class="text-2xl font-bold">داشبورد</h1>
      @if (stats.value()) {
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          @for (tile of tiles(); track tile.label) {
            <section aioCard size="sm">
              <div aioCardHeader>
                <p aioCardDescription>{{ tile.label }}</p>
                <h2 aioCardTitle class="text-2xl">{{ fa(tile.value) }}</h2>
              </div>
            </section>
          }
        </div>
      } @else {
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          @for (i of [1, 2, 3, 4]; track i) {
            <div aioSkeleton class="h-24 rounded-3xl"></div>
          }
        </div>
      }
      <web-api-status />
    </div>
  `,
})
export class Dashboard {
  private readonly api = inject(API_BASE_URL);
  protected readonly stats = httpResource<AdminStats>(
    () => `${this.api}/admin/stats`,
  );
  protected readonly fa = (n: number) => faNumber(n);
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
