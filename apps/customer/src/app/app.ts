import { Component, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { AioToaster } from '@all-in-one/ui';
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
  protected readonly english = signal(false);
  constructor() {
    const router = inject(Router);
    const document = inject(DOCUMENT);
    const setLanguage = () => {
      const english = /^\/english(?:[/?#]|$)/.test(router.url);
      this.english.set(english);
      document.documentElement.lang = english ? 'en' : 'fa';
      document.documentElement.dir = english ? 'ltr' : 'rtl';
    };
    setLanguage();
    router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) setLanguage();
    });
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
