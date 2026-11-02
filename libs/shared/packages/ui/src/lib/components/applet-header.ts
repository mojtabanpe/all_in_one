import { AioTranslate } from '../locale';
import { AioLocale } from '../locale';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AioButton } from '../spartan';
import { AioIcon } from './icon';

export interface AioAppletTab {
  path: string;
  label: string;
  /** Register this icon with provideIcons in the containing applet. */
  icon: string;
  exact?: boolean;
}

/** Shared applet heading and route navigation, composed from Spartan wrappers. */
@Component({
  selector: 'aio-applet-header',
  host: {
    '[attr.lang]': 'activeLanguage()',
    '[attr.dir]': 'activeLanguage() === "en" ? "ltr" : "rtl"',
  },
  imports: [AioButton, AioIcon, RouterLink, RouterLinkActive, AioTranslate],
  template: `
    <header class="applet-heading">
      <h1 class="applet-title">{{ title() | aioTranslate }}</h1>
      <p class="applet-subtitle">{{ subtitle() | aioTranslate }}</p>
    </header>
    <nav
      class="applet-tabs"
      [attr.aria-label]="navigationLabel() | aioTranslate"
    >
      @for (tab of tabs(); track tab.path) {
        <a
          aioBtn
          variant="ghost"
          class="applet-tab"
          [routerLink]="tab.path"
          routerLinkActive
          #rla="routerLinkActive"
          [routerLinkActiveOptions]="{ exact: tab.exact ?? false }"
          [attr.aria-current]="rla.isActive ? 'page' : null"
        >
          <aio-icon [name]="tab.icon" size="sm" />
          <span>{{ tab.label | aioTranslate }}</span>
        </a>
      }
    </nav>
  `,
  styles: `
    :host {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 1.25rem;
      font-family: var(--font-sans);
    }
    .applet-heading {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-block-size: 7.25rem;
    }
    .applet-title {
      margin: 0;
      font-family: inherit;
      font-size: clamp(1.65rem, 4vw, 2.25rem);
      font-weight: 750;
      line-height: 1.65;
      letter-spacing: -0.025em;
      overflow-wrap: anywhere;
      min-block-size: 1lh;
    }
    .applet-subtitle {
      margin: 0;
      color: var(--muted-foreground);
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1.75;
    }
    .applet-tabs {
      /* Tabs size to their labels, so a long one (Countdowns) borrows space
         from short ones instead of breaking mid-word. */
      display: flex;
      gap: 0.25rem;
      padding: 0.25rem;
      border: 1px solid var(--border);
      border-radius: 1rem;
      background: color-mix(in oklch, var(--card) 75%, transparent);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }
    .applet-tabs .applet-tab {
      display: flex;
      flex: 1 1 auto;
      min-width: 0;
      min-height: 3rem;
      height: auto;
      flex-direction: column;
      justify-content: center;
      gap: 0.25rem;
      padding: 0.375rem 0.25rem;
      border-radius: 0.75rem;
      color: var(--muted-foreground);
      font-family: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      line-height: 1.5;
      white-space: nowrap;
      text-align: center;
    }
    .applet-tab span {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .applet-tabs .applet-tab[aria-current='page'] {
      color: var(--primary-foreground);
      background: var(--primary);
    }
    @media (min-width: 390px) {
      .applet-heading {
        min-block-size: 5.5rem;
      }
    }
    @media (min-width: 640px) {
      .applet-tabs .applet-tab {
        flex-direction: row;
        gap: 0.5rem;
        font-size: 0.875rem;
      }
    }
    @media (prefers-reduced-transparency: reduce) {
      .applet-tabs {
        background: var(--card);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
    }
  `,
})
export class AioAppletHeader {
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly navigationLabel = input.required<string>();
  readonly tabs = input.required<readonly AioAppletTab[]>();
  private readonly locale = inject(AioLocale);
  readonly language = input<'fa' | 'en'>();
  readonly activeLanguage = computed(
    () => this.language() ?? this.locale.language(),
  );
}
