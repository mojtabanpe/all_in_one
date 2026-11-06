import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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
  imports: [AioAppShell, AioButton, AioTranslate, AioToaster, RouterOutlet],
  providers: [
    provideIcons({ lucideHouse, lucideInfo, lucideLayoutGrid, lucideSparkles }),
  ],
  selector: 'public-root',
  template: `
    <aio-app-shell
      appName="Poshtetgarm"
      [navItems]="nav"
      [navigationQueryParams]="customerLinks.campaign()"
    >
      <router-outlet />

      <footer
        class="mt-12 flex flex-wrap items-center justify-between gap-6 border-t border-border py-8"
      >
        <div class="flex flex-col gap-2">
          <bdi dir="ltr" class="font-semibold">Poshtetgarm</bdi>
          <p class="text-sm text-muted-foreground">
            {{ 'نماد اعتماد الکترونیکی' | aioTranslate }}
          </p>
        </div>
        <a
          aioBtn
          variant="ghost"
          class="h-auto shrink-0"
          referrerpolicy="origin"
          target="_blank"
          rel="noopener"
          href="https://trustseal.enamad.ir/?id=8559991&Code=fx45IyoDfirdQiX27wcCauu2mXGEzE67"
          [attr.aria-label]="
            'مشاهده اعتبار اینماد (در زبانه جدید)' | aioTranslate
          "
        >
          <img
            referrerpolicy="origin"
            src="https://trustseal.enamad.ir/logo.aspx?id=8559991&Code=fx45IyoDfirdQiX27wcCauu2mXGEzE67"
            [alt]="'نماد اعتماد الکترونیکی Poshtetgarm' | aioTranslate"
            width="125"
            height="136"
            class="object-contain"
            code="fx45IyoDfirdQiX27wcCauu2mXGEzE67"
          />
        </a>
      </footer>
    </aio-app-shell>
    <aio-toaster />
  `,
})
export class App {
  protected readonly customerLinks = injectCustomerLinks();
  protected readonly nav: readonly AioNavItem[] = [
    { label: 'خانه', icon: 'lucideHouse', link: '/', exact: true },
    { label: 'اپلت‌ها', icon: 'lucideLayoutGrid', link: '/applets' },
    { label: 'درباره', icon: 'lucideInfo', link: '/about' },
  ];
}
