import {
  buildRoutine,
  generateRoutineSchema,
  logSessionSchema,
  trainingProgress,
  type Exercise,
  type GenerateRoutineInput,
  type TrainingSession,
} from './coaching';
import { recipeAllowed, shoppingList } from './nutrition-coach';
import type { MealPlan } from './nutrition';

const catalog = ['legs', 'back', 'chest', 'core'].flatMap((muscle) =>
  ['bodyweight', 'trx'].map(
    (equipment) =>
      ({
        slug: `${equipment}-${muscle}`,
        name: muscle,
        muscle,
        equipment,
        level: 'beginner',
        timed: muscle === 'core',
        instructions: [],
        mistakes: [],
        alternatives: [],
        secondaryMuscles: [],
        videoUrl: null,
      }) as Exercise,
  ),
);
const input: GenerateRoutineInput = {
  title: 'برنامه',
  goal: 'fitness',
  level: 'beginner',
  equipment: ['trx'],
  daysPerWeek: 3,
  weeks: 4,
  minutes: 30,
};
describe('independent training coach', () => {
  it('only prescribes available equipment and known exercise IDs with bounded beginner volume', () => {
    const days = buildRoutine(input, catalog);
    expect(days).toHaveLength(3);
    for (const day of days)
      for (const e of day.exercises) {
        expect(catalog.find((c) => c.slug === e.exerciseSlug)?.equipment).toBe(
          'trx',
        );
        expect(e.sets).toBe(2);
      }
  });
  it('fills groups the chosen equipment cannot cover with bodyweight moves only', () => {
    const days = buildRoutine({ ...input, equipment: ['machine'] }, catalog);
    expect(days[0].exercises.length).toBeGreaterThanOrEqual(3);
    for (const day of days)
      for (const e of day.exercises)
        expect(catalog.find((c) => c.slug === e.exerciseSlug)?.equipment).toBe(
          'bodyweight',
        );
    expect(
      generateRoutineSchema.safeParse({
        ...input,
        equipment: [],
        daysPerWeek: 7,
      }).success,
    ).toBe(false);
  });
  it('requires actual work instead of accepting a blank planned set', () => {
    const session = {
      routineId: '00000000-0000-4000-8000-000000000001',
      dayIndex: 0,
      date: '2026-10-30',
      durationMin: 30,
      sets: [{ exerciseSlug: 'trx-core', weightKg: 0, reps: 0, seconds: 0 }],
    };
    expect(logSessionSchema.safeParse(session).success).toBe(false);
    expect(
      logSessionSchema.safeParse({
        ...session,
        sets: [{ ...session.sets[0], seconds: 30 }],
      }).success,
    ).toBe(true);
  });
  it('sums actual sets, weight volume and muscle coverage without counting planned work', () => {
    const logs = [
      {
        date: '2026-10-30',
        completedSets: [
          { exerciseSlug: 'trx-back', reps: 10, weightKg: 5, seconds: 0 },
          {
            exerciseSlug: 'bodyweight-core',
            reps: 0,
            weightKg: 0,
            seconds: 30,
          },
        ],
      },
    ] as TrainingSession[];
    const progress = trainingProgress(
      logs,
      catalog,
      '2026-10-01',
      '2026-10-30',
    );
    expect(progress.totalSets).toBe(2);
    expect(progress.volumeKg).toBe(50);
    expect(progress.muscles).toContainEqual({ muscle: 'back', sets: 1 });
    expect(progress.exercises[0].bestWeightKg).toBe(5);
  });
});
describe('meal constraints and shopping', () => {
  it('normalizes Arabic/Persian ingredient names before applying exclusions', () => {
    expect(
      recipeAllowed(
        { title: 'سالاد', ingredients: [{ item: 'شير', amount: 'یک لیوان' }] },
        ['شیر'],
      ),
    ).toBe(false);
    expect(
      recipeAllowed(
        { title: 'سالاد', ingredients: [{ item: 'خیار', amount: 'یک عدد' }] },
        ['شیر'],
      ),
    ).toBe(true);
  });
  it('scales repeated ingredients by servings and keeps unlike units separate', () => {
    const plan = {
      days: [
        {
          date: '2026-10-30',
          meals: [
            { recipeSlug: 'a', mealType: 'LUNCH', servings: 1.5 },
            { recipeSlug: 'b', mealType: 'DINNER', servings: 2 },
          ],
        },
      ],
      recipes: {
        a: { ingredients: [{ item: 'برنج', amount: '۱۰۰ گرم' }] },
        b: {
          ingredients: [
            { item: 'برنج', amount: '۱۰۰ گرم' },
            { item: 'برنج', amount: 'یک پیمانه' },
          ],
        },
      },
    } as unknown as MealPlan;
    expect(shoppingList(plan)).toContainEqual({
      item: 'برنج',
      amountPerServing: '۱۰۰ گرم',
      servings: 3.5,
    });
    expect(shoppingList(plan)).toContainEqual({
      item: 'برنج',
      amountPerServing: 'یک پیمانه',
      servings: 2,
    });
  });
});
