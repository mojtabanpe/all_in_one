import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router';
import {
  AioAppShell,
  AioButton,
  AioIcon,
  type AioNavItem,
  provideIcons,
} from '@all-in-one/ui';
import { Assistant, AuthStore } from '@all-in-one/web/shared';
import type { AssistantContext } from '@all-in-one/shared/schemas';
import { Pwa } from './pwa';
import {
  lucideCalendarCheck,
  lucideDownload,
  lucideHeartPulse,
  lucideHouse,
  lucideLanguages,
  lucideLogOut,
  lucideUserRound,
  lucideSparkles,
} from '@ng-icons/lucide';

/** Signed-in layout: shell with the applets in the navigation. */
@Component({
  selector: 'customer-layout',
  imports: [
    RouterLink,
    AioAppShell,
    AioButton,
    AioIcon,
    Assistant,
    RouterOutlet,
  ],
  providers: [
    provideIcons({
      lucideCalendarCheck,
      lucideDownload,
      lucideHeartPulse,
      lucideHouse,
      lucideLanguages,
      lucideLogOut,
      lucideUserRound,
      lucideSparkles,
    }),
  ],
  template: `
    <aio-app-shell appName="پشتت گرم" [navItems]="nav">
      <web-assistant aioShellActions [context]="assistantContext()" />
      @if (pwa.installAvailable()) {
        <button
          aioShellActions
          aioBtn
          variant="ghost"
          class="h-11"
          (click)="pwa.install()"
        >
          <aio-icon name="lucideDownload" size="sm" />
          نصب
        </button>
      }
      <a
        aioShellActions
        aioBtn
        variant="ghost"
        size="icon"
        class="size-11"
        routerLink="/account"
        aria-label="حساب کاربری"
      >
        <aio-icon name="lucideUserRound" size="sm" />
      </a>
      <button
        aioShellActions
        aioBtn
        variant="ghost"
        class="size-11 md:w-auto"
        aria-label="خروج از حساب"
        (click)="logout()"
      >
        <aio-icon name="lucideLogOut" size="sm" />
        <span class="hidden md:inline">خروج</span>
      </button>
      <router-outlet />
    </aio-app-shell>
  `,
})
export class Layout {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly pwa = inject(Pwa);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  /** The assistant focuses on the applet the user is in. */
  protected readonly assistantContext = computed<AssistantContext>(() => {
    const first = this.url().split(/[/?#]/)[1];
    return first === 'planner' || first === 'health' || first === 'english'
      ? first
      : 'home';
  });

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
