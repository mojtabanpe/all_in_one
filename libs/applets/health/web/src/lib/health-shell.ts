import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AioButton } from '@all-in-one/ui';

/** Health applet frame: section links (fitness, nutrition, profile) above the routed page. */
@Component({
  selector: 'health-shell',
  imports: [AioButton, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="flex flex-col gap-4">
      <header>
        <h1 class="text-2xl font-bold">سلامت</h1>
        <p class="text-muted-foreground text-sm">
          بدن سالم با ورزش و تغذیه درست.
        </p>
      </header>
      <nav
        class="glass flex gap-1 overflow-x-auto rounded-2xl p-1.5"
        aria-label="بخش‌های سلامت"
      >
        @for (link of links; track link.path) {
          <a
            aioBtn
            variant="ghost"
            size="sm"
            class="data-[active=true]:bg-primary/12 data-[active=true]:text-primary flex-1"
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
    { path: '.', label: 'خلاصه', exact: true },
    { path: 'fitness', label: 'ورزش', exact: false },
    { path: 'nutrition', label: 'تغذیه', exact: false },
    { path: 'profile', label: 'مشخصات', exact: false },
  ];
}
