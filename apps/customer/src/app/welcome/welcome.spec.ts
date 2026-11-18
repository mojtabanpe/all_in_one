import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { OnboardingState } from '@all-in-one/shared/schemas';
import { AioNotifications } from '@all-in-one/ui';
import {
  API_BASE_URL,
  AuthStore,
  GrowthAnalytics,
  PushSettings,
} from '@all-in-one/web/shared';
import { mealTypeAt, Welcome } from './welcome';
import { needsWelcome, WelcomeGate } from './welcome-gate';

const fresh: OnboardingState = {
  goal: null,
  skipped: false,
  completed: false,
  established: false,
};

describe('first-step gate', () => {
  function setup() {
    const user = signal<{ id: string } | null>({ id: 'a' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: AuthStore, useValue: { user } },
      ],
    });
    return {
      user,
      gate: TestBed.inject(WelcomeGate),
      http: TestBed.inject(HttpTestingController),
    };
  }
  afterEach(() => TestBed.resetTestingModule());

  it('is needed until the account skips, finishes or has its own data', () => {
    expect(needsWelcome(fresh)).toBe(true);
    expect(needsWelcome({ ...fresh, goal: 'planner' })).toBe(true);
    expect(needsWelcome({ ...fresh, skipped: true })).toBe(false);
    expect(needsWelcome({ ...fresh, completed: true })).toBe(false);
    expect(needsWelcome({ ...fresh, established: true })).toBe(false);
  });

  it('asks once per account in a session', async () => {
    const { gate, http, user } = setup();
    const first = gate.needed();
    http.expectOne('/api/onboarding').flush(fresh);
    expect(await first).toBe(true);
    expect(await gate.needed()).toBe(false);
    http.expectNone('/api/onboarding');

    user.set({ id: 'b' });
    const other = gate.needed();
    http.expectOne('/api/onboarding').flush({ ...fresh, established: true });
    expect(await other).toBe(false);
  });

  it('lets the app open when onboarding is unavailable', async () => {
    const { gate, http } = setup();
    const result = gate.needed();
    http
      .expectOne('/api/onboarding')
      .flush(null, { status: 500, statusText: 'Server Error' });
    expect(await result).toBe(false);
  });
});

