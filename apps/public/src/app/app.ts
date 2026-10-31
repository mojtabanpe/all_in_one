import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  AioAppShell,
  type AioNavItem,
  AioToaster,
  provideIcons,
} from '@all-in-one/ui';
import {
  lucideHouse,
  lucideInfo,
  lucideLayoutGrid,
  lucideSparkles,
} from '@ng-icons/lucide';

/** Public site (no login): same shell, so phones get the floating bottom nav too. */
@Component({
  imports: [AioAppShell, AioToaster, RouterOutlet],
  providers: [
    provideIcons({ lucideHouse, lucideInfo, lucideLayoutGrid, lucideSparkles }),
  ],
  selector: 'public-root',
  template: `
    <aio-app-shell appName="پشتت گرم" [navItems]="nav">
      <router-outlet />
    </aio-app-shell>
    <aio-toaster />
  `,
})
export class App {
  protected readonly nav: readonly AioNavItem[] = [
    { label: 'خانه', icon: 'lucideHouse', link: '/', exact: true },
    { label: 'اپلت‌ها', icon: 'lucideLayoutGrid', link: '/applets' },
    { label: 'درباره', icon: 'lucideInfo', link: '/about' },
  ];
}
