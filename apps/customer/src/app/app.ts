import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { AioToaster, AioLocale } from '@all-in-one/ui';
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
  imports: [AioToaster, PwaBars, RouterOutlet],
  selector: 'customer-root',
  template: `<router-outlet /><customer-pwa-bars
      [language]="english() ? 'en' : 'fa'"
    /><aio-toaster />`,
})
export class App {
  protected readonly locale = inject(AioLocale);

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
