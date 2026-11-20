import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { ONBOARDING_COMPLETED_HEADER } from '@all-in-one/shared/schemas';
import { AioNotifications } from '@all-in-one/ui';
import { API_BASE_URL, GrowthAnalytics } from '@all-in-one/web/shared';
import {
  App,
  PUSH_CLICK_MAX_AGE_MS,
  pushTapRoute,
  takePendingPushClick,
} from './app';
import { AiPaywall, aiPaywallInterceptor } from './billing/ai-paywall';
import { onboardingFeedbackInterceptor } from './onboarding-feedback';

describe('App', () => {
  // jsdom has no matchMedia; the spartan sonner toaster queries it after render.
  beforeEach(() => {
    if (typeof window.matchMedia === 'function') return;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  });

  it('renders the router outlet and the toaster', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideServiceWorker('ngsw-worker.js', { enabled: false }),
      ],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('aio-toaster')).not.toBeNull();
  });

  it('counts the shared upgrade prompt once while it is open', () => {
    const track = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([aiPaywallInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: GrowthAnalytics, useValue: { track } },
      ],
    });
    const client = TestBed.inject(HttpClient);
    const http = TestBed.inject(HttpTestingController);
    const paywall = TestBed.inject(AiPaywall);
    const fail = (url: string, status: number) => {
      client.get(url).subscribe({ error: () => undefined });
      http.expectOne(url).flush(null, { status, statusText: 'Rejected' });
    };
    fail('https://other.example/ai', 402);
    fail('/api/ai/status', 403);
    expect(paywall.open()).toBe(false);
    expect(track).not.toHaveBeenCalled();

    fail('/api/ai/status', 402);
    fail('/api/ai/status', 402);
    expect(paywall.open()).toBe(true);
    expect(track.mock.calls).toEqual([['paywall_viewed']]);

    paywall.open.set(false);
    fail('/api/ai/status', 402);
    expect(track).toHaveBeenCalledTimes(2);
    expect(paywall.reason()).toBe('plan');

    // A used-up daily limit opens it only when a plan would raise it (trial, earned weeks).
    paywall.open.set(false);
    const quota = (upgrade: boolean) => {
      client.post('/api/assistant', {}).subscribe({ error: () => undefined });
      http
        .expectOne('/api/assistant')
        .flush(
          { code: 'AI_QUOTA_REACHED', kind: 'chat', upgrade },
          { status: 429, statusText: 'Too Many Requests' },
        );
    };
    quota(false);
    expect(paywall.open()).toBe(false);
    quota(true);
    expect(paywall.open()).toBe(true);
    expect(paywall.reason()).toBe('quota');
    http.verify();
  });

  it('shows first-step feedback only for a matching successful API response', () => {
    const success = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([onboardingFeedbackInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: AioNotifications, useValue: { success } },
      ],
    });
    const client = TestBed.inject(HttpClient);
    const http = TestBed.inject(HttpTestingController);
    const headers = { [ONBOARDING_COMPLETED_HEADER]: '1' };
    const path = '/api/planner/tasks';
    client.post(path, {}).subscribe();
    http.expectOne(path).flush({});
    client.post(path, {}).subscribe({ error: () => undefined });
    http
      .expectOne(path)
      .flush(null, { headers, status: 500, statusText: 'Error' });
    expect(success).not.toHaveBeenCalled();

    client.post(path, {}).subscribe();
    http.expectOne(path).flush({}, { headers });
    expect(success).toHaveBeenCalledOnce();
    http.verify();
  });
});

describe('takePendingPushClick', () => {
  function fakeCaches(entry: unknown) {
    const store = new Map<string, Response>();
    if (entry) store.set('pending', new Response(JSON.stringify(entry)));
    const cache = {
      match: async (key: string) => store.get(key),
      delete: async (key: string) => store.delete(key),
    };
    vi.stubGlobal('caches', {
      has: async () => true,
      open: async () => cache,
    });
    return store;
  }
  afterEach(() => vi.unstubAllGlobals());

  it('returns a recent tap once and removes it', async () => {
    const store = fakeCaches({ url: '/app/planner/habits?remind=x', at: 1000 });
    expect(await takePendingPushClick(1500)).toBe(
      '/app/planner/habits?remind=x',
    );
    expect(store.size).toBe(0);
    expect(await takePendingPushClick(1600)).toBeNull();
  });

  it('ignores a tap from an earlier visit', async () => {
    const store = fakeCaches({ url: '/app/planner', at: 0 });
    expect(await takePendingPushClick(PUSH_CLICK_MAX_AGE_MS + 1)).toBeNull();
    expect(store.size).toBe(0);
  });
});

describe('pushTapRoute', () => {
  it('makes each reminder tap a new url, so the same reminder reopens its sheet', () => {
    const url = `/app/planner/habits?remind=${encodeURIComponent('habit:h1:2026-11-20')}`;
    const first = pushTapRoute(url, 1);
    const second = pushTapRoute(url, 2);
    expect(first).toBe('/planner/habits?remind=habit%3Ah1%3A2026-11-20&tap=1');
    expect(second).not.toBe(first);
    expect(new URLSearchParams(second!.split('?')[1]).get('remind')).toBe(
      'habit:h1:2026-11-20',
    );
  });

  it('leaves other app links alone and refuses foreign ones', () => {
    expect(pushTapRoute('/app/english', 1)).toBe('/english');
    expect(pushTapRoute('https://evil.example/app/x', 1)).toBeNull();
    expect(pushTapRoute('//evil.example/app/x', 1)).toBeNull();
  });
});
