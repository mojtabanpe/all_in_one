import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AioNotifications } from '@all-in-one/ui';
import { API_BASE_URL } from '@all-in-one/web/shared';
import { FocusTimer } from './focus-page';

describe('FocusTimer notification deadlines', () => {
  let timer: FocusTimer;
  let http: HttpTestingController;
  const base = '/api/push/focus-timers';
  const errors = { error: vi.fn() };
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: AioNotifications, useValue: errors },
      ],
    });
    timer = TestBed.inject(FocusTimer);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.clearAllTimers();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });
  async function start(id = 'one') {
    const promise = timer.start();
    const req = http.expectOne(base);
    const ms = req.request.body.remainingMs;
    req.flush({ id, dueAt: new Date(Date.now() + ms).toISOString() });
    await promise;
    return ms;
  }
  it('defaults to 30 minutes and schedules custom whole-minute durations', async () => {
    expect(timer.minutes()).toBe(30);
    timer.minutes.set(17);
    expect(await start()).toBe(17 * 60_000);
    expect(timer.remaining()).toBe(17 * 60_000);
  });
  it('cancels on pause and schedules only the remaining time on resume', async () => {
    timer.minutes.set(1);
    await start();
    vi.advanceTimersByTime(20_000);
    const pause = timer.pause();
    http.expectOne(`${base}/one`).flush({ ok: true });
    await pause;
    vi.advanceTimersByTime(30_000);
    expect(await start('two')).toBe(40_000);
    const reset = timer.reset();
    http.expectOne(`${base}/two`).flush({ ok: true });
    await reset;
    expect(timer.started()).toBe(false);
  });
  it('finishes once at the deadline without cancelling its server push', async () => {
    timer.minutes.set(1);
    timer.onFinish = vi.fn();
    await start();
    vi.advanceTimersByTime(90_000);
    expect(timer.onFinish).toHaveBeenCalledTimes(1);
    expect(timer.elapsed()).toBe(60_000);
    expect(timer.running()).toBe(false);
    http.expectNone(`${base}/one`);
  });
  it('does not start if scheduling fails and leaves the timer running if cancellation fails', async () => {
    const failed = timer.start();
    http.expectOne(base).flush({}, { status: 503, statusText: 'Unavailable' });
    await failed;
    expect(timer.started()).toBe(false);
    await start();
    const pause = timer.pause();
    http
      .expectOne(`${base}/one`)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(await pause).toBe(false);
    expect(timer.running()).toBe(true);
  });
  it('never schedules a push for the stopwatch or an invalid duration', async () => {
    timer.minutes.set(0);
    await timer.start();
    expect(timer.started()).toBe(false);
    timer.minutes.set(30);
    timer.kind.set('STOPWATCH');
    await timer.start();
    expect(timer.running()).toBe(true);
    http.expectNone(base);
  });
});
