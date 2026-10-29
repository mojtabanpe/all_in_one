import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HlmSidebarImports } from '@spartan-ng/helm/sidebar';
import { AioBottomNav, type AioNavItem } from './bottom-nav';
import { AioConfirmHost } from './dialog';
import { AioIcon } from './icon';

/**
 * App layout: spartan sidebar (start side, floating, collapsible to icons) on
 * tablets/desktop, floating bottom nav on phones, plus the confirmation host.
 * Put `<aio-toaster />` once in the app root (toasts also show outside the shell). Project page content; project header actions with
 * `aioShellActions`.
 */
@Component({
  selector: 'aio-app-shell',
  imports: [
    AioBottomNav,
    AioConfirmHost,
    AioIcon,
    HlmSidebarImports,
    RouterLink,
    RouterLinkActive,
  ],
  template: `
    <div hlmSidebarWrapper>
      <hlm-sidebar side="right" variant="floating" collapsible="icon">
        <div hlmSidebarHeader class="px-3 py-4">
          <a routerLink="/" class="flex items-center gap-2 font-bold">
            <aio-icon [name]="brandIcon()" class="text-primary" />
            <span class="group-data-[collapsible=icon]:hidden">{{
              appName()
            }}</span>
          </a>
        </div>
        <div hlmSidebarContent>
          <div hlmSidebarGroup>
            <ul hlmSidebarMenu>
              @for (item of navItems(); track item.link) {
                <li hlmSidebarMenuItem>
                  <a
                    hlmSidebarMenuButton
                    [routerLink]="item.link"
                    routerLinkActive
                    #rla="routerLinkActive"
                    [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
                    [isActive]="rla.isActive"
                    [attr.aria-current]="rla.isActive ? 'page' : null"
                  >
                    <aio-icon [name]="item.icon" size="sm" />
                    <span>{{ item.label }}</span>
                  </a>
                </li>
              }
            </ul>
          </div>
        </div>
      </hlm-sidebar>

      <main hlmSidebarInset class="bg-transparent">
        <header class="flex items-center gap-2 px-4 pt-4 md:px-6">
          <!-- spartan's trigger component renders its own icon and sr-only label -->
          <!-- eslint-disable-next-line @angular-eslint/template/elements-content -->
          <button
            hlmSidebarTrigger
            srOnlyText="باز و بسته کردن منو"
            class="hidden md:inline-flex"
          ></button>
          <span class="text-lg font-bold md:hidden">{{ appName() }}</span>
          <div class="ms-auto flex items-center gap-2">
            <ng-content select="[aioShellActions]" />
          </div>
        </header>
        <div
          class="mx-auto w-full max-w-5xl px-4 pt-4 pb-[var(--bottom-nav-space)] md:px-6 md:pb-8"
        >
          <ng-content />
        </div>
      </main>
    </div>

    <aio-bottom-nav [items]="navItems()" />
    <aio-confirm-host />
  `,
})
export class AioAppShell {
  readonly appName = input.required<string>();
  readonly brandIcon = input('lucideSparkles');
  readonly navItems = input.required<readonly AioNavItem[]>();
}
