import * as z from 'zod/mini';
import { MEAL_TYPES, type Diet, type MealPlan, type Recipe } from './nutrition';
import type { HealthGoal } from './profile';

export const swapPlanMealSchema = z.object({
  date: z.iso.date(),
  mealType: z.enum(MEAL_TYPES),
  recipeSlug: z.string().check(z.minLength(1), z.maxLength(64)),
});
export type SwapPlanMealInput = z.infer<typeof swapPlanMealSchema>;
export interface ShoppingItem {
  item: string;
  amountPerServing: string;
  servings: number;
}
export interface DietSuggestion {
  slug: string;
  name: string;
  reason: string;
}
export const normalizeFood = (s: string) =>
  s
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\s\u200c]+/g, ' ')
    .trim();
export function recipeAllowed(
  recipe: Pick<Recipe, 'ingredients' | 'title'>,
  excluded: readonly string[],
): boolean {
  const text = normalizeFood(
    [recipe.title, ...recipe.ingredients.map((i) => i.item)].join(' '),
  );
  return !excluded.some(
    (e) => normalizeFood(e) && text.includes(normalizeFood(e)),
  );
}
/** Ingredient labels are preserved, not silently converted between cups/grams. */
export function shoppingList(plan: MealPlan): ShoppingItem[] {
  const items = new Map<string, ShoppingItem>();
  for (const day of plan.days)
    for (const meal of day.meals) {
      for (const ingredient of plan.recipes[meal.recipeSlug]?.ingredients ??
        []) {
        const key = `${normalizeFood(ingredient.item)}|${normalizeFood(ingredient.amount)}`;
        const row = items.get(key) ?? {
          item: ingredient.item,
          amountPerServing: ingredient.amount,
          servings: 0,
        };
        row.servings =
          Math.round((row.servings + (meal.servings ?? 1)) * 100) / 100;
        items.set(key, row);
      }
    }
  return [...items.values()].sort((a, b) => a.item.localeCompare(b.item, 'fa'));
}
export function dietSuggestions(
  diets: readonly Diet[],
  goal: HealthGoal,
): DietSuggestion[] {
  const preferred =
    goal === 'GAIN'
      ? ['high-protein', 'balanced', 'mediterranean']
      : goal === 'LOSE'
        ? ['mediterranean', 'balanced', 'high-protein']
        : ['balanced', 'mediterranean', 'vegetarian'];
  return preferred.flatMap((slug) => {
    const diet = diets.find((d) => d.slug === slug);
    return diet
      ? [
          {
            slug,
            name: diet.name,
            reason:
              slug === 'high-protein'
                ? 'تمرکز بیشتر بر منابع پروتئین؛ برای مقایسه با هدف و سلیقه شما.'
                : slug === 'mediterranean'
                  ? 'تنوع سبزیجات، حبوبات، ماهی و چربی‌های غیراشباع.'
                  : 'یک الگوی متنوع برای شروع؛ میزان انرژی با هدف شما تنظیم می‌شود.',
          },
        ]
      : [];
  });
}
