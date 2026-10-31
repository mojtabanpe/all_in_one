import {
  calorieTarget,
  fastHoursElapsed,
  fastingProtocolLabel,
  tehranDate,
  weightPlan,
} from '../index';

describe('weightPlan', () => {
  const base = {
    currentKg: 92,
    startKg: 92,
    targetKg: 85,
    today: '2026-10-31',
    targetDate: '2026-12-31',
  };

  it('works out the weekly pace and the daily deficit for 7 kg in two months', () => {
    const plan = weightPlan(base);
    expect(plan.daysLeft).toBe(61);
    expect(plan.remainingKg).toBe(7);
    expect(plan.weeklyKg).toBe(0.8);
    expect(plan.pace).toBe('fast');
    // 0.8 kg × 7700 / 7 = 880 kcal a day
    expect(plan.dailyCalories).toBe(-880);
    expect(plan.progressPct).toBe(0);
  });

  it('caps the deficit at 1,000 kcal and flags a too-fast goal', () => {
    const plan = weightPlan({ ...base, targetDate: '2026-11-30' });
    expect(plan.pace).toBe('too-fast');
    expect(plan.dailyCalories).toBe(-1000);
  });

  it('tracks progress from the starting weight', () => {
    const plan = weightPlan({ ...base, currentKg: 88.5 });
    expect(plan.progressPct).toBe(50);
    expect(plan.remainingKg).toBe(3.5);
  });

  it('is done once the target is reached and overdue after the date', () => {
    expect(weightPlan({ ...base, currentKg: 84.8 }).pace).toBe('done');
    const late = weightPlan({ ...base, today: '2027-01-02' });
    expect(late.pace).toBe('overdue');
    expect(late.dailyCalories).toBe(0);
  });

  it('plans a capped surplus for weight gain', () => {
    const plan = weightPlan({
      ...base,
      currentKg: 60,
      startKg: 60,
      targetKg: 66,
    });
    expect(plan.remainingKg).toBe(-6);
    expect(plan.weeklyKg).toBeLessThan(0);
    expect(plan.pace).toBe('too-fast');
    expect(plan.dailyCalories).toBe(500);
  });
});

describe('calorieTarget with a dated goal', () => {
  it('uses the goal calories instead of the fixed adjustment', () => {
    const p = {
      sex: 'MALE',
      birthYear: 1990,
      heightCm: 180,
      weightKg: 92,
      activityLevel: 'LIGHT',
      goal: 'LOSE',
    } as const;
    // BMR = 920 + 1125 - 180 + 5 = 1870; × 1.375 = 2571.25
    expect(calorieTarget(p, 2026)).toBe(2070);
    expect(calorieTarget(p, 2026, -880)).toBe(1690);
  });
});

describe('fasting helpers', () => {
  it('labels protocols with Persian digits', () => {
    expect(fastingProtocolLabel(16)).toBe('۱۶:۸');
    expect(fastingProtocolLabel(24)).toBe('۲۴ ساعته');
  });

  it('measures running and finished fasts', () => {
    const fast = {
      id: 'f',
      startedAt: '2026-10-31T16:30:00.000Z',
      endedAt: null,
      targetHours: 16,
    };
    expect(fastHoursElapsed(fast, new Date('2026-11-01T04:30:00.000Z'))).toBe(
      12,
    );
    expect(
      fastHoursElapsed(
        { ...fast, endedAt: '2026-11-01T08:30:00.000Z' },
        new Date('2026-11-02T00:00:00.000Z'),
      ),
    ).toBe(16);
  });

  it('uses Tehran calendar days', () => {
    // 21:00 UTC is 00:30 the next day in Tehran (UTC+3:30).
    expect(tehranDate(new Date('2026-10-31T21:00:00Z'))).toBe('2026-11-01');
  });
});
