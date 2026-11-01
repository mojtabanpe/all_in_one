import { Component, input } from '@angular/core';
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
    '[attr.lang]': 'language()',
    '[attr.dir]': 'language() === "en" ? "ltr" : "rtl"',
  },
  imports: [AioButton, AioIcon, RouterLink, RouterLinkActive],
  template: `
    <header class="applet-heading">
      <h1 class="applet-title">{{ title() }}</h1>
      <p class="applet-subtitle">{{ subtitle() }}</p>
    </header>
    <nav class="applet-tabs" [attr.aria-label]="navigationLabel()">
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
          <span>{{ tab.label }}</span>
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
    }
    .applet-title {
      margin: 0;
      font-family: inherit;
      font-size: clamp(1.65rem, 4vw, 2.25rem);
      font-weight: 750;
      line-height: 1.65;
      letter-spacing: -0.025em;
      overflow-wrap: anywhere;
    }
    .applet-subtitle {
      margin: 0;
      color: var(--muted-foreground);
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1.75;
    }
    .applet-tabs {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(0, 1fr);
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
      white-space: normal;
      text-align: center;
      overflow-wrap: anywhere;
    }
    .applet-tabs .applet-tab[aria-current='page'] {
      color: var(--primary-foreground);
      background: var(--primary);
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
  readonly language = input<'fa' | 'en'>('fa');
}
