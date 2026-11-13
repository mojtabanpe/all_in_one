import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { injectCustomerLinks } from './customer-url';
import {
  AioAppShell,
  AioButton,
  AioTranslate,
  type AioNavItem,
  AioToaster,
  provideIcons,
} from '@all-in-one/ui';
import {
  lucideHouse,
  lucideInfo,
  lucideLayoutGrid,
  lucideSparkles,
} from '@ng-icons/lucide';

/** Public site (no login): same shell, so phones get the floating bottom nav too. */
@Component({
  imports: [
    AioAppShell,
    AioButton,
    AioTranslate,
    AioToaster,
    RouterOutlet,
    RouterLink,
  ],
  providers: [
    provideIcons({ lucideHouse, lucideInfo, lucideLayoutGrid, lucideSparkles }),
  ],
  selector: 'public-root',
  template: `
    <aio-app-shell
      appName="Poshtetgarm"
      [navItems]="nav"
      [navigationQueryParams]="installParams()"
    >
      <router-outlet />

      <footer
        class="mt-12 rounded-2xl border border-border bg-card/80 p-5 sm:p-7"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <img
              src="brand-logo.png"
              alt=""
              width="40"
              height="40"
              class="rounded-xl"
            />
            <bdi dir="ltr" class="text-base font-semibold">Poshtetgarm</bdi>
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <a
              aioBtn
              variant="outline"
              class="min-h-11"
              routerLink="/"
              [queryParams]="installParams()"
              fragment="install"
              >{{ 'نصب اپ' | aioTranslate }}</a
            >
            <a
              aioBtn
              variant="link"
              class="min-h-11 px-2"
              routerLink="/privacy"
              [queryParams]="customerLinks.campaign()"
              >{{ 'حریم خصوصی و داده‌ها' | aioTranslate }}</a
            >
            <a
              aioBtn
              variant="link"
              class="min-h-11 px-2"
              target="_blank"
              rel="noopener"
              href="https://t.me/poshtetgarm"
              [attr.aria-label]="
                'کانال تلگرام Poshtetgarm (در زبانه جدید)' | aioTranslate
              "
              >{{ 'تلگرام' | aioTranslate }}</a
            >
            <a
              aioBtn
              variant="link"
              class="min-h-11 px-2"
              target="_blank"
              rel="noopener"
              href="https://www.instagram.com/poshtetgarm/"
              [attr.aria-label]="
                'صفحهٔ اینستاگرام Poshtetgarm (در زبانه جدید)' | aioTranslate
              "
              >{{ 'اینستاگرام' | aioTranslate }}</a
            >
          </div>
        </div>
      </footer>
    </aio-app-shell>
    <aio-toaster />
  `,
})
export class App {
  protected readonly customerLinks = injectCustomerLinks();
  protected installParams() {
    return { ...this.customerLinks.campaign(), view: 'all' };
  }
  protected readonly nav: readonly AioNavItem[] = [
    { label: 'خانه', icon: 'lucideHouse', link: '/', exact: true },
    { label: 'اپلت‌ها', icon: 'lucideLayoutGrid', link: '/applets' },
    { label: 'درباره', icon: 'lucideInfo', link: '/about' },
  ];
}
