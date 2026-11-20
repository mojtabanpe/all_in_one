import { Component, DestroyRef, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import type {
  BillingAccessState,
  BillingRewardOffer,
} from '@all-in-one/shared/schemas';
import { API_BASE_URL, GrowthAnalytics } from '@all-in-one/web/shared';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { SwPush } from '@angular/service-worker';
import {
  AioButton,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioToaster,
  AioKeyboard,
  AioLocale,
  AioTranslate,
} from '@all-in-one/ui';
import { AiPaywall } from './billing/ai-paywall';
import { ReferralCapture } from './billing/referral';
import { PwaBars } from './pwa';

/** In-app route for a push `data.url` (`/app/...`), or null when it is not ours. */
export function pushRoute(url: unknown): string | null {
  if (
    typeof url !== 'string' ||
    !url.startsWith('/app/') ||
    url.startsWith('//')
  )
    return null;
  return url.slice('/app'.length);
}

/**
 * The route to open for a tapped reminder. A reminder link gets a fresh `tap` value, so a second tap on the
 * same reminder (same `remind`, e.g. the 7:00 and 9:00 reminders of one habit) is a new URL: the router would
 * ignore a navigation to the URL it is already on, and the sheet would stay closed.
 */
export function pushTapRoute(url: unknown, now = Date.now()): string | null {
  const route = pushRoute(url);
  if (!route || !/[?&]remind=/.test(route)) return route;
  const [path, query = ''] = route.split('?');
  const params = new URLSearchParams(query);
  params.set('tap', String(now));
  return `${path}?${params}`;
}

/** Both the ngsw message and push-sw.js's entry can report one tap; open it once. */
export const PUSH_TAP_DEDUPE_MS = 5_000;

/** A tap is acted on only shortly after it happened, never on a later visit. */
export const PUSH_CLICK_MAX_AGE_MS = 120_000;

/** Reads and removes the tap push-sw.js remembered; the url when it is recent. */
export async function takePendingPushClick(
  now = Date.now(),
): Promise<string | null> {
  if (typeof caches === 'undefined') return null;
  try {
    if (!(await caches.has('aio-push-click'))) return null;
    const cache = await caches.open('aio-push-click');
    const response = await cache.match('pending');
    if (!response) return null;
    await cache.delete('pending');
    const { url, at } = (await response.json()) as {
      url?: unknown;
      at?: unknown;
    };
    return typeof url === 'string' &&
      typeof at === 'number' &&
      now - at >= 0 &&
      now - at <= PUSH_CLICK_MAX_AGE_MS
      ? url
      : null;
  } catch {
    return null;
  }
}

@Component({
  imports: [
    AioButton,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioToaster,
    AioTranslate,
    PwaBars,
    RouterLink,
    RouterOutlet,
  ],
  selector: 'customer-root',
  template: `<router-outlet /><customer-pwa-bars
      [language]="english() ? 'en' : 'fa'"
    /><aio-toaster />
    <aio-dialog
      [(open)]="paywall.open"
      [title]="'دسترسی به هوش مصنوعی' | aioTranslate"
    >
      <ng-template aioDialogBody>
        @if (paywall.reason() === 'quota') {
          <p>
            {{
              'سهمیهٔ امروزِ هوش مصنوعی‌ات تمام شد. با یک پلن، سقف روزانه بیشتر است و همین حالا ادامه می‌دهی؛ وگرنه فردا دوباره باز می‌شود.'
                | aioTranslate
            }}
          </p>
        } @else {
          @if (trialEnded(); as ended) {
            <p class="mb-2 font-medium">
              {{
                'دورهٔ آزمایشی هفت‌روزه‌ات در {0} تمام شد.'
                  | aioTranslate: [locale.date(ended, { dateStyle: 'long' })]
              }}
            </p>
          }
          <p>
            {{
              'با فعال کردن یک پلن، می‌توانی از امکانات هوش مصنوعی Poshtetgarm استفاده کنی.'
                | aioTranslate
            }}
          </p>
          @if (canEarn()) {
            <p class="text-muted-foreground mt-2">
              {{
                'با عضویت در تلگرام یا اینستاگرام Poshtetgarm، برای هر کدام یک هفته هوش مصنوعی هدیه بگیر.'
                  | aioTranslate
              }}
            </p>
          }
        }
      </ng-template>
      <ng-template aioDialogActions>
        <button
          aioBtn
          type="button"
          variant="ghost"
          class="min-h-11"
          (click)="paywall.open.set(false)"
        >
          {{ 'فعلاً نه' | aioTranslate }}
        </button>
        <a
          aioBtn
          class="min-h-11"
          routerLink="/billing"
          (click)="paywall.open.set(false)"
        >
          {{ 'دیدن پلن‌ها' | aioTranslate }}
        </a>
      </ng-template>
    </aio-dialog>`,
})
export class App {
  protected readonly locale = inject(AioLocale);
  protected readonly paywall = inject(AiPaywall);

  protected readonly english = this.locale.english;
  private readonly api = inject(API_BASE_URL);
  /** Loaded only when the sheet opens: offers are off until the official channels exist. */
  private readonly offers = httpResource<BillingRewardOffer[]>(() =>
    this.paywall.open() ? `${this.api}/billing/reward-offers` : undefined,
  );
  private readonly access = httpResource<BillingAccessState>(() =>
    this.paywall.open() ? `${this.api}/billing/access` : undefined,
  );
  protected readonly trialEnded = () => {
    if (!this.access.hasValue()) return null;
    const { tier, trialUntil } = this.access.value();
    return tier === 'free' && trialUntil ? trialUntil : null;
  };
  protected readonly canEarn = () =>
    this.offers.hasValue() &&
    this.offers.value().some((offer) => offer.status === 'available');

  constructor() {
    inject(GrowthAnalytics).startClientTracking();
    inject(ReferralCapture).start();
    inject(AioKeyboard).start();
    // The service worker only focuses the open window (navigating first loses the
    // click's focus permission), so the running app routes to the notification here.
    inject(SwPush, { optional: true })
      ?.notificationClicks.pipe(takeUntilDestroyed())
      .subscribe(({ notification }) => {
        void takePendingPushClick();
        void this.openPushTap(
          (notification.data as { url?: unknown } | undefined)?.url,
        );
      });
    this.watchPendingPushClicks();
  }

  private readonly router = inject(Router);
  private lastTap = { url: '', at: 0 };

  /** Routes to a tapped notification, once per tap, after the start-up navigation. */
  private async openPushTap(url: unknown) {
    if (typeof url !== 'string' || !pushRoute(url)) return;
    const now = Date.now();
    if (url === this.lastTap.url && now - this.lastTap.at < PUSH_TAP_DEDUPE_MS)
      return;
    this.lastTap = { url, at: now };
    // A cold start (iOS often restarts a backgrounded PWA) is still running its first navigation, which
    // would replace this one; wait for it.
    if (!this.router.navigated)
      await firstValueFrom(
        this.router.events.pipe(
          filter(
            (e) =>
              e instanceof NavigationEnd ||
              e instanceof NavigationCancel ||
              e instanceof NavigationError,
          ),
        ),
      );
    const route = pushTapRoute(url, now);
    if (route) void this.router.navigateByUrl(route);
  }

  /** iPhone PWAs can miss ngsw's click message; push-sw.js also keeps the tap in a cache. */
  private watchPendingPushClicks() {
    if (typeof document === 'undefined' || !('serviceWorker' in navigator))
      return;
    // Taking the entry also tells push-sw.js the app has the tap, so it does not reload the window.
    const open = async () =>
      void this.openPushTap(await takePendingPushClick());
    const visible = () => {
      if (document.visibilityState === 'visible') void open();
    };
    const message = (event: MessageEvent) => {
      if ((event.data as { type?: unknown } | null)?.type === 'AIO_PUSH_CLICK')
        void open();
    };
    const stop = new AbortController();
    document.addEventListener('visibilitychange', visible, {
      signal: stop.signal,
    });
    window.addEventListener('pageshow', visible, { signal: stop.signal });
    navigator.serviceWorker.addEventListener('message', message, {
      signal: stop.signal,
    });
    inject(DestroyRef).onDestroy(() => stop.abort());
    void open();
  }
}
