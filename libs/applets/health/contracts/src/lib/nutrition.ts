import * as z from 'zod/mini';

export const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  BREAKFAST: 'صبحانه',
  LUNCH: 'ناهار',
  DINNER: 'شام',
  SNACK: 'میان‌وعده',
};
/** Share of the daily calories per meal. */
export const MEAL_SHARE: Record<MealType, number> = {
  BREAKFAST: 0.25,
  LUNCH: 0.35,
  DINNER: 0.3,
  SNACK: 0.1,
};

export const FOOD_GROUPS = [
  'vegetables',
  'fruits',
  'wholeGrains',
  'refinedGrains',
  'leanProtein',
  'redMeat',
  'processedMeat',
  'legumes',
  'dairy',
  'nuts',
  'friedFood',
  'sweets',
  'sugaryDrinks',
] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];

/** Persian labels with examples, shown when logging a meal. */
export const FOOD_GROUP_LABELS: Record<
  FoodGroup,
  { label: string; hint: string }
> = {
  vegetables: { label: 'سبزیجات', hint: 'سالاد، سبزی خوردن، سبزیجات پخته' },
  fruits: { label: 'میوه', hint: 'یک عدد میوه یا یک لیوان میوه خردشده' },
  wholeGrains: { label: 'غلات کامل', hint: 'نان سبوس‌دار، جو، برنج قهوه‌ای' },
  refinedGrains: {
    label: 'غلات تصفیه‌شده',
    hint: 'نان سفید، برنج سفید، ماکارونی',
  },
  leanProtein: { label: 'پروتئین کم‌چرب', hint: 'مرغ، ماهی، تخم‌مرغ' },
  redMeat: { label: 'گوشت قرمز', hint: 'گوشت گوسفند یا گوساله' },
  processedMeat: {
    label: 'گوشت فرآوری‌شده',
    hint: 'سوسیس، کالباس، همبرگر صنعتی',
  },
  legumes: { label: 'حبوبات', hint: 'عدس، نخود، لوبیا' },
  dairy: { label: 'لبنیات', hint: 'شیر، ماست، پنیر' },
  nuts: { label: 'مغزها و دانه‌ها', hint: 'گردو، بادام، تخمه' },
  friedFood: { label: 'سرخ‌کردنی', hint: 'سیب‌زمینی سرخ‌کرده، غذای سرخ‌شده' },
  sweets: { label: 'شیرینی و قند', hint: 'شیرینی، شکلات، قند' },
  sugaryDrinks: { label: 'نوشیدنی شیرین', hint: 'نوشابه، آبمیوه صنعتی' },
};

/** Servings per food group in one meal (0–10). */
export type MealPortions = Partial<Record<FoodGroup, number>>;

/** How a diet judges a meal. Stored on each diet in the database. */
export interface DietRules {
  /** Groups the diet wants in meals */
  encourage: FoodGroup[];
  /** Max servings per meal */
  limit: Partial<Record<FoodGroup, number>>;
  /** Groups the diet excludes */
  avoid: FoodGroup[];
}

/** The default "balanced" rules (used when the user has no diet). */
export const BALANCED_RULES: DietRules = {
  encourage: ['vegetables', 'wholeGrains', 'leanProtein', 'legumes', 'fruits'],
  limit: {
    refinedGrains: 1,
    redMeat: 1,
    friedFood: 0,
    sweets: 1,
    processedMeat: 0,
    sugaryDrinks: 0,
  },
  avoid: [],
};

export interface MealEvaluation {
  /** 0–100 */
  score: number;
  /** Persian, most important first */
  feedback: string[];
}

const label = (g: FoodGroup) => FOOD_GROUP_LABELS[g].label;
/** Persian digits inside Persian sentences. */
const fa = (n: number) => n.toLocaleString('fa-IR');

/**
 * Scores a meal against a diet's rules (and the calorie share of the meal when
 * both calories and a daily target are known). Shared by api and apps so the
 * score can be previewed while logging.
 */
