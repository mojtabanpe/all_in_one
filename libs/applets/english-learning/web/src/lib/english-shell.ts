import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  AioTranslate,
  AioAppletHeader,
  type AioAppletTab,
  provideIcons,
} from '@all-in-one/ui';
import { lucideBookOpenText, lucideLayers, lucideMic } from '@ng-icons/lucide';

/** English applet frame: ambient glass stage and the three main tabs. */
@Component({
  selector: 'english-learning-shell',
  imports: [AioAppletHeader, RouterOutlet, AioTranslate],
  providers: [provideIcons({ lucideBookOpenText, lucideLayers, lucideMic })],
  template: `
    <div class="applet-english lx-stage aio-applet-layout">
      <aio-applet-header
        [title]="'English, at your own pace.' | aioTranslate"
        [subtitle]="'One step forward, every day' | aioTranslate"
        [navigationLabel]="'English sections' | aioTranslate"
        [tabs]="links"
      />
      <router-outlet />
    </div>
  `,
})
export class EnglishShell {
  protected readonly links: readonly AioAppletTab[] = [
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
