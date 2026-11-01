import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AioButton, AioIcon, provideIcons } from '@all-in-one/ui';
import { lucideBookOpenText, lucideLayers, lucideMic } from '@ng-icons/lucide';

/** English applet frame: ambient glass stage and the three main tabs. */
@Component({
  host: { dir: 'ltr', lang: 'en' },
  selector: 'english-learning-shell',
  imports: [AioButton, AioIcon, RouterLink, RouterLinkActive, RouterOutlet],
  providers: [provideIcons({ lucideBookOpenText, lucideLayers, lucideMic })],
  template: `
    <div
      class="applet-english lx-stage mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6 [&>router-outlet]:hidden"
    >
      <header>
        <p class="aio-eyebrow">One step forward, every day</p>
        <h1 class="aio-page-title">English, at your own pace.</h1>
      </header>
      <nav
        class="lx-glass lx-tabs grid grid-cols-3 gap-1"
        aria-label="English sections"
      >
        @for (link of links; track link.path) {
          <a
            aioBtn
            variant="ghost"
            class="aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground aria-[current=page]:hover:bg-primary h-12 gap-2 rounded-2xl hover:bg-white/55"
            [routerLink]="link.path"
            routerLinkActive
            #rla="routerLinkActive"
            [routerLinkActiveOptions]="{ exact: link.exact }"
            [attr.aria-current]="rla.isActive ? 'page' : null"
          >
            <aio-icon [name]="link.icon" size="sm" />
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
    { path: '.', label: 'Cards', icon: 'lucideLayers', exact: true },
    {
      path: 'texts',
      label: 'Reading',
      icon: 'lucideBookOpenText',
      exact: false,
    },
    { path: 'practice', label: 'Exercise', icon: 'lucideMic', exact: false },
  ];
}
