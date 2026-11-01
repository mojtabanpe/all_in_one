import type {
  CompletedSet,
  Exercise,
  RoutineDay,
} from '@all-in-one/applets/health/contracts';

export function trainingSessionSteps(day: RoutineDay | undefined) {
  return (day?.exercises ?? []).flatMap((exercise, exerciseIndex) =>
    Array.from({ length: exercise.sets }, (_, setIndex) => ({
      ...exercise,
      exerciseIndex,
      setNumber: setIndex + 1,
    })),
  );
}

/** Only prescribed values are recorded; zero load means no recorded load. */
export function prescribedSet(
  step: ReturnType<typeof trainingSessionSteps>[number],
  exercise: Exercise,
): CompletedSet {
  const weighted = ['dumbbell', 'barbell', 'cable', 'machine'].includes(
    exercise.equipment,
  );
  return {
    exerciseSlug: step.exerciseSlug,
    reps: step.seconds > 0 ? 0 : step.reps,
    seconds: step.seconds > 0 ? step.seconds : 0,
    weightKg: weighted && !step.seconds ? (step.weightKg ?? 0) : 0,
  };
}
