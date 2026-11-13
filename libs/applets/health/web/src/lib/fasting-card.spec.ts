import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Fast, FastingState } from '@all-in-one/applets/health/contracts';
import { AioConfirm, AioNotifications } from '@all-in-one/ui';
import { FastingCard } from './fasting-card';
import { fromLocalInput, toLocalInput } from './time-format';

const HOUR = 3_600_000;
const END = '/api/health/fasting/end';

type Card = {
  openEnd(): void;
  setEndDate(value: string): void;
  setEndTime(value: string): void;
  saveEnd(): Promise<void>;
};

describe('fasting card end time', () => {
  let http: HttpTestingController;

  const running = (): Fast => ({
    id: 'f1',
    startedAt: new Date(Date.now() - 6 * HOUR).toISOString(),
    endedAt: null,
    targetHours: 16,
  });

  async function setup(state: FastingState) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AioConfirm,
          useValue: { ask: vi.fn().mockResolvedValue(false) },
        },
        {
          provide: AioNotifications,
          useValue: { action: vi.fn(), success: vi.fn(), error: vi.fn() },
        },
      ],
    });
    const fixture = TestBed.createComponent(FastingCard);
    fixture.detectChanges();
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/health/fasting').flush(state);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http?.verify());

  it('ends the running fast at the chosen time', async () => {
    const fast = running();
    const fixture = await setup({ active: fast, recent: [] });
    const card = fixture.componentInstance as unknown as Card;
    const chosen = toLocalInput(new Date(Date.now() - 2 * HOUR));

    card.openEnd();
    card.setEndDate(chosen.slice(0, 10));
    card.setEndTime(chosen.slice(11, 16));
    const done = card.saveEnd();

    const request = http.expectOne(END);
    expect(request.request.body).toEqual({
      endedAt: fromLocalInput(chosen)?.toISOString(),
    });
    request.flush({
      active: null,
      recent: [
        { ...fast, endedAt: fromLocalInput(chosen)?.toISOString() ?? null },
      ],
    } satisfies FastingState);
    await done;
  });

  it('leaves an untouched end to the server clock', async () => {
    const fast = running();
    const fixture = await setup({ active: fast, recent: [] });
    const card = fixture.componentInstance as unknown as Card;

    card.openEnd();
    const done = card.saveEnd();

    const request = http.expectOne(END);
    expect(request.request.body).toEqual({});
    request.flush({
      active: null,
      recent: [{ ...fast, endedAt: new Date().toISOString() }],
    } satisfies FastingState);
    await done;
  });

  it('does not send an end before the start or in the future', async () => {
    const fast = running();
    const fixture = await setup({ active: fast, recent: [] });
    const card = fixture.componentInstance as unknown as Card;
    const future = toLocalInput(new Date(Date.now() + HOUR));

    card.openEnd();
    card.setEndDate(future.slice(0, 10));
    card.setEndTime(future.slice(11, 16));
    await card.saveEnd();
    http.expectNone(END);
  });
});
