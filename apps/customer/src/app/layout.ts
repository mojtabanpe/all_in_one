import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import {
  AioAppShell,
  AioButton,
  AioIcon,
  type AioNavItem,
  provideIcons,
} from '@all-in-one/ui';
import { AuthStore } from '@all-in-one/web/shared';
import {
  lucideCalendarCheck,
  lucideHeartPulse,
  lucideHouse,
  lucideLanguages,
  lucideLogOut,
  lucideSparkles,
} from '@ng-icons/lucide';

/** Signed-in layout: shell with the applets in the navigation. */
@Component({
  selector: 'customer-layout',
  imports: [AioAppShell, AioButton, AioIcon, RouterOutlet],
  providers: [
    provideIcons({
      lucideCalendarCheck,
      lucideHeartPulse,
      lucideHouse,
      lucideLanguages,
      lucideLogOut,
      lucideSparkles,
    }),
  ],
  template: `
    <aio-app-shell appName="همه در یک" [navItems]="nav">
      <button
        aioShellActions
        aioBtn
        variant="ghost"
        size="sm"
        (click)="logout()"
      >
        <aio-icon name="lucideLogOut" size="sm" />
        خروج
      </button>
      <router-outlet />
    </aio-app-shell>
  `,
})
export class Layout {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly nav: readonly AioNavItem[] = [
    { label: 'خانه', icon: 'lucideHouse', link: '/', exact: true },
    { label: 'برنامه‌ریز', icon: 'lucideCalendarCheck', link: '/planner' },
    { label: 'انگلیسی', icon: 'lucideLanguages', link: '/english' },
    { label: 'سلامت', icon: 'lucideHeartPulse', link: '/health' },
  ];

  protected async logout() {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
