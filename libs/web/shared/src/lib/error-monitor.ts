import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  DestroyRef,
  ErrorHandler,
  inject,
  Injectable,
  InjectionToken,
  makeEnvironmentProviders,
  PLATFORM_ID,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
} from '@angular/core';
import { AioNotifications } from '@all-in-one/ui';
import type { ClientError } from '@all-in-one/shared/schemas';
import { API_BASE_URL } from './api/api-base-url';
import { detectGrowthClient } from './growth-client';
import { APP_VERSION } from './release-version';

export type MonitoredApp = ClientError['app'];

const MONITORED_APP = new InjectionToken<MonitoredApp>('MONITORED_APP');
const QUEUE = 'aio_error_queue';
const MAX_QUEUE = 20;
const MAX_PER_MINUTE = 5;
const CHUNK_FAILURE =
  /Loading chunk [\w-]+ failed|ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;
/** Browser noise with nothing to fix. */
const IGNORED = /ResizeObserver loop|Script error\.?$/i;

export function isChunkFailure(message: string): boolean {
  return CHUNK_FAILURE.test(message);
}

/** The text an error carries, whatever was thrown (an Error, a string, a rejected value). */
function describe(error: unknown): { message: string; stack?: string } {
  const e = (error as { rejection?: unknown })?.rejection ?? error;
  if (e instanceof Error)
    return { message: `${e.name}: ${e.message}`, stack: e.stack };
  if (typeof e === 'string') return { message: e };
  try {
    return { message: JSON.stringify(e) ?? String(e) };
  } catch {
    return { message: String(e) };
  }
}

/**
 * Reports unhandled errors to the api (`POST /api/monitor/errors`), which forwards them to GlitchTip.
 * Reports wait in localStorage while the device is offline (a failed chunk usually means a bad connection) and
 * go out when it is back. A chunk failure also tells the person to try again instead of leaving a dead screen.
 * Nothing but the error, the route path, the app version and the client kind is sent.
 */
@Injectable()
export class ErrorMonitor extends ErrorHandler {
  private readonly document = inject(DOCUMENT);
  private readonly api = inject(API_BASE_URL);
  private readonly notify = inject(AioNotifications);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly app = inject(MONITORED_APP);
  private readonly opened = Date.now();
  private readonly seen = new Map<string, number>();
  private windowStart = 0;
  private inWindow = 0;
  private lastChunkToast = 0;
  private flushing = false;

  constructor() {
    super();
    if (!this.browser) return;
    const win = this.document.defaultView;
    if (!win) return;
    const controller = new AbortController();
    inject(DestroyRef).onDestroy(() => controller.abort());
    win.addEventListener('online', () => void this.flush(), {
      signal: controller.signal,
    });
    void this.flush();
  }

  override handleError(error: unknown): void {
    super.handleError(error);
    if (!this.browser || error instanceof HttpErrorResponse) return;
    const { message, stack } = describe(error);
    if (IGNORED.test(message)) return;
    const chunk = isChunkFailure(message);
    if (chunk) this.offerReload();
    if (this.throttled(message)) return;
    this.enqueue({
      app: this.app,
      kind: chunk ? 'chunk' : 'error',
      message: message.slice(0, 500),
      ...(stack ? { stack: stack.slice(0, 6000) } : {}),
      path: (this.document.defaultView?.location.pathname ?? '/').slice(0, 200),
      version: APP_VERSION,
      client: this.client(),
      online: this.document.defaultView?.navigator.onLine !== false,
      age: Math.round((Date.now() - this.opened) / 1000),
    });
    void this.flush();
  }

  private client() {
    const win = this.document.defaultView;
    if (!win) return 'unknown_app' as const;
    const bridge = win as Window & {
      NativePushChannel?: unknown;
      PoshtetgarmNative?: unknown;
    };
    return detectGrowthClient({
      userAgent: win.navigator.userAgent,
      nativeBridge: !!(bridge.NativePushChannel || bridge.PoshtetgarmNative),
      standalone:
        win.matchMedia?.('(display-mode: standalone)').matches === true ||
        (win.navigator as Navigator & { standalone?: boolean }).standalone ===
          true,
    });
  }

  /** The same message within a minute, or more than a few a minute, is one problem: send it once. */
  private throttled(message: string): boolean {
    const now = Date.now();
    const last = this.seen.get(message);
    if (last !== undefined && now - last < 60_000) return true;
    this.seen.set(message, now);
    if (this.seen.size > 50) this.seen.delete(this.seen.keys().next().value!);
    if (now - this.windowStart > 60_000) {
      this.windowStart = now;
      this.inWindow = 0;
    }
    return ++this.inWindow > MAX_PER_MINUTE;
  }

  private offerReload(): void {
    const now = Date.now();
    if (now - this.lastChunkToast < 30_000) return;
    this.lastChunkToast = now;
    this.notify.action(
      'بخشی از برنامه بارگیری نشد. اتصال را بررسی کن.',
      'تلاش دوباره',
      () => this.document.defaultView?.location.reload(),
    );
  }

  private read(): ClientError[] {
    try {
      const raw = this.document.defaultView?.localStorage.getItem(QUEUE);
      const list: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? (list as ClientError[]) : [];
    } catch {
      return [];
    }
  }

  private write(list: ClientError[]): void {
    try {
      const storage = this.document.defaultView?.localStorage;
      if (list.length) storage?.setItem(QUEUE, JSON.stringify(list));
      else storage?.removeItem(QUEUE);
    } catch {
      // Storage is off (private window): reports are sent now or lost.
    }
  }

  private enqueue(error: ClientError): void {
    this.write([...this.read(), error].slice(-MAX_QUEUE));
  }

  private async flush(): Promise<void> {
    const win = this.document.defaultView;
    if (this.flushing || !win || win.navigator.onLine === false) return;
    const batch = this.read().slice(0, MAX_QUEUE);
    if (!batch.length) return;
    this.flushing = true;
    try {
      const response = await fetch(`${this.api}/monitor/errors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ errors: batch }),
        keepalive: true,
      });
      // A 4xx means the reports themselves are bad: drop them rather than retry forever.
      if (response.ok || response.status < 500) {
        this.write(this.read().slice(batch.length));
      }
    } catch {
      // Still offline or the server is restarting: they stay queued for the next try.
    } finally {
      this.flushing = false;
    }
  }
}

/** `providers: [provideErrorMonitor('customer')]` in an app's config. */
export function provideErrorMonitor(app: MonitoredApp): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: MONITORED_APP, useValue: app },
    { provide: ErrorHandler, useClass: ErrorMonitor },
    // Construct it at start so queued reports from an earlier offline session go out.
    provideEnvironmentInitializer(() => void inject(ErrorHandler)),
  ]);
}
