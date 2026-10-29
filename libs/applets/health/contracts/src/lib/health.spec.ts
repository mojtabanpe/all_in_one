import { calorieTarget } from './profile';
import { workoutCalories } from './fitness';
import {
  BALANCED_RULES,
  type DietRules,
  evaluateMeal,
  planMeals,
} from './nutrition';

describe('calorieTarget', () => {
  const base = {
    sex: 'FEMALE',
    birthYear: 1996,
    heightCm: 165,
    weightKg: 60,
    activityLevel: 'LIGHT',
    goal: 'MAINTAIN',
  } as const;

  it('uses Mifflin-St Jeor × activity factor', () => {
    // BMR = 600 + 1031.25 - 150 - 161 = 1320.25; × 1.375 = 1815.3 → 1820
    expect(calorieTarget(base, 2026)).toBe(1820);
  });

  it('never goes below the safe floor', () => {
    expect(
      calorieTarget(
        {
          ...base,
          weightKg: 40,
          heightCm: 150,
          activityLevel: 'SEDENTARY',
          goal: 'LOSE',
        },
        2026,
      ),
    ).toBe(1200);
  });

  it('needs sex, age, height and weight', () => {
    expect(calorieTarget({ ...base, heightCm: null }, 2026)).toBeNull();
  });
});

describe('evaluateMeal', () => {
  it('rewards a balanced lunch', () => {
    const r = evaluateMeal(
      {
        mealType: 'LUNCH',
        portions: { vegetables: 2, leanProtein: 1, wholeGrains: 1 },
      },
      BALANCED_RULES,
    );
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.feedback.at(-1)).toContain('عالی');
  });

  it('penalises fried food and missing vegetables at lunch', () => {
    const r = evaluateMeal(
      {
        mealType: 'LUNCH',
        portions: { refinedGrains: 2, friedFood: 1, redMeat: 1 },
      },
      BALANCED_RULES,
    );
    expect(r.score).toBeLessThan(60);
    expect(r.feedback.join(' ')).toContain('سبزیجات');
  });

  it('applies the diet: keto avoids grains and sweets', () => {
    const keto: DietRules = {
      encourage: ['vegetables', 'leanProtein', 'nuts'],
      limit: { fruits: 0 },
      avoid: ['refinedGrains', 'wholeGrains', 'sweets'],
    };
    const r = evaluateMeal(
      { mealType: 'BREAKFAST', portions: { wholeGrains: 1, leanProtein: 1 } },
      keto,
    );
    expect(r.feedback[0]).toContain('غلات کامل');
  });

  it('flags a meal far above its calorie share', () => {
    const r = evaluateMeal(
      { mealType: 'SNACK', portions: { nuts: 1 }, calories: 600 },
      BALANCED_RULES,
      2000,
    );
    expect(r.feedback.join(' ')).toContain('بیشتر است');
  });

  it('scores an empty meal as 0', () => {
    expect(
      evaluateMeal({ mealType: 'DINNER', portions: {} }, BALANCED_RULES).score,
    ).toBe(0);
  });
});

describe('planMeals', () => {
  const recipes = [
    { slug: 'b1', mealType: 'BREAKFAST', diets: ['balanced'], calories: 400 },
    { slug: 'b2', mealType: 'BREAKFAST', diets: ['balanced'], calories: 450 },
    { slug: 'l1', mealType: 'LUNCH', diets: ['balanced'], calories: 650 },
    { slug: 'k1', mealType: 'LUNCH', diets: ['keto'], calories: 600 },
  ] as const;

  it('only uses recipes that fit the diet and avoids back-to-back repeats', () => {
    const days = planMeals(recipes, 'balanced', 1800, [
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(days[0].meals.map((m) => m.recipeSlug)).toEqual(['b2', 'l1']);
    expect(days[1].meals[0].recipeSlug).toBe('b1');
    expect(
      days.flatMap((d) => d.meals).some((m) => m.recipeSlug === 'k1'),
    ).toBe(false);
  });
});

describe('workoutCalories', () => {
  it('estimates MET × kg × hours', () => {
    expect(workoutCalories(3.5, 70, 60, 'MODERATE')).toBe(245);
    expect(workoutCalories(3.5, null, 60, 'MODERATE')).toBeNull();
  });
});

describe('mealLogSchema', () => {
  it('accepts partial portions and rejects unknown groups', async () => {
    const { mealLogSchema } = await import('./nutrition');
    const base = { date: '2026-10-29', mealType: 'LUNCH', description: 'x' };
    expect(
      mealLogSchema.safeParse({ ...base, portions: { vegetables: 2 } }).success,
    ).toBe(true);
    expect(
      mealLogSchema.safeParse({ ...base, portions: { pizza: 1 } }).success,
    ).toBe(false);
    expect(
      mealLogSchema.safeParse({ ...base, portions: { vegetables: 11 } })
        .success,
    ).toBe(false);
  });
});
