import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  AioAlertDirectives,
  AioButton,
  AioIcon,
  AioToaster,
  AioTranslate,
  provideIcons,
} from '@all-in-one/ui';
import { AppVersionState } from '@all-in-one/web/shared';
import { lucideRefreshCw } from '@ng-icons/lucide';

@Component({
  imports: [
    AioAlertDirectives,
    AioButton,
    AioIcon,
    AioToaster,
    AioTranslate,
    RouterOutlet,
  ],
  providers: [provideIcons({ lucideRefreshCw })],
  selector: 'admin-root',
  template: `<router-outlet />
    @if (version.updateAvailable()) {
      <div
        class="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
      >
        <div
          aioAlert
          class="glass pointer-events-auto w-full max-w-md"
          role="status"
        >
          <aio-icon name="lucideRefreshCw" size="sm" />
          <h2 aioAlertTitle>{{ 'نسخه تازه آماده است' | aioTranslate }}</h2>
          <div aioAlertDescription class="mt-2 flex gap-2">
            <button aioBtn size="sm" (click)="version.reload()">
              {{ 'بارگذاری دوباره' | aioTranslate }}
            </button>
            <button
              aioBtn
              size="sm"
              variant="ghost"
              (click)="version.dismiss()"
            >
              {{ 'بعداً' | aioTranslate }}
            </button>
          </div>
        </div>
      </div>
    }
    <aio-toaster />`,
})
export class App {
  protected readonly version = inject(AppVersionState);
}
