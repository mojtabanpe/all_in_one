import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { InAppNotification } from '@all-in-one/shared/schemas';
import { AioInAppNotifications } from '@all-in-one/ui';
import {
  API_BASE_URL,
  AuthStore,
  PushSettings,
  TelegramOffer,
} from '@all-in-one/web/shared';
import { AiPaywall } from './billing/ai-paywall';
import { Layout } from './layout';
import { PushPrompt } from './prompts/prompt-widgets';
import { Pwa } from './pwa';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';

/** The English day-one push prompt; the server lists it until somebody dismisses it. */
const reminder: InAppNotification = {
  id: 'push-1',
  title: { fa: 'هر شب یادت بیندازیم؟', en: 'Remind you every evening?' },
  message: { fa: 'روی همین دستگاه', en: 'On this device' },
  actions: [],
  widget: { kind: 'push', data: { review: '20:00' } },
};

describe('reminders prompt across an iPhone tab and the installed app', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** One visit of the signed-in shell, without its template: only the prompt queue matters here. */
  async function visit(installed: boolean) {
    TestBed.resetTestingModule();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE);
    vi.stubGlobal('matchMedia', () => ({ matches: installed }));
    TestBed.overrideComponent(Layout, { set: { template: '', imports: [] } });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        AioInAppNotifications,
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: AuthStore, useValue: { user: signal(null) } },
        // An iPhone tab has no PushManager; the installed app does.
        { provide: PushSettings, useValue: { supported: installed } },
        { provide: Pwa, useValue: {} },
        { provide: AiPaywall, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(Layout);
    const http = TestBed.inject(HttpTestingController);
    const queue = fixture.debugElement.injector.get(AioInAppNotifications);
    const settle = async () => {
      for (let turn = 0; turn < 5; turn++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        fixture.detectChanges();
      }
    };
    fixture.detectChanges();
    await settle();
    http.expectOne('/api/in-app-notifications').flush([reminder]);
    await settle();
    const dismissals = () =>
      http.match('/api/in-app-notifications/push-1/dismiss').length;
    return { http, queue, settle, dismissals };
  }

  const telegramFallback = async (tab: Awaited<ReturnType<typeof visit>>) => {
    tab.http
      .expectOne('/api/telegram/status')
      .flush({ available: true, linked: false });
    await tab.settle();
    await vi.waitFor(() =>
      expect(tab.queue.current()?.widget?.component).toBe(TelegramOffer),
    );
  };

  it('keeps the push prompt pending when the Telegram stand-in is dismissed', async () => {
    const tab = await visit(false);
    await telegramFallback(tab);

    tab.queue.dismiss();
    await tab.settle();
    expect(tab.queue.current()).toBeNull();
    expect(tab.dismissals()).toBe(0);

    // The same tab does not ask again.
    const again = await visit(false);
    again.http.expectNone('/api/telegram/status');
    expect(again.queue.current()).toBeNull();
    expect(again.dismissals()).toBe(0);

    // The installed app still gets the push sheet, even with the same local storage.
    const app = await visit(true);
    await vi.waitFor(() =>
      expect(app.queue.current()?.widget?.component).toBe(PushPrompt),
    );
    app.http.expectNone('/api/telegram/status');

    // Dismissing the real push sheet is still permanent.
    app.queue.dismiss();
    expect(app.dismissals()).toBe(1);
  });
});
