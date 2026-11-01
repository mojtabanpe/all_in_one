import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
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
  imports: [AioAppletHeader, RouterOutlet],
  template: `
    <div
      class="applet-health health-calm lx-stage flex min-w-0 flex-col gap-6 [&>router-outlet]:hidden"
    >
      <aio-applet-header
        title="سلامت من"
        subtitle="با یک قدم کوچک، حال بهتر"
        navigationLabel="بخش‌های سلامت"
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
