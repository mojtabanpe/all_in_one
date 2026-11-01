import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import {
  NavigationEnd,
  NavigationStart,
  NavigationCancel,
  NavigationError,
  NavigationSkipped,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router';
import {
  AioAppShell,
  AioButton,
  AioIcon,
  AioSkeleton,
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
    AioSkeleton,
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
    <aio-app-shell
      appName="Poshtetgarm"
      [navItems]="navigation()"
      [language]="english() ? 'en' : 'fa'"
    >
      <web-assistant aioShellActions [context]="assistantContext()" />
      @if (pwa.installAvailable()) {
        <button
          aioShellActions
          aioBtn
          variant="ghost"
          class="h-11"
          [attr.aria-label]="english() ? 'Install' : 'نصب'"
          (click)="pwa.install()"
        >
          <aio-icon name="lucideDownload" size="sm" />
          <span class="hidden sm:inline">{{
            english() ? 'Install' : 'نصب'
          }}</span>
        </button>
      }
      <a
        aioShellActions
        aioBtn
        variant="ghost"
        size="icon"
        class="size-11"
        routerLink="/account"
        [attr.aria-label]="english() ? 'Account' : 'حساب کاربری'"
      >
        <aio-icon name="lucideUserRound" size="sm" />
      </a>
      <button
        aioShellActions
        aioBtn
        variant="ghost"
        class="size-11 md:w-auto"
        [attr.aria-label]="english() ? 'Sign out' : 'خروج از حساب'"
        (click)="logout()"
      >
        <aio-icon name="lucideLogOut" size="sm" />
        <span class="hidden md:inline">{{
          english() ? 'Sign out' : 'خروج'
        }}</span>
      </button>
      @if (pendingRoute(); as route) {
        <div
          class="aio-route-loading aio-applet-layout"
          role="status"
          [attr.aria-label]="
            route.startsWith('/english') ? 'Loading page' : 'در حال دریافت صفحه'
          "
          aria-busy="true"
        >
          <div class="aio-route-heading-placeholder" aria-hidden="true">
            <div aioSkeleton class="h-9 w-3/4 max-w-sm rounded-xl"></div>
            <div aioSkeleton class="h-5 w-1/2 max-w-xs rounded-lg"></div>
          </div>
          <div
            aioSkeleton
            class="h-16 w-full rounded-2xl"
            aria-hidden="true"
          ></div>
          <div class="grid gap-5 sm:grid-cols-2" aria-hidden="true">
            <div aioSkeleton class="h-64 rounded-3xl sm:col-span-2"></div>
            <div aioSkeleton class="h-32 rounded-2xl"></div>
            <div aioSkeleton class="h-32 rounded-2xl"></div>
          </div>
        </div>
      }
      <div class="aio-route-content" [class.hidden]="!!pendingRoute()">
        <router-outlet />
      </div>
    </aio-app-shell>
  `,
})
export class Layout {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly pwa = inject(Pwa);
  protected readonly pendingRoute = toSignal(
    this.router.events.pipe(
      filter(
        (event) =>
          event instanceof NavigationStart ||
          event instanceof NavigationEnd ||
          event instanceof NavigationCancel ||
          event instanceof NavigationError ||
          event instanceof NavigationSkipped,
      ),
      map((event) => (event instanceof NavigationStart ? event.url : null)),
    ),
    { initialValue: null },
  );
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
  protected readonly english = computed(
    () => this.assistantContext() === 'english',
  );
  protected readonly navigation = computed(() =>
    this.english()
      ? this.nav.map((item, i) => ({
          ...item,
          label: ['Home', 'Planner', 'English', 'Health'][i],
        }))
      : this.nav,
  );

  protected async logout() {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