export function evaluateMeal(
  meal: {
    mealType: MealType;
    portions: MealPortions;
    calories?: number | null;
  },
  rules: DietRules,
  dailyCalorieTarget?: number | null,
): MealEvaluation {
  const feedback: string[] = [];
  const praise: string[] = [];
  let score = 70;
  const servings = (g: FoodGroup) => Math.max(0, meal.portions[g] ?? 0);
  const total = FOOD_GROUPS.reduce((sum, g) => sum + servings(g), 0);
  if (total === 0) {
    return { score: 0, feedback: ['هنوز چیزی برای این وعده ثبت نشده است.'] };
  }

  for (const g of rules.avoid) {
    if (servings(g) > 0) {
      score -= 15;
      feedback.push(`${label(g)} در رژیم شما جایی ندارد.`);
    }
  }
  for (const [g, max] of Object.entries(rules.limit) as [FoodGroup, number][]) {
    if (rules.avoid.includes(g)) continue;
    const over = servings(g) - max;
    if (over > 0) {
      score -= 8 * over;
      feedback.push(
        max === 0
          ? `بهتر است ${label(g)} نخورید.`
          : `${label(g)} را به ${fa(max)} واحد کم کنید.`,
      );
    }
  }
  const present = rules.encourage.filter((g) => servings(g) > 0);
  score += Math.min(present.length * 8, 30);
  if (present.length) praise.push(`عالی: ${present.map(label).join('، ')}.`);

  const isMainMeal = meal.mealType === 'LUNCH' || meal.mealType === 'DINNER';
  if (
    isMainMeal &&
    rules.encourage.includes('vegetables') &&
    servings('vegetables') === 0
  ) {
    score -= 10;
    feedback.push('یک بشقاب کوچک سبزیجات یا سالاد اضافه کنید.');
  }
  const proteinGroups: FoodGroup[] = [
    'leanProtein',
    'legumes',
    'dairy',
    'redMeat',
  ];
  if (
    meal.mealType !== 'SNACK' &&
    proteinGroups.every((g) => servings(g) === 0)
  ) {
    score -= 8;
    feedback.push(
      'این وعده پروتئین ندارد؛ تخم‌مرغ، حبوبات، لبنیات یا مرغ اضافه کنید.',
    );
  }

  if (meal.calories && dailyCalorieTarget) {
    const share =
      meal.calories / (dailyCalorieTarget * MEAL_SHARE[meal.mealType]);
    if (share > 1.3) {
      score -= share > 1.6 ? 15 : 8;
      feedback.push(
        `حجم این وعده از سهم معمولش (${fa(Math.round(dailyCalorieTarget * MEAL_SHARE[meal.mealType]))} کالری) بیشتر است.`,
      );
    } else if (share < 0.5 && meal.mealType !== 'SNACK') {
      score -= 5;
      feedback.push('این وعده برای نیاز روزانه‌تان کم است.');
    }
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    feedback: [...feedback, ...praise],
  };
}

export const mealLogSchema = z.object({
  date: z.iso.date(),
  mealType: z.enum(MEAL_TYPES),
  description: z.string().check(z.trim(), z.minLength(1), z.maxLength(500)),
  portions: z.partialRecord(
    z.enum(FOOD_GROUPS),
    z.int().check(z.gte(0), z.lte(10)),
  ),
  calories: z.optional(z.int().check(z.gte(0), z.lte(5000))),
  proteinG: z.optional(z.int().check(z.gte(0), z.lte(500))),
  carbsG: z.optional(z.int().check(z.gte(0), z.lte(1000))),
  fatG: z.optional(z.int().check(z.gte(0), z.lte(500))),
  recipeSlug: z.optional(z.string().check(z.maxLength(64))),
});
export type MealLogInput = z.infer<typeof mealLogSchema>;

