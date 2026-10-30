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

  it("lists today's tasks and puts older open tasks under overdue", async () => {
    const { el } = await setup([
      task({}),
      task({ id: 't2', title: 'کار دیروز', date: '2000-01-01' }),
      task({ id: 't3', title: 'کار فردا', date: '2999-01-01' }),
    ]);
    expect(el.textContent).toContain('خرید میوه');
    expect(el.textContent).toContain('عقب‌افتاده');
    expect(el.textContent).toContain('کار دیروز');
    expect(el.textContent).not.toContain('کار فردا');
  });

  it('shows an empty state for a free day', async () => {
    const { el } = await setup([]);
    expect(el.textContent).toContain('فهرست خالی است');
  });

  it('adds a task from the quick-add field', async () => {
    const { fixture, http, el } = await setup([]);
    const input = el.querySelector(
      'input[name=quick-title]',
    ) as HTMLInputElement;
    input.value = 'تماس با مامان';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    (input.form as HTMLFormElement).dispatchEvent(new Event('submit'));
    const req = http.expectOne(
      (r) => r.method === 'POST' && r.url === '/api/planner/tasks',
    );
    expect(req.request.body).toEqual({ title: 'تماس با مامان', date: today });
    req.flush(task({ id: 't9', title: 'تماس با مامان', priority: 'MEDIUM' }));
    await fixture.whenStable();
    expect(el.textContent).toContain('تماس با مامان');
    expect(input.value).toBe('');
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
    expect(el.textContent).toContain('انجام‌شده، ۱');
    expect(el.textContent).toContain('همه کارهای این فهرست انجام شده');
  });
});
