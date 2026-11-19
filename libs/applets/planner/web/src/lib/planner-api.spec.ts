import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PlannerHabit } from '@all-in-one/applets/planner/contracts';
import { API_BASE_URL } from '@all-in-one/web/shared';
import { PlannerApi } from './planner-api';

describe('PlannerApi.checkin', () => {
  it('publishes the saved habit so other views (the habits page) update at once', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });
    const api = TestBed.inject(PlannerApi);
    const http = TestBed.inject(HttpTestingController);
    expect(api.habitCheckedIn()).toBeNull();

    const saving = api.checkin('h1', { date: '2026-11-19', value: 3 });
    const saved = { id: 'h1', goal: 8 } as PlannerHabit;
    http.expectOne('/api/planner/habits/h1/checkins').flush(saved);

    expect(await saving).toBe(saved);
    expect(api.habitCheckedIn()).toBe(saved);
    http.verify();
  });
});
