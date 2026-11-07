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
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-base-url';
import {
  RESTART_RETRY_DELAYS,
  restartRetryInterceptor,
} from './restart-retry.interceptor';

describe('restartRetryInterceptor', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([restartRetryInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });
    return {
      http: TestBed.inject(HttpClient),
      backend: TestBed.inject(HttpTestingController),
    };
  }
  const down = { status: 502, statusText: 'Bad Gateway' };
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('retries a read while the server restarts, then answers', async () => {
    const { http, backend } = setup();
    const answer = firstValueFrom(http.get<{ ok: boolean }>('/api/tasks'));
    backend.expectOne('/api/tasks').flush(null, down);
    await vi.advanceTimersByTimeAsync(RESTART_RETRY_DELAYS[0]);
    backend.expectOne('/api/tasks').error(new ProgressEvent('error'));
    await vi.advanceTimersByTimeAsync(RESTART_RETRY_DELAYS[1]);
    backend.expectOne('/api/tasks').flush({ ok: true });
    await expect(answer).resolves.toEqual({ ok: true });
    backend.verify();
  });

  it('gives up after the last retry', async () => {
    const { http, backend } = setup();
    const answer = firstValueFrom(http.get('/api/tasks'));
    answer.catch(() => undefined);
    for (const wait of [0, ...RESTART_RETRY_DELAYS]) {
      await vi.advanceTimersByTimeAsync(wait);
      backend.expectOne('/api/tasks').flush(null, down);
    }
    await expect(answer).rejects.toMatchObject({ status: 502 });
    backend.verify();
  });

  it('never repeats a write, an ordinary error or a request outside the api', async () => {
    const { http, backend } = setup();
    const write = firstValueFrom(http.post('/api/tasks', {}));
    write.catch(() => undefined);
    backend.expectOne('/api/tasks').flush(null, down);
    await expect(write).rejects.toMatchObject({ status: 502 });

    const missing = firstValueFrom(http.get('/api/tasks/1'));
    missing.catch(() => undefined);
    backend
      .expectOne('/api/tasks/1')
      .flush(null, { status: 404, statusText: 'Not Found' });
    await expect(missing).rejects.toMatchObject({ status: 404 });

    const outside = firstValueFrom(http.get('/assets/x.json'));
    outside.catch(() => undefined);
    backend.expectOne('/assets/x.json').flush(null, down);
    await expect(outside).rejects.toMatchObject({ status: 502 });

    await vi.advanceTimersByTimeAsync(5_000);
    backend.verify();
  });
});
