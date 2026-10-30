import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AioButton } from '@all-in-one/ui';

/** English applet frame for the three main tabs: cards, reading, practice. */
@Component({
  selector: 'english-learning-shell',
  imports: [AioButton, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div
      class="applet-english mx-auto flex w-full max-w-3xl flex-col gap-6 [&>router-outlet]:hidden"
    >
      <header>
        <p class="aio-eyebrow">هر روز، یک قدم جلوتر</p>
        <h1 class="aio-page-title">زبان، به ریتم خودت.</h1>
      </header>
      <nav
        class="aio-applet-tabs grid grid-cols-3 gap-1 rounded-2xl p-1"
        aria-label="بخش‌های انگلیسی"
      >
        @for (link of links; track link.path) {
          <a
            aioBtn
            variant="ghost"
            class="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground h-11 rounded-xl"
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
export class EnglishShell {
  protected readonly links = [
    { path: '.', label: 'کارت‌ها', exact: true },
    { path: 'texts', label: 'خواندن', exact: false },
    { path: 'practice', label: 'تمرین', exact: false },
  ];
}
