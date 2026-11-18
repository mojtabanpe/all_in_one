import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type {
  PlannerList,
  PlannerTask,
} from '@all-in-one/applets/planner/contracts';
import { toIsoDate } from '@all-in-one/shared/schemas';
import { TaskDetail } from './task-detail';

const today = toIsoDate(new Date());
const WORK = '0190f5e2-0000-7000-8000-00000000000b';

const lists: PlannerList[] = [
  {
    id: WORK,
    name: 'کار',
    color: 'sky',
    isInbox: false,
    folderId: null,
    sortOrder: 0,
    role: 'OWNER',
    shared: false,
    openCount: 1,
    sections: [],
  },
];

const makeTask = (over: Partial<PlannerTask> = {}): PlannerTask => ({
  id: 't1',
  listId: WORK,
  sectionId: null,
  title: 'خرید میوه',
  content: '',
  externalSourceId: null,
  recurrenceRule: null,
  reminders: [],
  links: [],
  timeZone: null,
  endTime: null,
  kind: 'TASK',
  date: today,
  time: '18:00',
  priority: 'HIGH',
  done: false,
  wontDo: false,
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

describe('TaskDetail', () => {
  async function setup(task: PlannerTask) {
    TestBed.configureTestingModule({
      imports: [TaskDetail],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(TaskDetail);
    fixture.componentRef.setInput('task', task);
    fixture.componentRef.setInput('lists', lists);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`/api/planner/tasks/${task.id}/comments`).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });

  it('shows a clean scannable summary and hides empty optional panels by default', async () => {
    const { el } = await setup(makeTask());
    const text = el.textContent ?? '';
    expect(text).toContain('زمان‌بندی');
    expect(text).toContain('امروز');
    expect(text).toContain('اولویت');
    expect(text).toContain('زیاد');
    expect(text).toContain('فهرست و برچسب');
    expect(text).toContain('کار');
    // Expanded panels and empty optional sections start closed.
    expect(el.querySelector('#task-panel-schedule')).toBeNull();
    expect(el.querySelector('#task-panel-priority')).toBeNull();
    expect(el.querySelector('#task-panel-organize')).toBeNull();
    expect(el.querySelector('#task-edit-scope')).toBeNull();
    expect(el.querySelector('input[aria-label="زیرکار تازه"]')).toBeNull();
    expect(el.querySelector('input[aria-label="لینک تازه"]')).toBeNull();
    expect(el.querySelector('input[aria-label="پیام تازه"]')).toBeNull();
  });

  it('reveals schedule controls on tap and keeps recurrence clean when not repeating', async () => {
    const { fixture, el } = await setup(makeTask({ time: null }));
    const trigger = el.querySelector(
      'button[aria-controls="task-panel-schedule"]',
    ) as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    expect(el.querySelector('#task-panel-schedule')).not.toBeNull();
    expect(el.querySelector('#task-date')).not.toBeNull();
    // Without time, reminder/duration stay out of the way with a short hint.
    expect(el.querySelector('#task-reminder')).toBeNull();
    expect(el.textContent).toContain('ساعت را مشخص کن');
    // Non-recurring embedded recurrence editor hides idle buttons.
    expect(el.textContent).not.toContain('ثبت تنظیمات تکرار');
    expect(el.textContent).not.toContain('تنظیمات پیشرفته');
  });

  it('auto-surfaces populated subtasks and links and lets users open empty sections on demand', async () => {
    const { fixture, el } = await setup(
      makeTask({
        checklist: [
          {
            id: 'c1',
            title: 'سیب',
            done: true,
            completedAt: null,
            sortOrder: 0,
          },
          {
            id: 'c2',
            title: 'موز',
            done: false,
            completedAt: null,
            sortOrder: 1,
          },
        ],
        links: ['https://example.com/list'],
      }),
    );
    expect(el.textContent).toContain('سیب');
    expect(el.textContent).toContain('example.com/list');
    // Comments are still empty, so hidden until requested.
    expect(el.querySelector('input[aria-label="پیام تازه"]')).toBeNull();
    const commentTrigger = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('گفتگو'),
    ) as HTMLButtonElement;
    commentTrigger.click();
    fixture.detectChanges();
    expect(el.querySelector('input[aria-label="پیام تازه"]')).not.toBeNull();
  });

  it('emits toggled when the hero checkbox is clicked', async () => {
    const { fixture, el } = await setup(makeTask());
    const toggled = vi.fn();
    fixture.componentInstance.toggled.subscribe(toggled);
    (
      el.querySelector(
        'aio-checkbox button, aio-checkbox [role=checkbox]',
      ) as HTMLElement
    ).click();
    expect(toggled).toHaveBeenCalledWith(true);
  });

  it('shows the recurring edit scope banner only for recurring tasks', async () => {
    const { el } = await setup(
      makeTask({
        repeatRule: 'RRULE:FREQ=DAILY',
        seriesId: 'series-1',
      }),
    );
    expect(el.querySelector('#task-edit-scope')).not.toBeNull();
  });
});
