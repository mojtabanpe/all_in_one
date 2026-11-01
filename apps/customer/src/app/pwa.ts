import { DOCUMENT } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  inject,
  Injectable,
  input,
  signal,
} from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import {
  AioAlertDirectives,
  AioButton,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioIcon,
  provideIcons,
} from '@all-in-one/ui';
import {
  lucideDownload,
  lucideRefreshCw,
  lucideWifiOff,
} from '@ng-icons/lucide';

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
  readonly installed = signal(false);
  readonly manualInstall = signal<'ios' | 'safari' | null>(null);
  readonly installGuideOpen = signal(false);
  readonly installAvailable = computed(
    () =>
      !this.installed() && (this.canInstall() || this.manualInstall() !== null),
  );

  constructor() {
    const win = this.document.defaultView;
    if (!win) return;
    const displayMode = win.matchMedia?.('(display-mode: standalone)');
    const navigator = win.navigator as Navigator & { standalone?: boolean };
    const syncInstalled = () => {
      this.installed.set(
        displayMode?.matches === true || navigator.standalone === true,
      );
    };
    syncInstalled();
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const safari =
      /Safari/.test(navigator.userAgent) &&
      !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android/.test(navigator.userAgent);
    this.manualInstall.set(ios ? 'ios' : safari ? 'safari' : null);
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
    if (displayMode) listen(displayMode, 'change', syncInstalled);
    listen(win, 'beforeinstallprompt', (event) => {
      if (this.installed()) return;
      event.preventDefault();
      this.installEvent = event as InstallPromptEvent;
      this.canInstall.set(true);
    });
    listen(win, 'appinstalled', () => {
      this.installed.set(true);
      this.installGuideOpen.set(false);
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
    if (this.installed()) return;
    const event = this.installEvent;
    if (!event) {
      this.installGuideOpen.set(true);
      return;
    }
    this.installEvent = null;
    this.canInstall.set(false);
    await event.prompt().catch(() => this.installGuideOpen.set(true));
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
  imports: [
    AioAlertDirectives,
    AioButton,
    AioIcon,
    AioDialog,
    AioDialogBody,
    AioDialogActions,
  ],
  providers: [provideIcons({ lucideDownload, lucideRefreshCw, lucideWifiOff })],
  template: `
    @if (pwa.offline() || pwa.updateReady() || pwa.broken() || showInstall()) {
      <div
        class="pointer-events-none fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        @if (
          showInstall() && !pwa.offline() && !pwa.updateReady() && !pwa.broken()
        ) {
          <div aioAlert class="glass pointer-events-auto w-full max-w-md">
            <aio-icon name="lucideDownload" size="sm" />
            <h2 aioAlertTitle>
              {{
                copy('پشتت گرم روی دستگاه شما', 'Poshtetgarm on your device')
              }}
            </h2>
            <div aioAlertDescription>
              <p>
                {{
                  copy(
                    'برنامه را نصب کنید و از صفحهٔ اصلی باز کنید.',
                    'Install the app and open it from your home screen.'
                  )
                }}
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <button aioBtn class="min-h-11" (click)="pwa.install()">
                  {{
                    pwa.canInstall()
                      ? copy('نصب برنامه', 'Install app')
                      : copy('راهنمای نصب', 'Installation guide')
                  }}
                </button>
                <button
                  aioBtn
                  variant="ghost"
                  class="min-h-11"
                  (click)="installDismissed.set(true)"
                >
                  {{ copy('فعلاً نه', 'Not now') }}
                </button>
              </div>
            </div>
          </div>
        }
        @if (pwa.offline()) {
          <div
            aioAlert
            class="glass pointer-events-auto w-full max-w-md"
            role="status"
          >
            <aio-icon name="lucideWifiOff" size="sm" />
            <h2 aioAlertTitle>
              {{ copy('اینترنت قطع است', 'You are offline') }}
            </h2>
            <p aioAlertDescription>
              {{
                copy(
                  'تغییرات به اینترنت نیاز دارند. پس از وصل شدن دوباره تلاش کنید.',
                  'Changes need an internet connection. Try again when you are online.'
                )
              }}
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
                  ? copy(
                      'این نسخه باید دوباره بارگذاری شود',
                      'Please reload this version'
                    )
                  : copy('نسخه تازه آماده است', 'An update is ready')
              }}
            </h2>
            <div aioAlertDescription class="mt-2 flex gap-2">
              <button aioBtn size="sm" (click)="pwa.reload()">
                {{ copy('بارگذاری دوباره', 'Reload') }}
              </button>
              @if (!pwa.broken()) {
                <button
                  aioBtn
                  size="sm"
                  variant="ghost"
                  (click)="pwa.dismissUpdate()"
                >
                  {{ copy('بعداً', 'Later') }}
                </button>
              }
            </div>
          </div>
        }
      </div>
    }
    <aio-dialog
      [(open)]="pwa.installGuideOpen"
      [title]="copy('نصب پشتت گرم', 'Install Poshtetgarm')"
      [language]="language()"
    >
      <ng-template aioDialogBody>
        <ol class="list-inside list-decimal space-y-3 text-sm leading-7">
          @if (pwa.manualInstall() === 'ios') {
            <li>
              {{
                copy(
                  'این صفحه را در Safari باز کنید.',
                  'Open this page in Safari.'
                )
              }}
            </li>
            <li>
              {{
                copy('دکمهٔ اشتراک‌گذاری (Share) را بزنید.', 'Select Share.')
              }}
            </li>
            <li>
              {{
                copy(
                  '«افزودن به صفحهٔ اصلی» (Add to Home Screen) و سپس «افزودن» (Add) را انتخاب کنید.',
                  'Select Add to Home Screen, then Add.'
                )
              }}
            </li>
          } @else if (pwa.manualInstall() === 'safari') {
            <li>
              {{
                copy(
                  'در Safari منوی File را باز کنید.',
                  'Open the File menu in Safari.'
                )
              }}
            </li>
            <li>
              {{
                copy(
                  'گزینهٔ Add to Dock را انتخاب کنید و Add را بزنید.',
                  'Select Add to Dock, then Add.'
                )
              }}
            </li>
          } @else {
            <li>
              {{
                copy(
                  'این صفحه را در Chrome یا Edge باز کنید.',
                  'Open this page in Chrome or Edge.'
                )
              }}
            </li>
            <li>
              {{
                copy(
                  'از منوی مرورگر، گزینهٔ «نصب برنامه» یا «افزودن به صفحهٔ اصلی» را انتخاب کنید.',
                  'In the browser menu, choose Install app or Add to Home Screen.'
                )
              }}
            </li>
          }
        </ol>
      </ng-template>
      <ng-template aioDialogActions>
        <button
          aioBtn
          class="min-h-11"
          (click)="pwa.installGuideOpen.set(false)"
        >
          {{ copy('متوجه شدم', 'Got it') }}
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class PwaBars {
  readonly language = input<'fa' | 'en'>('fa');
  protected copy(fa: string, en: string): string {
    return this.language() === 'en' ? en : fa;
  }
  protected readonly pwa = inject(Pwa);
  protected readonly installDismissed = signal(false);
  protected readonly showInstall = computed(
    () => this.pwa.installAvailable() && !this.installDismissed(),
  );
}
