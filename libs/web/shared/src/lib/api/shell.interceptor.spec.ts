import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SHELL_HEADER } from '@all-in-one/shared/schemas';
import { SHELL_MARKERS, shellInterceptor } from './shell.interceptor';

function setup(markers: string) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([shellInterceptor])),
      provideHttpClientTesting(),
      { provide: SHELL_MARKERS, useValue: markers },
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('shellInterceptor', () => {
  it('sends the store and version markers with API requests', () => {
    const { http, backend } = setup(
      'PoshtetgarmApp/1.0.7 PoshtetgarmStore/bazaar',
    );
    http.get('/api/in-app-notifications').subscribe();
    const req = backend.expectOne('/api/in-app-notifications');
    expect(req.request.headers.get(SHELL_HEADER)).toBe(
      'PoshtetgarmApp/1.0.7 PoshtetgarmStore/bazaar',
    );
    req.flush([]);
    backend.verify();
  });

  it('adds nothing in a browser or for other hosts', () => {
    const { http, backend } = setup('PoshtetgarmStore/myket');
    http.get('https://example.com/data').subscribe();
    expect(
      backend
        .expectOne('https://example.com/data')
        .request.headers.has(SHELL_HEADER),
    ).toBe(false);
    backend.verify();
    TestBed.resetTestingModule();
    const browser = setup('');
    browser.http.get('/api/auth/me').subscribe();
    expect(
      browser.backend
        .expectOne('/api/auth/me')
        .request.headers.has(SHELL_HEADER),
    ).toBe(false);
    browser.backend.verify();
  });
});
