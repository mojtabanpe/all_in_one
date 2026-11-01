import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AioButton } from '@all-in-one/ui';

/** Health applet frame: section links (today, fitness, nutrition, profile) above the routed page. */
@Component({
  selector: 'health-shell',
  imports: [AioButton, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div
      class="applet-health health-calm lx-stage flex min-w-0 flex-col gap-6 [&>router-outlet]:hidden"
    >
      <header>
        <p class="aio-eyebrow">با یک قدم کوچک، حال بهتر</p>
        <h1 class="text-2xl font-bold">سلامت من</h1>
      </header>
      <nav
        class="health-tabs grid grid-cols-4 gap-1"
        aria-label="بخش‌های سلامت"
      >
        @for (link of links; track link.path) {
          <a
            aioBtn
            variant="ghost"
            class="h-11 rounded-xl"
            [routerLink]="link.path"
            routerLinkActive
            #rla="routerLinkActive"
            [routerLinkActiveOptions]="{ exact: link.exact }"
            [attr.data-active]="rla.isActive"
            [attr.aria-current]="rla.isActive ? 'page' : null"
          >
            {{ link.label }}
          </a>
        }
      </nav>
      <router-outlet />
    </div>
  `,
})
export class HealthShell {
  protected readonly links = [
    { path: '.', label: 'امروز', exact: true },
    { path: 'nutrition', label: 'تغذیه', exact: false },
    { path: 'fitness', label: 'ورزش', exact: false },
    { path: 'profile', label: 'مشخصات', exact: false },
  ];
}
