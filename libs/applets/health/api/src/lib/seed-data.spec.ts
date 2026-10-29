import {
  DIET_MODES,
  FOOD_GROUPS,
  MEAL_TYPES,
} from '@all-in-one/applets/health/contracts';
import { ACTIVITY_TYPES, WORKOUT_PROGRAMS } from './seed-fitness';
import { DIETS, RECIPES } from './seed-nutrition';

describe('health seed data', () => {
  it('has a recipe for every meal of every diet, so plans are always complete', () => {
    for (const diet of DIETS) {
      for (const mealType of MEAL_TYPES) {
        const found = RECIPES.some(
          (r) => r.mealType === mealType && r.diets.includes(diet.slug),
        );
        expect({ diet: diet.slug, mealType, found }).toEqual({
          diet: diet.slug,
          mealType,
          found: true,
        });
      }
    }
  });

  it('only tags recipes with known diets', () => {
    const slugs = new Set(DIETS.map((d) => d.slug));
    for (const r of RECIPES)
      for (const d of r.diets) expect(slugs.has(d)).toBe(true);
  });

  it('uses only known food groups in diet rules', () => {
    const groups = new Set<string>(FOOD_GROUPS);
    for (const d of DIETS) {
      for (const g of [
        ...d.rules.encourage,
        ...d.rules.avoid,
        ...Object.keys(d.rules.limit),
      ])
        expect(groups.has(g)).toBe(true);
    }
  });

  it('macro splits add up to 100%', () => {
    for (const d of DIETS)
      expect(d.carbsPct + d.proteinPct + d.fatPct).toBe(100);
  });

  it('programs reference existing activities', () => {
    const activities = new Set(ACTIVITY_TYPES.map((a) => a.slug));
    for (const p of WORKOUT_PROGRAMS)
      expect(activities.has(p.activitySlug)).toBe(true);
  });

  it('covers the owner-requested activities (TRX, gym, walking, sport, home)', () => {
    const categories = new Set(ACTIVITY_TYPES.map((a) => a.category));
    for (const c of ['trx', 'gym', 'cardio', 'sport', 'home'])
      expect(categories.has(c as never)).toBe(true);
    expect(DIET_MODES).toContain('APP_PLAN');
  });
});
