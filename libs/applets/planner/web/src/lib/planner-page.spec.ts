import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PlannerTask } from '@all-in-one/applets/planner/contracts';
import { toIsoDate } from '@all-in-one/shared/schemas';
import { PlannerPage } from './planner-page';

const today = toIsoDate(new Date());
const task = (over: Partial<PlannerTask>): PlannerTask => ({
  id: 't1',
  title: 'خرید میوه',
  notes: null,
  date: today,
  time: '18:00',
  priority: 'HIGH',
  area: 'home',
  done: false,
  completedAt: null,
  ...over,
});

describe('PlannerPage', () => {
  async function setup(tasks: PlannerTask[]) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(PlannerPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne((r) => r.url.startsWith('/api/planner/tasks')).flush(tasks);
    await fixture.whenStable();
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  it("lists the selected day's tasks with area and priority", async () => {
    const { el } = await setup([
      task({}),
      task({ id: 't2', title: 'دیروز', date: '2000-01-01' }),
    ]);
    expect(el.textContent).toContain('خرید میوه');
    expect(el.textContent).toContain('خانه');
    expect(el.textContent).toContain('اولویت زیاد');
    expect(el.textContent).not.toContain('دیروز');
  });

  it('shows an empty state for a free day', async () => {
    const { el } = await setup([]);
    expect(el.textContent).toContain('برای این روز کاری ثبت نشده');
  });

  it('marks a task done through the api', async () => {
    const { fixture, http, el } = await setup([task({})]);
    (
      el.querySelector(
        'aio-checkbox button, aio-checkbox [role=checkbox]',
      ) as HTMLElement
    ).click();
    const req = http.expectOne('/api/planner/tasks/t1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ done: true });
    req.flush(task({ done: true }));
    await fixture.whenStable();
    expect(el.textContent).toContain('۱ از ۱ کار انجام شده');
  });
});