/** Change a logged meal; it is scored again. `null` clears a number. */
export const updateMealSchema = z.partial(
  z.object({
    date: z.iso.date(),
    mealType: z.enum(MEAL_TYPES),
    description: z.string().check(z.trim(), z.minLength(1), z.maxLength(500)),
    portions: z.partialRecord(
      z.enum(FOOD_GROUPS),
      z.int().check(z.gte(0), z.lte(10)),
    ),
    calories: z.nullable(z.int().check(z.gte(0), z.lte(5000))),
    proteinG: z.nullable(z.int().check(z.gte(0), z.lte(500))),
    carbsG: z.nullable(z.int().check(z.gte(0), z.lte(1000))),
    fatG: z.nullable(z.int().check(z.gte(0), z.lte(500))),
  }),
);
export type UpdateMealInput = z.infer<typeof updateMealSchema>;

/** One day of eating against the target (dashboard, coach and assistant). */
export interface NutritionDay {
  date: string;
  calorieTarget: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  meals: MealLog[];
}

/** What the AI estimates for a described meal. */
export interface MealEstimate {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  portions: MealPortions;
  /** Persian line about how the estimate was made */
  note: string;
}

export const estimateMealSchema = z.object({
  description: z.string().check(z.trim(), z.minLength(2), z.maxLength(500)),
});

export interface MealLog extends MealEvaluation {
  id: string;
  date: string;
  mealType: MealType;
  description: string;
  portions: MealPortions;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  recipeSlug: string | null;
}

export interface Diet {
  slug: string;
  name: string;
  summary: string;
  description: string;
  carbsPct: number;
  proteinPct: number;
  fatPct: number;
  encourage: string[];
  limit: string[];
  rules: DietRules;
}

export interface RecipeIngredient {
  item: string;
  amount: string;
}

export interface Recipe {
  slug: string;
  title: string;
  mealType: MealType;
  diets: string[];
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  prepMinutes: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  tags: string[];
}

export interface MealPlanDay {
  date: string;
  meals: { mealType: MealType; recipeSlug: string }[];
}

export interface MealPlan {
  id: string;
  startDate: string;
  dietSlug: string;
  calorieTarget: number;
  days: MealPlanDay[];
  /** Recipes referenced by the plan, by slug */
  recipes: Record<string, Recipe>;
}

export const generatePlanSchema = z.object({
  startDate: z.iso.date(),
  days: z._default(z.int().check(z.gte(1), z.lte(7)), 7),
});
export type GeneratePlanInput = z.input<typeof generatePlanSchema>;

/**
 * Picks recipes for each meal of each day: recipes that fit the diet, closest
 * to the meal's calorie share, rotating so the same recipe is not repeated on
 * consecutive days when alternatives exist.
 */
export function planMeals(
  recipes: readonly Pick<Recipe, 'slug' | 'mealType' | 'diets' | 'calories'>[],
  dietSlug: string,
  calorieTarget: number,
  dates: readonly string[],
): MealPlanDay[] {
  const fits = recipes.filter((r) => r.diets.includes(dietSlug));
  const lastUsed = new Map<string, number>();
  return dates.map((date, dayIndex) => ({
    date,
    meals: MEAL_TYPES.flatMap((mealType) => {
      const options = fits.filter((r) => r.mealType === mealType);
      if (!options.length) return [];
      const want = calorieTarget * MEAL_SHARE[mealType];
      const best = [...options].sort((a, b) => {
        const recentA = dayIndex - (lastUsed.get(a.slug) ?? -99) < 2 ? 1 : 0;
        const recentB = dayIndex - (lastUsed.get(b.slug) ?? -99) < 2 ? 1 : 0;
        if (recentA !== recentB) return recentA - recentB;
        const usedA = lastUsed.get(a.slug) ?? -99;
        const usedB = lastUsed.get(b.slug) ?? -99;
        if (usedA !== usedB) return usedA - usedB;
        return Math.abs(a.calories - want) - Math.abs(b.calories - want);
      })[0];
      lastUsed.set(best.slug, dayIndex);
      return [{ mealType, recipeSlug: best.slug }];
    }),
  }));
}
