import { Component, DestroyRef, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import type {
  BillingAccessState,
  BillingRewardOffer,
} from '@all-in-one/shared/schemas';
import { API_BASE_URL, GrowthAnalytics } from '@all-in-one/web/shared';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import {
  AioButton,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioToaster,
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
    const router = inject(Router);
    // The service worker only focuses the open window (navigating first loses the
    // click's focus permission), so the running app routes to the notification here.
    inject(SwPush, { optional: true })
      ?.notificationClicks.pipe(takeUntilDestroyed())
      .subscribe(({ notification }) => {
        void takePendingPushClick();
        const route = pushRoute(
          (notification.data as { url?: unknown } | undefined)?.url,
        );
        if (route) void router.navigateByUrl(route);
      });
    this.watchPendingPushClicks(router);
  }

  /** iPhone PWAs can miss ngsw's click message; push-sw.js also keeps the tap in a cache. */
  private watchPendingPushClicks(router: Router) {
    if (typeof document === 'undefined' || !('serviceWorker' in navigator))
      return;
    const open = async () => {
      const route = pushRoute(await takePendingPushClick());
      if (route) void router.navigateByUrl(route);
    };
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
