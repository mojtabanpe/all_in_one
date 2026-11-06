import { DOCUMENT } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AioLocale } from '@all-in-one/ui';
import { GrowthAnalytics } from './growth-analytics';

describe('Optional acquisition analytics', () => {
  let service: GrowthAnalytics;
  let http: HttpTestingController;
  let document: Document;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AioLocale, useValue: { language: () => 'en' } },
      ],
    });
    document = TestBed.inject(DOCUMENT);
    for (const key of [
      'aio_growth_consent',
      'aio_growth_preference',
      'aio_growth_visitor',
    ])
      document.cookie = `${key}=; Path=/; Max-Age=0`;
    service = TestBed.inject(GrowthAnalytics);
    http = TestBed.inject(HttpTestingController);
    service.ready.set(true);
  });
  afterEach(() => {
    http.verify();
    service.choose('denied');
    document.cookie = 'aio_growth_preference=; Path=/; Max-Age=0';
  });

  it('makes no request or ID after opting out', async () => {
    service.choose('denied');
    await service.track('signup_started');
    http.expectNone('/api/growth/events');
    expect(document.cookie).not.toContain('aio_growth_visitor=');
  });

  it('records automatically with only the allowlisted body and suppresses repeated sends', async () => {
    const pending = service.track('landing_view');
    const req = http.expectOne('/api/growth/events');
    expect(Object.keys(req.request.body).sort()).toEqual([
      'campaign',
      'language',
      'name',
      'visitorId',
    ]);
    expect(req.request.body).toMatchObject({
      language: 'en',
      name: 'landing_view',
    });
    expect(req.request.body.visitorId).toMatch(/^[a-f0-9-]{36}$/);
    req.flush(null);
    await pending;
    await service.track('landing_view');
    http.expectNone('/api/growth/events');
  });

  it('revoking consent deletes the ID and prevents subsequent events', async () => {
    service.choose('granted');
    const pending = service.track('landing_view');
    http.expectOne('/api/growth/events').flush(null);
    await pending;
    service.choose('denied');
    await service.track('signup_started');
    expect(document.cookie).not.toContain('aio_growth_visitor=');
    http.expectNone('/api/growth/events');
  });

  it('does not trust stale tab state when another page revokes permission', async () => {
    service.choose('granted');
    document.cookie = 'aio_growth_preference=denied; Path=/';
    await service.track('landing_view');
    expect(service.choice()).toBe('denied');
    http.expectNone('/api/growth/events');
  });
});
