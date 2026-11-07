import { Component, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import type {
  BillingAccessState,
  BillingRewardOffer,
} from '@all-in-one/shared/schemas';
import { API_BASE_URL } from '@all-in-one/web/shared';
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
    const router = inject(Router);
    // The service worker only focuses the open window (navigating first loses the
    // click's focus permission), so the running app routes to the notification here.
    inject(SwPush, { optional: true })
      ?.notificationClicks.pipe(takeUntilDestroyed())
      .subscribe(({ notification }) => {
        const route = pushRoute(
          (notification.data as { url?: unknown } | undefined)?.url,
        );
        if (route) void router.navigateByUrl(route);
      });
  }
}
