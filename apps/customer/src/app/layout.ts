import {
  Component,
  computed,
  effect,
  inject,
  afterNextRender,
  signal,
} from '@angular/core';
import { HttpClient, httpResource } from '@angular/common/http';
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
  AioInAppNotifications,
  AioInAppNotificationHost,
  type AioInAppNotification,
} from '@all-in-one/ui';
import {
  API_BASE_URL,
  Assistant,
  AuthStore,
  PushSettings,
} from '@all-in-one/web/shared';
import {
  resolveEnabledApplets,
  type AssistantContext,
  type BillingAccessState,
  type InAppNotification,
} from '@all-in-one/shared/schemas';
import { Pwa } from './pwa';
import { AiPaywall } from './billing/ai-paywall';
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
  lucideWallet,
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
    AioInAppNotificationHost,
    AioTranslate,
  ],
  providers: [
    AioInAppNotifications,
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
      lucideWallet,
    }),
  ],
  template: `
    <aio-app-shell
      appName="Poshtetgarm"
      [navItems]="navigation()"
      [language]="english() ? 'en' : 'fa'"
    >
      <aio-in-app-notifications [suspended]="paywall.open()" />
      @if (!studySession()) {
        <web-assistant floating [context]="assistantContext()" />
      }
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
  /** A flashcard review keeps its answer and rating buttons at the bottom, where the assistant button would cover them. */
  protected readonly studySession = computed(() =>
    /^\/english\/deck\/[^/?#]+\/study(?:[?#]|$)/.test(this.url()),
  );
  /** The assistant focuses on the applet the user is in. */
  protected readonly assistantContext = computed<AssistantContext>(() => {
    const first = this.url().split(/[/?#]/)[1];
    return first === 'planner' ||
      first === 'health' ||
      first === 'english' ||
      first === 'expenses'
      ? first
      : 'home';
  });

  protected readonly nav = computed<readonly AioNavItem[]>(() => {
    const user = this.auth.user();
    const enabled = new Set(
      resolveEnabledApplets(user?.enabledApplets, user?.role),
    );
    const items: AioNavItem[] = [
      { label: 'خانه', icon: 'lucideHouse', link: '/', exact: true },
    ];
    if (enabled.has('planner')) {
      items.push({
        label: 'برنامه‌ریز',
        icon: 'lucideCalendarCheck',
        link: '/planner',
      });
    }
    if (enabled.has('english')) {
      items.push({
        label: 'انگلیسی',
        icon: 'lucideLanguages',
        link: '/english',
      });
    }
    if (enabled.has('health')) {
      items.push({
        label: 'سلامت',
        icon: 'lucideHeartPulse',
        link: '/health',
      });
    }
    if (enabled.has('expenses')) {
      items.push({
        label: 'مخارج',
        icon: 'lucideWallet',
        link: '/expenses',
      });
    }
    return items;
  });

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
  protected readonly navigation = computed(() => {
    const list = this.nav();
    return this.english()
      ? list.map((item) => ({
          ...item,
          label:
            item.link === '/planner'
              ? 'Planner'
              : item.link === '/english'
                ? 'English'
                : item.link === '/health'
                  ? 'Health'
                  : item.link === '/expenses'
                    ? 'Expenses'
                    : 'Home',
        }))
      : list;
  });

  protected readonly paywall = inject(AiPaywall);
  private readonly inApp = inject(AioInAppNotifications);
  private readonly browserReady = signal(false);
  private readonly http = inject(HttpClient);
  private readonly notices = httpResource<InAppNotification[]>(() =>
    this.browserReady() ? `${this.api}/in-app-notifications` : undefined,
  );

  private readonly push = inject(PushSettings);
  /** Push works in the Android/macOS app, a desktop browser and an installed iPhone PWA, not in an iPhone tab. */
  private canPush(): boolean {
    if (!this.push.supported) return false;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone =
      matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return !ios || standalone;
  }

  constructor() {
    afterNextRender(() => this.browserReady.set(true));
    const seen = new Set<string>();
    let previousNotices = new Set<string>();
    effect(() => {
      if (!this.notices.hasValue()) return;
      const live = new Set(this.notices.value().map((notice) => notice.id));
      for (const id of previousNotices) {
        if (!live.has(id)) this.inApp.remove(id);
      }
      previousNotices = live;
      for (const { widget, ...notice } of this.notices.value()) {
        if (seen.has(notice.id)) continue;
        seen.add(notice.id);
        // A reminders prompt is useless where this device cannot get them (an iPhone browser tab).
        if (widget?.kind === 'push' && !this.canPush()) continue;
        const enqueue = (embedded?: AioInAppNotification['widget']) =>
          this.inApp.enqueue({
            ...notice,
            widget: embedded,
            actions: notice.actions.map((action) => ({
              ...action,
              run: () => {
                if (action.url.startsWith('/'))
                  void this.router.navigateByUrl(action.url);
                // Inside the Android shell a new window may never open; a plain navigation is handed to the
                // store app or the browser by the shell (it never loads outside links in the WebView).
                else if (/PoshtetgarmStore\//.test(navigator.userAgent))
                  window.location.assign(action.url);
                else window.open(action.url, '_blank', 'noopener,noreferrer');
              },
            })),
            onDismiss: () => {
              this.http
                .post(
                  `${this.api}/in-app-notifications/${notice.id}/dismiss`,
                  {},
                )
                .subscribe({ error: () => undefined });
            },
          });
        if (!widget) enqueue();
        // The prompt widgets (forms for the hard steps) load only when a prompt arrives.
        else
          void import('./prompts/prompt-registry').then(
            ({ promptWidget }) =>
              enqueue(promptWidget(widget.kind, widget.data)),
            () => undefined,
          );
      }
    });
    // A payment or reward changes access on the billing page; refresh the header after leaving it.
    let previous = this.url();
    effect(() => {
      const url = this.url();
      if (previous.startsWith('/billing') && !url.startsWith('/billing')) {
        this.access.reload();
        this.notices.reload();
      }
      previous = url;
    });
  }

  protected async logout() {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
