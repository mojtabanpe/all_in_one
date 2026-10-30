import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import {
  AioAlertDirectives,
  AioButton,
  AioIcon,
  provideIcons,
} from '@all-in-one/ui';
import { lucideRefreshCw, lucideWifiOff } from '@ng-icons/lucide';

/** The non-standard event Chromium fires when the app can be installed. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

const UPDATE_CHECK_MS = 30 * 60 * 1000;

/** Service-worker updates, the install prompt and connectivity (from Recall). */
@Injectable({ providedIn: 'root' })
export class Pwa {
  private readonly updates = inject(SwUpdate);
  private readonly document = inject(DOCUMENT);
  private installEvent: InstallPromptEvent | null = null;

  /** A new version is downloaded and used after a reload. */
  readonly updateReady = signal(false);
  /** The cached version is broken (files evicted); only a reload helps. */
  readonly broken = signal(false);
  readonly canInstall = signal(false);
  readonly offline = signal(false);

  constructor() {
    const win = this.document.defaultView;
    if (!win) return;
    this.offline.set(!win.navigator.onLine);
    const destroy = inject(DestroyRef);
    const listen = (
      target: EventTarget,
      type: string,
      handler: (event: Event) => void,
    ) => {
      target.addEventListener(type, handler);
      destroy.onDestroy(() => target.removeEventListener(type, handler));
    };
    listen(win, 'online', () => this.offline.set(false));
    listen(win, 'offline', () => this.offline.set(true));
    listen(win, 'beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installEvent = event as InstallPromptEvent;
      this.canInstall.set(true);
    });
    listen(win, 'appinstalled', () => {
      this.installEvent = null;
      this.canInstall.set(false);
    });
    if (!this.updates.isEnabled) return;
    const ready = this.updates.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') this.updateReady.set(true);
    });
    const broken = this.updates.unrecoverable.subscribe(() =>
      this.broken.set(true),
    );
    destroy.onDestroy(() => {
      ready.unsubscribe();
      broken.unsubscribe();
    });
    const check = () => {
      if (!this.offline()) this.updates.checkForUpdate().catch(() => undefined);
    };
    const timer = win.setInterval(check, UPDATE_CHECK_MS);
    destroy.onDestroy(() => win.clearInterval(timer));
    listen(this.document, 'visibilitychange', () => {
      if (this.document.visibilityState === 'visible') check();
    });
  }

  async install() {
    const event = this.installEvent;
    if (!event) return;
    this.installEvent = null;
    this.canInstall.set(false);
    await event.prompt();
  }

  async reload() {
    if (this.updateReady() && this.updates.isEnabled)
      await this.updates.activateUpdate().catch(() => undefined);
    this.document.location.reload();
  }

  dismissUpdate() {
    this.updateReady.set(false);
  }
}

/** Offline notice and "new version" bar, floating above the bottom navigation. */
@Component({
  selector: 'customer-pwa-bars',
  imports: [AioAlertDirectives, AioButton, AioIcon],
  providers: [provideIcons({ lucideRefreshCw, lucideWifiOff })],
  template: `
    @if (pwa.offline() || pwa.updateReady() || pwa.broken()) {
      <div
        class="pointer-events-none fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        @if (pwa.offline()) {
          <div
            aioAlert
            class="glass pointer-events-auto w-full max-w-md"
            role="status"
          >
            <aio-icon name="lucideWifiOff" size="sm" />
            <h2 aioAlertTitle>اینترنت قطع است</h2>
            <p aioAlertDescription>
              صفحه‌های باز کار می‌کنند؛ ذخیره کردن بعد از وصل شدن.
            </p>
          </div>
        }
        @if (pwa.updateReady() || pwa.broken()) {
          <div
            aioAlert
            class="glass pointer-events-auto w-full max-w-md"
            role="status"
          >
            <aio-icon name="lucideRefreshCw" size="sm" />
            <h2 aioAlertTitle>
              {{
                pwa.broken()
                  ? 'این نسخه باید دوباره بارگذاری شود'
                  : 'نسخه تازه آماده است'
              }}
            </h2>
            <div aioAlertDescription class="mt-2 flex gap-2">
              <button aioBtn size="sm" (click)="pwa.reload()">
                بارگذاری دوباره
              </button>
              @if (!pwa.broken()) {
                <button
                  aioBtn
                  size="sm"
                  variant="ghost"
                  (click)="pwa.dismissUpdate()"
                >
                  بعداً
                </button>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class PwaBars {
  protected readonly pwa = inject(Pwa);
}
