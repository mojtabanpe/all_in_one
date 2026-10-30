import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  PlannerList,
  PlannerTask,
} from '@all-in-one/applets/planner/contracts';
import { toIsoDate } from '@all-in-one/shared/schemas';
import { TasksPage } from './tasks-page';

const today = toIsoDate(new Date());
const INBOX = '0190f5e2-0000-7000-8000-00000000000a';
const WORK = '0190f5e2-0000-7000-8000-00000000000b';

const list = (id: string, name: string, isInbox = false): PlannerList => ({
  id,
  name,
  color: 'sky',
  isInbox,
  folderId: null,
  sortOrder: 0,
  role: 'OWNER',
  shared: false,
  openCount: 0,
  sections: [],
});

const task = (over: Partial<PlannerTask>): PlannerTask => ({
  id: 't1',
  listId: WORK,
  sectionId: null,
  title: 'خرید میوه',
  content: '',
  kind: 'TASK',
  date: today,
  time: '18:00',
  priority: 'HIGH',
  done: false,
  completedAt: null,
  deletedAt: null,
  tags: [],
  checklist: [],
  assigneeId: null,
  createdById: 'u',
  commentCount: 0,
  sortOrder: 0,
  createdAt: '2026-10-29T00:00:00.000Z',
  ...over,
});

describe('TasksPage', () => {
  async function setup(open: PlannerTask[]) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    const fixture = TestBed.createComponent(TasksPage);
    const http = TestBed.inject(HttpTestingController);
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    fixture.detectChanges();
    http
      .expectOne('/api/planner/lists')
      .flush([list(INBOX, 'صندوق ورودی', true), list(WORK, 'کار')]);
    http.expectOne('/api/planner/folders').flush([]);
    http.expectOne('/api/planner/tags').flush([]);
    http
      .expectOne((r) => r.url.startsWith('/api/planner/tasks?status=open'))
      .flush(open);
    http
      .expectOne((r) => r.url.startsWith('/api/planner/tasks/completed'))
      .flush([]);
    await settle();
    /** Answers the reloads a write triggers, then settles. */
    const drain = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      http.match(() => true).forEach((r) => r.flush([]));
      await settle();
    };
    return {
      fixture,
      http,
      settle,
      drain,
      el: fixture.nativeElement as HTMLElement,
    };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it("lists today's tasks with their list and puts older open tasks under overdue", async () => {
    const { el } = await setup([
      task({ tags: ['خانه'] }),
      task({ id: 't2', title: 'کار دیروز', date: '2000-01-01' }),
      task({ id: 't3', title: 'کار فردا', date: '2999-01-01' }),
      task({ id: 't4', title: 'بی‌تاریخ', date: null }),
    ]);
    const text = el.textContent ?? '';
    expect(text).toContain('خرید میوه');
    expect(text).toContain('#خانه');
    expect(text).toContain('کار');
    expect(text).toContain('عقب‌افتاده');
    expect(text).toContain('کار دیروز');
    expect(text).not.toContain('کار فردا');
    expect(text).not.toContain('بی‌تاریخ');
  });

  it('shows an empty state for a free day', async () => {
    const { el } = await setup([]);
    expect(el.textContent).toContain('فهرست خالی است');
  });

  it('reads #tags and !priority in quick add', async () => {
    const { http, settle, drain, el } = await setup([]);
    const input = el.querySelector(
      'input[name=quick-title]',
    ) as HTMLInputElement;
    input.value = 'تماس با مامان #خانواده !1';
    input.dispatchEvent(new Event('input'));
    await settle();
    (input.form as HTMLFormElement).dispatchEvent(new Event('submit'));
    const req = http.expectOne(
      (r) => r.method === 'POST' && r.url === '/api/planner/tasks',
    );
    expect(req.request.body).toEqual({
      title: 'تماس با مامان',
      date: today,
      priority: 'HIGH',
      tags: ['خانواده'],
    });
    req.flush(task({ id: 't9', title: 'تماس با مامان', tags: ['خانواده'] }));
    await drain();
    expect(el.textContent).toContain('تماس با مامان');
    expect(input.value).toBe('');
  });

  it('marks a task done through the api', async () => {
    const { http, drain, el } = await setup([task({})]);
    (
      el.querySelector(
        'aio-checkbox button, aio-checkbox [role=checkbox]',
      ) as HTMLElement
    ).click();
    const req = http.expectOne(`/api/planner/tasks/t1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ done: true });
    req.flush(task({ done: true, completedAt: new Date().toISOString() }));
    await drain();
    expect(el.textContent).toContain('انجام‌شده، ۱');
    expect(el.textContent).toContain('همه کارهای این فهرست انجام شده');
  });
});
