import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  Exercise,
  WorkoutRoutine,
} from '@all-in-one/applets/health/contracts';
import { AioConfirm } from '@all-in-one/ui';
import { TrainingSessionPage } from './training-session-page';

const id = '0190f5e2-0000-7000-8000-000000000001';
const exercise: Exercise = {
  slug: 'trx-squat',
  name: 'اسکوات TRX',
  equipment: 'trx',
  muscle: 'legs',
  secondaryMuscles: [],
  level: 'beginner',
  timed: false,
  instructions: ['بندها را بگیر.'],
  mistakes: ['زانو را قفل نکن.'],
  alternatives: [],
  videoUrl: 'https://example.com/trx',
};
const routine: WorkoutRoutine = {
  id,
  title: 'برنامه من',
  goal: 'fitness',
  level: 'beginner',
  equipment: ['trx'],
  daysPerWeek: 1,
  weeks: 4,
  minutes: 30,
  warmup: ['آرام راه برو.'],
  cooldown: ['آرام نفس بکش.'],
  progression: [],
  days: [
    {
      title: 'جلسه اول',
      exercises: [
        {
          exerciseSlug: exercise.slug,
          sets: 2,
          reps: 10,
          seconds: 0,
          restSeconds: 60,
        },
        {
          exerciseSlug: 'plank',
          sets: 1,
          reps: 1,
          seconds: 25,
          restSeconds: 60,
        },
      ],
    },
  ],
};

describe('guided training session', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  async function setup(plan = routine, dayIndex = '0') {
    const ask = vi.fn().mockResolvedValue(false);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AioConfirm, useValue: { ask } },
      ],
    });
    const fixture = TestBed.createComponent(TrainingSessionPage);
    fixture.componentRef.setInput('routineId', id);
    fixture.componentRef.setInput('dayIndex', dayIndex);
    const http = TestBed.inject(HttpTestingController);
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    };
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`/api/health/routines/${id}`).flush(plan);
    await settle();
    const requests = http.match(`/api/health/exercises/${exercise.slug}`);
    requests.forEach((r) => r.flush(exercise));
    await settle();
    const el = fixture.nativeElement as HTMLElement;
    const click = async (label: string) => {
      const button = [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.includes(label),
      );
      expect(button, label).toBeDefined();
      if (!button) throw new Error('Missing action: ' + label);
      button.click();
      await settle();
    };
    return { fixture, http, el, click, settle, ask };
  }

  afterEach(() => {
    try {
      TestBed.inject(HttpTestingController).verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('walks through prescribed sets and rest, then saves only after cooling down', async () => {
    const { fixture, http, el, click, settle, ask } = await setup();
    expect(await fixture.componentInstance.canLeave()).toBe(true);
    await click('گرم کردم');
    expect(el.querySelector('input')).toBeNull();
    expect(el.textContent).toContain('۱۰ تکرار');
    expect(
      el.querySelector('a[href="https://example.com/trx"]'),
    ).not.toBeNull();
    expect(await fixture.componentInstance.canLeave()).toBe(false);
    expect(ask).toHaveBeenCalled();
    await click('این ست را انجام دادم');
    expect(el.textContent).toContain('۶۰ ثانیه');
    http.expectNone('/api/health/training-sessions');
    await click('استراحت کردم');
    expect(el.textContent).toContain('ست ۲ از ۲');
    await click('این ست را انجام دادم');
    http.expectOne('/api/health/exercises/plank').flush({
      ...exercise,
      slug: 'plank',
      name: 'پلانک',
      timed: true,
      equipment: 'bodyweight',
    });
    await settle();
    await click('استراحت کردم');
    expect(el.textContent).toContain('۲۵ ثانیه');
    expect(el.textContent).not.toContain('۱ تکرار');
    await click('این ست را انجام دادم');
    expect(el.textContent).toContain('حالا سرد کن');
    http.expectNone('/api/health/training-sessions');
    await click('سرد کردم');
    const request = http.expectOne('/api/health/training-sessions');
    expect(request.request.body.sets).toEqual([
      { exerciseSlug: exercise.slug, reps: 10, seconds: 0, weightKg: 0 },
      { exerciseSlug: exercise.slug, reps: 10, seconds: 0, weightKg: 0 },
      { exerciseSlug: 'plank', reps: 0, seconds: 25, weightKg: 0 },
    ]);
    expect(el.textContent).not.toContain('خسته نباشی!');
    request.flush({});
    await settle();
    expect(el.textContent).toContain('خسته نباشی! جلسه ثبت شد');
    expect(await fixture.componentInstance.canLeave()).toBe(true);
  });

  it('preserves completed sets after a save failure and allows retry', async () => {
    const plan = structuredClone(routine);
    plan.days[0].exercises = [{ ...plan.days[0].exercises[0], sets: 1 }];
    const { http, el, click, settle } = await setup(plan);
    await click('گرم کردم');
    await click('این ست را انجام دادم');
    await click('سرد کردم');
    const first = http.expectOne('/api/health/training-sessions');
    const payload = first.request.body;
    first.flush(
      { message: 'ارتباط قطع شد' },
      { status: 500, statusText: 'Error' },
    );
    await settle();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'ارتباط قطع شد',
    );
    expect(el.textContent).not.toContain('خسته نباشی!');
    await click('سرد کردم');
    const retry = http.expectOne('/api/health/training-sessions');
    expect(retry.request.body.sets).toEqual(payload.sets);
    retry.flush({});
    await settle();
    expect(el.textContent).toContain('خسته نباشی!');
  });

  it('shows a missing session without offering a start action', async () => {
    const { el } = await setup(routine, '6');
    expect(el.textContent).toContain('این جلسه در برنامه وجود ندارد');
    expect(
      [...el.querySelectorAll('button')].some((b) =>
        b.textContent?.includes('گرم کردم'),
      ),
    ).toBe(false);
  });
});
