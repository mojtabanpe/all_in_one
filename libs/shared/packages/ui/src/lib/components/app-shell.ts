import { Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { HlmSidebarImports, HlmSidebarService } from '@spartan-ng/helm/sidebar';
import { AioBottomNav, type AioNavItem } from './bottom-nav';
import { AioConfirmHost } from './dialog';
import { AioIcon } from './icon';

/**
 * App layout: spartan sidebar (start side, floating, fully closable: the header
 * button or Ctrl/⌘+B; the choice is kept in a cookie) on
 * tablets/desktop, floating bottom nav on phones, plus the confirmation host.
 * Put `<aio-toaster />` once in the app root (toasts also show outside the shell). Project page content; project header actions with
 * `aioShellActions`.
 */
@Component({
  host: {
    '[attr.dir]': 'language() === "en" ? "ltr" : "rtl"',
    '[attr.lang]': 'language()',
  },
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
    <div hlmSidebarWrapper dir="rtl">
      <hlm-sidebar
        side="right"
        [attr.dir]="language() === 'en' ? 'ltr' : 'rtl'"
        variant="floating"
        collapsible="offcanvas"
      >
        <div hlmSidebarHeader class="flex-row items-center px-4 py-7">
          <a routerLink="/" class="flex flex-1 items-center gap-2 font-bold">
            <img
              [src]="logoSrc()"
              width="36"
              height="36"
              alt=""
              class="size-9 shrink-0 rounded-xl"
            />
            <bdi dir="ltr">{{ appName() }}</bdi>
          </a>
          <!-- eslint-disable-next-line @angular-eslint/template/elements-content -->
          <button
            hlmSidebarTrigger
            [srOnlyText]="language() === 'en' ? 'Close menu' : 'بستن منو'"
            class="text-muted-foreground size-11"
          ></button>
        </div>
        <div hlmSidebarContent class="aio-workspace-nav px-2">
          <p class="aio-sidebar-caption px-4 pb-3">
            {{ language() === 'en' ? 'Your workspace' : 'فضای شخصی شما' }}
          </p>
          <div hlmSidebarGroup>
            <ul hlmSidebarMenu class="gap-2">
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

      <main
        hlmSidebarInset
        class="min-w-0 bg-transparent"
        [attr.dir]="language() === 'en' ? 'ltr' : 'rtl'"
      >
        <header class="aio-app-header flex items-center gap-2 px-5 md:px-8">
          <!-- spartan's trigger component renders its own icon and sr-only label -->
          @if (collapsed()) {
            <!-- eslint-disable-next-line @angular-eslint/template/elements-content -->
            <button
              hlmSidebarTrigger
              [srOnlyText]="language() === 'en' ? 'Open menu' : 'باز کردن منو'"
              class="hidden size-11 md:inline-flex"
            ></button>
          }
          <a
            routerLink="/"
            class="flex min-h-11 min-w-0 shrink-0 items-center gap-2 text-base font-bold"
            [attr.aria-label]="appName()"
          >
            <img
              [src]="logoSrc()"
              width="32"
              height="32"
              alt=""
              class="size-8 shrink-0 rounded-lg"
            />
            <bdi dir="ltr" class="hidden min-[390px]:inline">{{
              appName()
            }}</bdi>
          </a>
          <div class="ms-auto flex min-w-0 items-center gap-1 sm:gap-2">
            <ng-content select="[aioShellActions]" />
          </div>
        </header>
        <div
          class="mx-auto w-full max-w-6xl px-5 pt-7 pb-[var(--bottom-nav-space)] md:px-8 md:pt-10 md:pb-12"
        >
          <ng-content />
        </div>
      </main>
    </div>

    <aio-bottom-nav
      [items]="navItems()"
      [label]="language() === 'en' ? 'Main navigation' : 'ناوبری اصلی'"
    />
    <aio-confirm-host />
  `,
})
export class AioAppShell {
  private readonly sidebar = inject(HlmSidebarService);
  /** Desktop sidebar closed: the header shows the name and the open button. */
  protected readonly collapsed = computed(
    () => this.sidebar.state() === 'collapsed',
  );
  readonly appName = input.required<string>();
  readonly language = input<'fa' | 'en'>('fa');
  readonly logoSrc = input('brand-logo.png');
  readonly navItems = input.required<readonly AioNavItem[]>();
}
