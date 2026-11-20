import { DOCUMENT } from '@angular/common';
import {
  HttpClient,
  HttpHeaders,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_VERSION_HEADER } from '@all-in-one/shared/schemas';
import { API_BASE_URL } from './api-base-url';
import {
  APP_VERSION_TOKEN,
  AppVersionState,
  appVersionInterceptor,
  RELOAD_COOLDOWN_MS,
} from './app-version.interceptor';

describe('appVersionInterceptor', () => {
  function setup(currentVersion = '0.1.5') {
    const store = new Map<string, string>();
    const reload = vi.fn();
    const sessionStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: APP_VERSION_TOKEN, useValue: currentVersion },
        {
          provide: DOCUMENT,
          useValue: {
            defaultView: { sessionStorage },
            location: { reload },
          },
        },
        provideHttpClient(withInterceptors([appVersionInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    return {
      http: TestBed.inject(HttpClient),
      controller: TestBed.inject(HttpTestingController),
      state: TestBed.inject(AppVersionState),
      reload,
    };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });

  it('sets updateAvailable when the API returns a newer SemVer header', () => {
    const { http, controller, state } = setup('0.1.9');
    http.get('/api/health').subscribe();
    controller
      .expectOne('/api/health')
      .flush(
        { ok: true },
        { headers: new HttpHeaders({ [APP_VERSION_HEADER]: '0.1.10' }) },
      );
    expect(state.updateAvailable()).toBe(true);
  });

  it('ignores equal, older, missing, or malformed version headers', () => {
    const { http, controller, state } = setup('0.1.10');
    for (const headers of [
      new HttpHeaders({ [APP_VERSION_HEADER]: '0.1.10' }),
      new HttpHeaders({ [APP_VERSION_HEADER]: '0.1.9' }),
      new HttpHeaders({ [APP_VERSION_HEADER]: 'not-a-version' }),
      new HttpHeaders(),
    ]) {
      http.get('/api/health').subscribe();
      controller.expectOne('/api/health').flush({ ok: true }, { headers });
      expect(state.updateAvailable()).toBe(false);
    }
  });

  it('also reads the version header from API error responses', () => {
    const { http, controller, state } = setup('0.1.5');
    http.get('/api/me').subscribe({ error: () => undefined });
    controller.expectOne('/api/me').flush(
      { message: 'Unauthorized' },
      {
        status: 401,
        statusText: 'Unauthorized',
        headers: new HttpHeaders({ [APP_VERSION_HEADER]: '0.1.6' }),
      },
    );
    expect(state.updateAvailable()).toBe(true);
  });

  it('keeps the notice dismissed for the same version until a newer one arrives', () => {
    const { http, controller, state } = setup('0.1.5');
    http.get('/api/a').subscribe();
    controller
      .expectOne('/api/a')
      .flush(
        {},
        { headers: new HttpHeaders({ [APP_VERSION_HEADER]: '0.1.6' }) },
      );
    expect(state.updateAvailable()).toBe(true);
    state.dismiss();
    expect(state.updateAvailable()).toBe(false);

    http.get('/api/b').subscribe();
    controller
      .expectOne('/api/b')
      .flush(
        {},
        { headers: new HttpHeaders({ [APP_VERSION_HEADER]: '0.1.6' }) },
      );
    expect(state.updateAvailable()).toBe(false);

    http.get('/api/c').subscribe();
    controller
      .expectOne('/api/c')
      .flush(
        {},
        { headers: new HttpHeaders({ [APP_VERSION_HEADER]: '0.1.7' }) },
      );
    expect(state.updateAvailable()).toBe(true);
  });

  it('prevents reloading more than once per minute', () => {
    const { state, reload } = setup('0.1.5');
    expect(state.reload(100_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(state.reload(100_000 + RELOAD_COOLDOWN_MS - 1)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(state.reload(100_000 + RELOAD_COOLDOWN_MS)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
