import { Component, inject } from '@angular/core';
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
        <p>
          {{
            'با فعال کردن یک پلن، می‌توانی از امکانات هوش مصنوعی Poshtetgarm استفاده کنی.'
              | aioTranslate
          }}
        </p>
      </ng-template>
      <ng-template aioDialogActions>
        <button
          aioBtn
          type="button"
          variant="outline"
          (click)="paywall.open.set(false)"
        >
          {{ 'فعلاً نه' | aioTranslate }}
        </button>
        <a aioBtn routerLink="/billing" (click)="paywall.open.set(false)">
          {{ 'دیدن پلن‌ها' | aioTranslate }}
        </a>
      </ng-template>
    </aio-dialog>`,
})
export class App {
  protected readonly locale = inject(AioLocale);
  protected readonly paywall = inject(AiPaywall);

  protected readonly english = this.locale.english;
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
