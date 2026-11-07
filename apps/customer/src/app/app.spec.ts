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
import { API_BASE_URL, GrowthAnalytics } from '@all-in-one/web/shared';
import { App } from './app';
import { AiPaywall, aiPaywallInterceptor } from './billing/ai-paywall';

describe('App', () => {
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
});
