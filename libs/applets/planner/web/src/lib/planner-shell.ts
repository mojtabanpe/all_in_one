import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  AioAppletHeader,
  type AioAppletTab,
  provideIcons,
} from '@all-in-one/ui';
import { ReminderSheet } from './reminder-sheet';
import {
  lucideCalendarDays,
  lucideHourglass,
  lucideListChecks,
  lucideRepeat,
  lucideTimer,
} from '@ng-icons/lucide';

/** Planner frame: TickTick's tabs for tasks, calendar, habits, focus and countdowns. */
@Component({
  selector: 'planner-shell',
  imports: [AioAppletHeader, ReminderSheet, RouterOutlet],
  providers: [
    provideIcons({
      lucideCalendarDays,
      lucideHourglass,
      lucideListChecks,
      lucideRepeat,
      lucideTimer,
    }),
  ],
  template: `
    <div
      class="applet-planner mx-auto flex w-full max-w-2xl flex-col gap-5 [&>router-outlet]:hidden"
    >
      <aio-applet-header
        title="جا برای کارهای مهم."
        subtitle="ذهن خلوت، مسیر روشن"
        navigationLabel="بخش‌های برنامه‌ریز"
        [tabs]="links"
      />
      <router-outlet />
      <planner-reminder-sheet />
    </div>
  `,
})
export class PlannerShell {
  protected readonly links: readonly AioAppletTab[] = [
    { path: '.', label: 'کارها', icon: 'lucideListChecks', exact: true },
    { path: 'habits', label: 'عادت‌ها', icon: 'lucideRepeat', exact: false },
    {
      path: 'calendar',
      label: 'تقویم',
      icon: 'lucideCalendarDays',
      exact: false,
    },
    { path: 'focus', label: 'تمرکز', icon: 'lucideTimer', exact: false },
    {
      path: 'countdowns',
      label: 'روزشمار',
      icon: 'lucideHourglass',
      exact: false,
    },
  ];
}
