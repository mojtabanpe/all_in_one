import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  afterNextRender,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { AioLocale } from '@all-in-one/ui';
import {
  extractGrowthCampaign,
  growthAttributionSchema,
  type GrowthAttribution,
  type GrowthEventInput,
} from '@all-in-one/shared/schemas';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api/api-base-url';
import { detectGrowthClient } from './growth-client';

const CONSENT = 'aio_growth_preference';
const VISITOR = 'aio_growth_visitor';
const MAX_AGE = 90 * 86_400;
type Choice = 'unknown' | 'granted' | 'denied';

@Injectable({ providedIn: 'root' })
export class GrowthAnalytics {
  private readonly document = inject(DOCUMENT);
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private readonly locale = inject(AioLocale);
  private readonly sent = new Set<string>();
  private readonly clientSent = new Set<string>();
  private trackClients = false;
  readonly choice = signal<Choice>('unknown');
  readonly ready = signal(false);

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      this.refresh();
      this.ready.set(true);
      void this.observeClient();
      const onFocus = () => {
        this.refresh();
        void this.observeClient();
      };
      const win = this.document.defaultView;
      for (const event of [
        'focus',
        'online',
        'poshtetgarm-native-ready',
        'poshtetgarm-push-token',
        'appinstalled',
      ]) {
        win?.addEventListener(event, onFocus);
        destroy.onDestroy(() => win?.removeEventListener(event, onFocus));
      }
      const displayMode = win?.matchMedia?.('(display-mode: standalone)');
      displayMode?.addEventListener('change', onFocus);
      destroy.onDestroy(() =>
        displayMode?.removeEventListener('change', onFocus),
      );
      const onVisible = () => {
        if (this.document.visibilityState === 'visible') onFocus();
      };
      this.document.addEventListener('visibilitychange', onVisible);
      destroy.onDestroy(() =>
        this.document.removeEventListener('visibilitychange', onVisible),
      );
    });
  }

  private read(name: string): string | undefined {
    try {
      return this.document.cookie
        .split('; ')
        .find((part) => part.startsWith(`${name}=`))
        ?.slice(name.length + 1);
    } catch {
      return undefined;
    }
  }

  private write(name: string, value: string, age = MAX_AGE): void {
    try {
      this.document.cookie = `${name}=${value}; Path=/; Max-Age=${age}; SameSite=Lax${this.document.location?.protocol === 'https:' ? '; Secure' : ''}`;
    } catch {
      /* Blocked cookies mean analytics stays off. */
    }
  }

  private refresh(): void {
    const value = this.read(CONSENT) ?? this.read('aio_growth_consent');
    this.choice.set(value === 'denied' ? 'denied' : 'granted');
    if (value === 'denied') this.write(VISITOR, '', 0);
  }

  choose(choice: 'granted' | 'denied'): void {
    this.write(CONSENT, choice);
    this.sent.clear();
    this.clientSent.clear();
    this.refresh();
    void this.observeClient();
  }

  /** Called only by the customer app; public/admin visits are not customer usage. */
  startClientTracking(): void {
    this.trackClients = true;
    void this.observeClient();
  }

  private async observeClient(): Promise<void> {
    if (!this.trackClients) return;
    const context = this.context();
    const win = this.document.defaultView;
    if (!context || !win) return;
    const bridge = win as Window & { NativePushChannel?: unknown };
    const client = detectGrowthClient({
      userAgent: win.navigator.userAgent,
      // Raw channel is installed before the first page load, even with push off.
      nativeBridge: !!(bridge.NativePushChannel || bridge.PoshtetgarmNative),
      standalone:
        win.matchMedia?.('(display-mode: standalone)').matches === true ||
        (win.navigator as Navigator & { standalone?: boolean }).standalone ===
          true,
    });
    const key = `${context.visitorId}:${client}:${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' })}`;
    if (this.clientSent.has(key)) return;
    this.clientSent.add(key);
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/growth/client-visits`, {
          visitorId: context.visitorId,
          client,
        }),
      );
    } catch {
      this.clientSent.delete(key);
    }
  }

  campaign() {
    return extractGrowthCampaign(
      new URLSearchParams(this.document.location.search),
    );
  }

  context(): GrowthAttribution | undefined {
    if (!this.ready()) return;
    this.refresh();
    if (this.choice() !== 'granted') return;
    // Cookies may be blocked: do not send an event without a persisted random ID.
    let visitorId = this.read(VISITOR);
    if (!visitorId || !/^[0-9a-f-]{36}$/i.test(visitorId)) {
      visitorId = this.document.defaultView?.crypto.randomUUID();
      if (!visitorId) return;
      this.write(VISITOR, visitorId);
      if (this.read(VISITOR) !== visitorId) return;
    }
    const campaign = this.campaign();
    const event = growthAttributionSchema.safeParse({
      visitorId,
      language: this.locale.language(),
      campaign,
    });
    return event.success ? event.data : undefined;
  }

  async track(name: GrowthEventInput['name']): Promise<void> {
    const context = this.context();
    if (!context) return;
    const key = `${context.visitorId}:${name}:${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' })}`;
    if (this.sent.has(key)) return;
    this.sent.add(key);
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/growth/events`, { ...context, name }),
      );
    } catch {
      this.sent.delete(key); // Analytics failure must never interrupt registration.
    }
  }
}