describe('welcome page', () => {
  function setup(
    push: Partial<PushSettings> = { supported: false },
    client?: string,
  ) {
    const success = vi.fn();
    const track = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: AioNotifications, useValue: { success } },
        {
          provide: GrowthAnalytics,
          useValue: { track, client: () => client },
        },
        {
          provide: PushSettings,
          useValue: {
            enabled: signal(false),
            busy: signal(false),
            message: signal(''),
            ...push,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(Welcome);
    const http = TestBed.inject(HttpTestingController);
    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true);
    // Not whenStable(): a resource whose request the test has not answered yet keeps the app unstable.
    const settle = async () => {
      for (let turn = 0; turn < 3; turn++) {
        await new Promise((resolve) => setTimeout(resolve));
        fixture.detectChanges();
      }
    };
    const click = async (label: string) => {
      const button = Array.from<HTMLButtonElement>(
        fixture.nativeElement.querySelectorAll('button'),
      ).find((item) => item.textContent?.includes(label));
      if (!button) throw new Error(`No button: ${label}`);
      button.click();
      await settle();
    };
    fixture.detectChanges();
    return { fixture, http, navigate, settle, click, success, track };
  }
  afterEach(() => TestBed.resetTestingModule());

  it('takes a new account from a goal to its first task', async () => {
    const { fixture, http, navigate, settle, click, track } = setup();
    http.expectOne('/api/onboarding').flush(fresh);
    await settle();

    await click('روز منظم‌تر');
    const choice = http.expectOne('/api/onboarding');
    expect(choice.request.body).toEqual({ goal: 'planner' });
    choice.flush({ ...fresh, goal: 'planner' });
    await settle();
    expect(fixture.nativeElement.textContent).toContain(
      'اولین کار امروزت چیست؟',
    );

    await click('مرتب کردن میز کار');
    const task = http.expectOne('/api/planner/tasks');
    expect(task.request.body.title).toBe('مرتب کردن میز کار');
    expect(task.request.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    task.flush({});
    await settle();
    // No notification support here: straight to the planner.
    expect(navigate).toHaveBeenCalledWith('/planner');
    expect(track.mock.calls).toEqual([
      ['welcome_viewed'],
      ['notify_unsupported'],
    ]);
  });

  it('starts at the first action when the goal came from a landing page', async () => {
    const { fixture, http, settle } = setup();
    http.expectOne('/api/onboarding').flush({ ...fresh, goal: 'health' });
    await settle();
    http.expectOne('/api/billing/access').flush({ tier: 'free' });
    await settle();
    expect(fixture.nativeElement.textContent).toContain(
      'آخرین وعده‌ات چه بود؟',
    );
  });

  it('offers notifications after the first action and continues either way', async () => {
    const enabled = signal(false);
    const enable = vi.fn(async () => enabled.set(true));
    const { fixture, http, navigate, settle, click, success, track } = setup({
      supported: true,
      enabled,
      enable,
    });
    http.expectOne('/api/onboarding').flush({ ...fresh, goal: 'english' });
    await settle();
    http.expectOne('/api/english/starter-decks').flush([
      {
        slug: 'daily-life-a1',
        title: 'Daily life',
        level: 'A1',
        cardCount: 12,
      },
    ]);
    await settle();

    await click('Daily life');
    http
      .expectOne('/api/english/starter-decks/daily-life-a1')
      .flush({ id: 'd1' });
    await settle();
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('قدم اول انجام شد.');

    await click('روشن کردن اعلان‌ها');
    expect(enable).toHaveBeenCalledTimes(1);
    const progress = http.expectOne('/api/push/progress-settings');
    expect(progress.request.body).toEqual({
      firstWeek: true,
      weekly: true,
      dailyTasks: false,
    });
    progress.flush({});
    const reminder = http.expectOne('/api/push/review-settings');
    expect(reminder.request.body).toEqual({ enabled: true, time: '20:00' });
    reminder.flush({});
    await settle();
    expect(success).toHaveBeenCalledWith('اعلان‌ها روشن شد.');
    expect(navigate).toHaveBeenCalledWith('/english/deck/d1/study');
    expect(track.mock.calls).toEqual([
      ['welcome_viewed'],
      ['notify_prompt_viewed'],
      ['notify_enabled'],
    ]);
  });

  it('records a declined or failed notification offer', async () => {
    const enable = vi.fn(async () => undefined);
    const { http, navigate, settle, click, track } = setup({
      supported: true,
      enable,
    });
    http.expectOne('/api/onboarding').flush({ ...fresh, goal: 'planner' });
    await settle();
    await click('ده دقیقه پیاده‌روی');
    http.expectOne('/api/planner/tasks').flush({});
    await settle();

    await click('روشن کردن اعلان‌ها');
    expect(enable).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    // A failed setup still lets the account into the app, without counting it as a refusal.
    await click('ورود به برنامه');
    expect(navigate).toHaveBeenCalledWith('/planner');
    expect(track.mock.calls).toEqual([
      ['welcome_viewed'],
      ['notify_prompt_viewed'],
      ['notify_failed'],
    ]);
  });

  it('records the app the account was made in, once', async () => {
    const { http, settle } = setup({ supported: false }, 'direct_apk');
    http.expectOne('/api/onboarding').flush(fresh);
    await settle();
    const source = http.expectOne('/api/onboarding/source');
    expect(source.request.method).toBe('PUT');
    expect(source.request.body).toEqual({ client: 'direct_apk' });
    source.flush(null);
    await settle();
    http.expectNone('/api/onboarding/source');
  });

  it('skips the guide on request', async () => {
    const { http, navigate, settle, click, track } = setup();
    http.expectOne('/api/onboarding').flush(fresh);
    await settle();
    await click('فعلاً بدون راهنما');
    const skipped = http.expectOne('/api/onboarding');
    expect(skipped.request.body).toEqual({ goal: null });
    skipped.flush({ ...fresh, skipped: true });
    await settle();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(track).toHaveBeenLastCalledWith('welcome_skipped');
  });

  it('sends accounts that no longer need it home', async () => {
    const { http, navigate, settle } = setup();
    http.expectOne('/api/onboarding').flush({ ...fresh, established: true });
    await settle();
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('picks the meal by the time of day', () => {
    expect(mealTypeAt(8)).toBe('BREAKFAST');
    expect(mealTypeAt(13)).toBe('LUNCH');
    expect(mealTypeAt(20)).toBe('DINNER');
    expect(mealTypeAt(23)).toBe('SNACK');
  });
});
