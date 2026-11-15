import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  AioTranslate,
  AioAppletHeader,
  type AioAppletTab,
  provideIcons,
} from '@all-in-one/ui';
import { lucideReceipt, lucideTrendingUp, lucideTag } from '@ng-icons/lucide';

/** Expenses applet frame: sub-navigation tabs above the routed page. */
@Component({
  selector: 'expenses-shell',
  providers: [
    provideIcons({
      lucideReceipt,
      lucideTrendingUp,
      lucideTag,
    }),
  ],
  imports: [AioAppletHeader, RouterOutlet, AioTranslate],
  template: `
    <div class="applet-expenses lx-stage aio-applet-layout">
      <aio-applet-header
        [title]="'مدیریت مخارج' | aioTranslate"
        [subtitle]="
          'ثبت هوشمند، دسته‌بندی با هوش مصنوعی و تحلیل مالی' | aioTranslate
        "
        [navigationLabel]="'بخش‌های مخارج' | aioTranslate"
        [tabs]="links"
      />
      <router-outlet />
    </div>
  `,
})
export class ExpensesShell {
  protected readonly links: readonly AioAppletTab[] = [
    { path: '.', icon: 'lucideReceipt', label: 'هزینه‌ها', exact: true },
    {
      path: 'report',
      icon: 'lucideTrendingUp',
      label: 'گزارش و تحلیل',
      exact: false,
    },
    {
      path: 'categories',
      icon: 'lucideTag',
      label: 'دسته‌بندی‌ها',
      exact: false,
    },
  ];
}
