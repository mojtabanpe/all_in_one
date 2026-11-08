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
import { App } from './app';
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
