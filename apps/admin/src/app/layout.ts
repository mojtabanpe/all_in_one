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
  lucideLayoutDashboard,
  lucideLibrary,
  lucideLogOut,
  lucidePalette,
  lucideShieldCheck,
  lucideUsers,
} from '@ng-icons/lucide';

@Component({
  selector: 'admin-layout',
  imports: [AioAppShell, AioButton, AioIcon, RouterOutlet],
  providers: [
    provideIcons({
      lucideLayoutDashboard,
      lucideLibrary,
      lucideLogOut,
      lucidePalette,
      lucideShieldCheck,
      lucideUsers,
    }),
  ],
  template: `
    <aio-app-shell
      appName="پنل مدیریت"
      brandIcon="lucideShieldCheck"
      [navItems]="nav"
    >
      <button
        aioShellActions
        aioBtn
        variant="ghost"
        class="h-11"
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
    { label: 'داشبورد', icon: 'lucideLayoutDashboard', link: '/', exact: true },
    { label: 'کاربران', icon: 'lucideUsers', link: '/users' },
    { label: 'محتوا', icon: 'lucideLibrary', link: '/content' },
    { label: 'طراحی', icon: 'lucidePalette', link: '/design' },
  ];

  protected async logout() {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
