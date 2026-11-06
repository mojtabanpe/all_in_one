import { AioTranslate } from '../locale';
import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { AioIcon } from './icon';

export interface AioNavItem {
  label: string;
  /** ng-icons name, e.g. `lucideHouse`; register it with `provideIcons`. */
  icon: string;
  link: string;
  /** Match the route exactly (use for the home item). */
  exact?: boolean;
}

/**
 * Floating bottom navigation for phones (directive 6).
 * Approved custom component (2026-10-29): built from spartan `hlmBtn` links in
 * a glass container; hidden from `md` up, where `aio-app-shell` shows the
 * spartan sidebar instead.
 */
@Component({
  selector: 'aio-bottom-nav',
  imports: [AioIcon, HlmButton, RouterLink, RouterLinkActive, AioTranslate],
  template: `
    <!-- Fade under the floating nav: content scrolling below it (and behind
         iOS Safari's translucent toolbar) is hidden instead of showing through. -->
    <div class="aio-bottom-scrim md:hidden" aria-hidden="true"></div>
    <nav
      [attr.aria-label]="label() | aioTranslate"
      class="aio-bottom-navigation glass fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-stretch gap-1 rounded-[1.375rem] p-1.5 md:hidden"
    >
      @for (item of items(); track item.link) {
        <a
          hlmBtn
          variant="ghost"
          [routerLink]="item.link"
          [queryParams]="navigationQueryParams()"
          routerLinkActive
          #rla="routerLinkActive"
          [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
          [attr.aria-current]="rla.isActive ? 'page' : null"
          [attr.data-active]="rla.isActive"
          class="text-muted-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground h-auto min-h-12 flex-1 flex-col gap-0.5 rounded-xl px-1 py-1.5 text-[0.6875rem] font-medium"
        >
          <aio-icon [name]="item.icon" />
          <span>{{ item.label | aioTranslate }}</span>
        </a>
      }
    </nav>
  `,
})
export class AioBottomNav {
  readonly items = input.required<readonly AioNavItem[]>();
  readonly label = input('ناوبری اصلی');
  readonly navigationQueryParams = input<Readonly<Record<string, string>>>();
}
