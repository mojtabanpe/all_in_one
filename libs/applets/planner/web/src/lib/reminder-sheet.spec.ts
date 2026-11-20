import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { API_BASE_URL } from '@all-in-one/web/shared';
import { ReminderSheet } from './reminder-sheet';

@Component({ imports: [ReminderSheet], template: '<planner-reminder-sheet />' })
class Host {}

/** Lets the close() navigation finish (the sheet's requests stay pending, so whenStable would wait forever). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ReminderSheet', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        provideRouter([{ path: 'planner', component: Host }]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const sheet = () =>
      harness.fixture.debugElement.query(
        (el) => el.componentInstance instanceof ReminderSheet,
      ).componentInstance as unknown as {
        open: () => boolean;
        close: () => void;
      };
    return { harness, sheet, router: TestBed.inject(Router) };
  }

  it('opens when the app starts at a reminder url (the Android app loads it on a tap)', async () => {
    const { harness, sheet } = await setup();
    await harness.navigateByUrl('/planner?remind=task%3At1');
    expect(sheet().open()).toBe(true);
  });

  it('opens again for a second tap on the same reminder', async () => {
    const { harness, sheet, router } = await setup();
    await harness.navigateByUrl('/planner?remind=task%3At1&tap=1');
    sheet().close();
    await settle();
    expect(router.url).toBe('/planner');
    expect(sheet().open()).toBe(false);

    // Each tap on the same reminder carries a new `tap`, so it is a new url the router acts on.
    await harness.navigateByUrl('/planner?remind=task%3At1&tap=2');
    expect(sheet().open()).toBe(true);
    sheet().close();
    await settle();
    await harness.navigateByUrl('/planner?remind=task%3At1&tap=3');
    expect(sheet().open()).toBe(true);
  });
});
