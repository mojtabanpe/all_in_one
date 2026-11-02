import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  AioTranslate,
  AioAppletHeader,
  type AioAppletTab,
  provideIcons,
} from '@all-in-one/ui';

import {
  lucideSun,
  lucideUtensils,
  lucideDumbbell,
  lucideUserRound,
} from '@ng-icons/lucide';

/** Health applet frame: section links (today, fitness, nutrition, profile) above the routed page. */
@Component({
  selector: 'health-shell',
  providers: [
    provideIcons({
      lucideSun,
      lucideUtensils,
      lucideDumbbell,
      lucideUserRound,
    }),
  ],
  imports: [AioAppletHeader, RouterOutlet, AioTranslate],
  template: `
    <div class="applet-health health-calm lx-stage aio-applet-layout">
      <aio-applet-header
        [title]="'سلامت من' | aioTranslate"
        [subtitle]="'با یک قدم کوچک، حال بهتر' | aioTranslate"
        [navigationLabel]="'بخش‌های سلامت' | aioTranslate"
        [tabs]="links"
      />
      <router-outlet />
    </div>
  `,
})
export class HealthShell {
  protected readonly links: readonly AioAppletTab[] = [
    { path: '.', icon: 'lucideSun', label: 'امروز', exact: true },
    { path: 'nutrition', icon: 'lucideUtensils', label: 'تغذیه', exact: false },
    { path: 'fitness', icon: 'lucideDumbbell', label: 'ورزش', exact: false },
    { path: 'profile', icon: 'lucideUserRound', label: 'مشخصات', exact: false },
  ];
}
