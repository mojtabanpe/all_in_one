import type {
  Exercise,
  RoutineDay,
} from '@all-in-one/applets/health/contracts';
import { prescribedSet, trainingSessionSteps } from './training-session-steps';

const day: RoutineDay = {
  title: 'جلسه',
  exercises: [
    {
      exerciseSlug: 'squat',
      sets: 3,
      reps: 10,
      seconds: 0,
      restSeconds: 60,
      weightKg: 20,
    },
    { exerciseSlug: 'plank', sets: 2, reps: 1, seconds: 30, restSeconds: 60 },
  ],
};

describe('session prescriptions', () => {
  it('keeps exercise order and restarts set numbering for each exercise', () => {
    expect(
      trainingSessionSteps(day).map((s) => [s.exerciseSlug, s.setNumber]),
    ).toEqual([
      ['squat', 1],
      ['squat', 2],
      ['squat', 3],
      ['plank', 1],
      ['plank', 2],
    ]);
  });
  it('does not record the placeholder repetition or a load for timed exercises', () => {
    expect(
      prescribedSet(trainingSessionSteps(day)[3], {
        equipment: 'bodyweight',
      } as Exercise),
    ).toEqual({
      exerciseSlug: 'plank',
      reps: 0,
      seconds: 30,
      weightKg: 0,
    });
  });
  it('only records prescribed load for weighted equipment, never TRX or bodyweight', () => {
    const step = trainingSessionSteps(day)[0];
    expect(
      prescribedSet(step, { equipment: 'barbell' } as Exercise).weightKg,
    ).toBe(20);
    expect(prescribedSet(step, { equipment: 'trx' } as Exercise).weightKg).toBe(
      0,
    );
    expect(
      prescribedSet(step, { equipment: 'bodyweight' } as Exercise).weightKg,
    ).toBe(0);
  });
});
