import { Component, computed, effect, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
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
  AioTranslate,
  AioLocale,
  AioAppShell,
  AioButton,
  AioIcon,
  AioSkeleton,
  type AioNavItem,
  provideIcons,
  AioSkeletonLines,
} from '@all-in-one/ui';
import { API_BASE_URL, Assistant, AuthStore } from '@all-in-one/web/shared';
import type {
  AssistantContext,
  BillingAccessState,
} from '@all-in-one/shared/schemas';
import { Pwa } from './pwa';
import {
  lucideCalendarCheck,
  lucideCrown,
  lucideDownload,
  lucideHeartPulse,
  lucideHouse,
  lucideLanguages,
  lucideLogOut,
  lucideUserRound,
  lucideSparkles,
} from '@ng-icons/lucide';

/** The trial reminder appears in the header this many days before it ends. */
const TRIAL_NOTICE_DAYS = 3;

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
    AioSkeletonLines,
    AioTranslate,
  ],
  providers: [
    provideIcons({
      lucideCalendarCheck,
      lucideCrown,
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
      <web-assistant floating [context]="assistantContext()" />
      @if (pwa.installAvailable()) {
        <button
          aioShellActions
          aioBtn
          variant="ghost"
          class="size-11 sm:w-auto"
          [attr.aria-label]="(english() ? 'Install' : 'نصب') | aioTranslate"
          (click)="pwa.install()"
        >
          <aio-icon name="lucideDownload" size="sm" />
          <span class="hidden sm:inline">{{
            (english() ? 'Install' : 'نصب') | aioTranslate
          }}</span>
        </button>
      }
      @if (upgrade(); as label) {
        <a
          aioShellActions
          aioBtn
          variant="outline"
          class="h-11 min-w-11 px-3"
          routerLink="/billing"
          [attr.aria-label]="label | aioTranslate: upgradeValues()"
        >
          <aio-icon name="lucideCrown" size="sm" />
          <span class="hidden sm:inline" aria-hidden="true">{{
            label | aioTranslate: upgradeValues()
          }}</span>
        </a>
      }
      <a
        aioShellActions
        aioBtn
        variant="ghost"
        size="icon"
        class="size-11"
        routerLink="/account"
        [attr.aria-label]="
          (english() ? 'Account' : 'حساب کاربری') | aioTranslate
        "
      >
        <aio-icon name="lucideUserRound" size="sm" />
      </a>
      <button
        aioShellActions
        aioBtn
        variant="ghost"
        class="size-11 md:w-auto"
        [attr.aria-label]="
          (english() ? 'Sign out' : 'خروج از حساب') | aioTranslate
        "
        (click)="logout()"
      >
        <aio-icon name="lucideLogOut" size="sm" />
        <span class="hidden md:inline">{{
          (english() ? 'Sign out' : 'خروج') | aioTranslate
        }}</span>
      </button>
      @if (pendingRoute(); as route) {
        <div
          class="aio-route-loading aio-applet-layout"
          role="status"
          [attr.aria-label]="
            (english() ? 'Loading page' : 'در حال دریافت صفحه') | aioTranslate
          "
          aria-busy="true"
        >
          <div
            class="aio-route-heading-placeholder"
            aria-hidden="true"
            aioSkeletonLines
            [lines]="[
              'h-9 w-3/4 max-w-sm rounded-xl',
              'h-5 w-1/2 max-w-xs rounded-lg',
            ]"
          ></div>
          <div
            aioSkeleton
            class="h-16 w-full rounded-2xl"
            aria-hidden="true"
          ></div>
          <div
            class="grid gap-5 sm:grid-cols-2"
            aria-hidden="true"
            aioSkeletonLines
            [lines]="[
              'h-64 rounded-3xl sm:col-span-2',
              'h-32 rounded-2xl',
              'h-32 rounded-2xl',
            ]"
          ></div>
        </div>
      }
      <!-- The applets paint their own ambient light; the other pages get the brand's. -->
      <div
        class="aio-route-content"
        [class.hidden]="!!pendingRoute()"
        [class.lx-stage]="assistantContext() === 'home'"
        [class.lx-brand]="assistantContext() === 'home'"
      >
        <router-outlet />
      </div>
    </aio-app-shell>
  `,
})
export class Layout {
  protected readonly locale = inject(AioLocale);

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

  protected readonly english = this.locale.english;
  private readonly api = inject(API_BASE_URL);
  private readonly access = httpResource<BillingAccessState>(
    () => `${this.api}/billing/access`,
  );
  /** Whole days of trial left, counting today; null when not on a trial. */
  private readonly trialDays = computed(() => {
    if (!this.access.hasValue()) return null;
    const { tier, trialUntil, aiUntil } = this.access.value();
    if (tier !== 'trial' || !trialUntil) return null;
    // A week queued after the trial (directives 108, 121) means AI does not stop when it ends.
    if (aiUntil && aiUntil > trialUntil) return null;
    return Math.max(
      1,
      Math.ceil((Date.parse(trialUntil) - Date.now()) / 86_400_000),
    );
  });
  /** A way to the plans before the paywall: on the free tier, or near the trial's end. */
  protected readonly upgrade = computed(() => {
    if (!this.access.hasValue()) return null;
    if (this.access.value().tier === 'free') return 'دیدن پلن‌ها';
    const days = this.trialDays();
    if (days === null || days > TRIAL_NOTICE_DAYS) return null;
    return days === 1 ? 'آخرین روز آزمایشی' : '{0} روز آزمایشی مانده';
  });
  protected readonly upgradeValues = computed(() => [
    this.locale.number(this.trialDays() ?? 0),
  ]);
  protected readonly navigation = computed(() =>
    this.english()
      ? this.nav.map((item, i) => ({
          ...item,
          label: ['Home', 'Planner', 'English', 'Health'][i],
        }))
      : this.nav,
  );

  constructor() {
    // A payment or reward changes access on the billing page; refresh the header after leaving it.
    let previous = this.url();
    effect(() => {
      const url = this.url();
      if (previous.startsWith('/billing') && !url.startsWith('/billing'))
        this.access.reload();
      previous = url;
    });
  }

  protected async logout() {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
