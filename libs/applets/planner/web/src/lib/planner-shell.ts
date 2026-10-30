import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AioButton, AioIcon, provideIcons } from '@all-in-one/ui';
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
  imports: [AioButton, AioIcon, RouterLink, RouterLinkActive, RouterOutlet],
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
      <header>
        <p class="aio-eyebrow">ذهن خلوت، مسیر روشن</p>
        <h1 class="aio-page-title">جا برای کارهای مهم.</h1>
      </header>
      <nav
        class="aio-applet-tabs grid grid-cols-5 gap-1 rounded-2xl p-1"
        aria-label="بخش‌های برنامه‌ریز"
      >
        @for (link of links; track link.path) {
          <a
            aioBtn
            variant="ghost"
            class="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground h-12 flex-col gap-0.5 rounded-xl px-1 text-xs"
            [routerLink]="link.path"
            routerLinkActive
            #rla="routerLinkActive"
            [routerLinkActiveOptions]="{ exact: link.exact }"
            [attr.data-active]="rla.isActive"
            [attr.aria-current]="rla.isActive ? 'page' : null"
          >
            <aio-icon [name]="link.icon" size="sm" />
            {{ link.label }}
          </a>
        }
      </nav>
      <router-outlet />
    </div>
  `,
})
export class PlannerShell {
  protected readonly links = [
    { path: '.', label: 'کارها', icon: 'lucideListChecks', exact: true },
    {
      path: 'calendar',
      label: 'تقویم',
      icon: 'lucideCalendarDays',
      exact: false,
    },
    { path: 'habits', label: 'عادت‌ها', icon: 'lucideRepeat', exact: false },
    { path: 'focus', label: 'تمرکز', icon: 'lucideTimer', exact: false },
    {
      path: 'countdowns',
      label: 'روزشمار',
      icon: 'lucideHourglass',
      exact: false,
    },
  ];
}
