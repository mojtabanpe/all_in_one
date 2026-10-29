import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AioAppShell, type AioNavItem, provideIcons } from '@all-in-one/ui';
import {
  lucideCalendarCheck,
  lucideHeartPulse,
  lucideHouse,
  lucideLanguages,
  lucideSparkles,
  lucideUserRound,
} from '@ng-icons/lucide';

@Component({
  imports: [AioAppShell, RouterOutlet],
  providers: [
    provideIcons({
      lucideCalendarCheck,
      lucideHeartPulse,
      lucideHouse,
      lucideLanguages,
      lucideSparkles,
      lucideUserRound,
    }),
  ],
  selector: 'customer-root',
  template: `
    <aio-app-shell appName="همه در یک" [navItems]="nav">
      <router-outlet />
    </aio-app-shell>
  `,
})
export class App {
  protected readonly nav: readonly AioNavItem[] = [
    { label: 'خانه', icon: 'lucideHouse', link: '/', exact: true },
    { label: 'برنامه‌ریز', icon: 'lucideCalendarCheck', link: '/planner' },
    { label: 'انگلیسی', icon: 'lucideLanguages', link: '/english' },
    { label: 'سلامت', icon: 'lucideHeartPulse', link: '/health' },
    { label: 'پروفایل', icon: 'lucideUserRound', link: '/profile' },
  ];
}
