import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject } from 'rxjs';
import { AioLocale } from '@all-in-one/ui';
import { NativePush } from './native-push';
import { PushSettings } from './push-settings';

describe('PWA push registration', () => {
  afterEach(() => vi.unstubAllGlobals());
  function setup() {
    const sub = {
      endpoint: 'https://push.example.test/sub',
      toJSON: () => ({
        endpoint: 'https://push.example.test/sub',
        keys: { auth: 'test', p256dh: 'test' },
      }),
    } as PushSubscription;
    const subscription = new BehaviorSubject<PushSubscription | null>(sub);
    const fresh = {
      endpoint: 'https://push.example.test/fresh',
      toJSON: () => ({
        endpoint: 'https://push.example.test/fresh',
        keys: { auth: 'new', p256dh: 'new' },
      }),
    } as PushSubscription;
    const sw = {
      isEnabled: true,
      subscription,
      unsubscribe: vi.fn(async () => {
        subscription.next(null);
      }),
      requestSubscription: vi.fn(async () => {
        subscription.next(fresh);
        return fresh;
      }),
    };
    const language = signal<'fa' | 'en'>('fa');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SwPush, useValue: sw },
        {
          provide: NativePush,
          useValue: { available: signal(false), enabled: signal(false) },
        },
        { provide: AioLocale, useValue: { language } },
      ],
    });
    const service = TestBed.inject(PushSettings);
    const http = TestBed.inject(HttpTestingController);
    return { service, http, language, sw };
  }
  it('waits for authentication and server acceptance before marking the device enabled', async () => {
    const { service, http, language } = setup();
    TestBed.tick();
    http.expectNone('/api/push/subscription');
    service.setUser('u1');
    TestBed.tick();
    expect(service.enabled()).toBe(false);
    const request = http.expectOne('/api/push/subscription');
    expect(request.request.body.language).toBe('fa');
    request.flush({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(service.enabled()).toBe(true);
    language.set('en');
    TestBed.tick();
    const translated = http.expectOne('/api/push/subscription');
    expect(translated.request.body.language).toBe('en');
    translated.flush({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    service.setUser(null);
    TestBed.tick();
    expect(service.enabled()).toBe(false);
    http.verify();
  });
  it('shows registration failure and retries on reconnect instead of silently claiming success', async () => {
    const { service, http } = setup();
    service.setUser('u1');
    TestBed.tick();
    http
      .expectOne('/api/push/subscription')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(service.enabled()).toBe(false);
    await vi.waitFor(() =>
      expect(service.message()).toContain('ارتباط برقرار نشد'),
    );
    window.dispatchEvent(new Event('online'));
    TestBed.tick();
    http.expectOne('/api/push/subscription').flush({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(service.enabled()).toBe(true);
    http.verify();
  });
  it('does not restore enabled state from a response that arrives after logout', async () => {
    const { service, http } = setup();
    service.setUser('u1');
    TestBed.tick();
    const request = http.expectOne('/api/push/subscription');
    service.setUser(null);
    TestBed.tick();
    request.flush({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(service.enabled()).toBe(false);
    http.verify();
  });
  it('replaces the old browser subscription when the user explicitly reconnects', async () => {
    vi.stubGlobal('Notification', {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });
    const { service, http, sw } = setup();
    service.setUser('u1');
    TestBed.tick();
    http.expectOne('/api/push/subscription').flush({ ok: true });
    await vi.waitFor(() => expect(service.enabled()).toBe(true));
    const enabling = service.enable();
    const status = await vi.waitFor(() => http.expectOne('/api/push/status'));
    status.flush({ enabled: true, publicKey: 'new-vapid-key' });
    const removal = await vi.waitFor(() =>
      http.expectOne('/api/push/unsubscribe'),
    );
    expect(removal.request.body.endpoint).toBe('https://push.example.test/sub');
    removal.flush({ ok: true });
    const registration = await vi.waitFor(() =>
      http.expectOne('/api/push/subscription'),
    );
    expect(registration.request.body.endpoint).toBe(
      'https://push.example.test/fresh',
    );
    registration.flush({ ok: true });
    await enabling;
    expect(sw.unsubscribe).toHaveBeenCalledOnce();
    expect(sw.requestSubscription).toHaveBeenCalledWith({
      serverPublicKey: 'new-vapid-key',
    });
    expect(service.enabled()).toBe(true);
    http.verify();
  });
});
