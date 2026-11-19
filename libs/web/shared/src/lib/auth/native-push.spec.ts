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
import { AioLocale } from '@all-in-one/ui';
import { firstValueFrom } from 'rxjs';
import { localScheduleInterceptor, NativePush } from './native-push';

describe('localScheduleInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let changed: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([localScheduleInterceptor])),
        provideHttpClientTesting(),
        { provide: AioLocale, useValue: { language: () => 'fa' } },
      ],
    });
    changed = vi.fn();
    vi.spyOn(TestBed.inject(NativePush), 'changed').mockImplementation(changed);
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });
  afterEach(() => backend.verify());

  it('resyncs the device after a saved change to the planner, focus or reminders', async () => {
    for (const [method, url] of [
      ['POST', '/api/planner/tasks'],
      ['DELETE', '/api/push/focus-timers/x'],
      ['PUT', '/api/push/review-settings'],
    ] as const) {
      const done = firstValueFrom(http.request(method, url, { body: {} }));
      backend.expectOne(url).flush({});
      await done;
    }
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('ignores reads, other sections and failed requests', async () => {
    const read = firstValueFrom(http.get('/api/planner/tasks'));
    backend.expectOne('/api/planner/tasks').flush([]);
    await read;
    const other = firstValueFrom(http.post('/api/health/meals', {}));
    backend.expectOne('/api/health/meals').flush({});
    await other;
    const failed = firstValueFrom(http.post('/api/planner/tasks', {})).catch(
      () => undefined,
    );
    backend
      .expectOne('/api/planner/tasks')
      .flush({}, { status: 500, statusText: 'Error' });
    await failed;
    expect(changed).not.toHaveBeenCalled();
  });
});
