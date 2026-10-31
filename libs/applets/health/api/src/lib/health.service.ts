import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Diet as DbDiet,
  type HealthProfile as DbProfile,
  type MealLog as DbMealLog,
  PrismaService,
  type Recipe as DbRecipe,
} from '@all-in-one/api/db';
import {
  recipeAllowed,
  shoppingList,
  dietSuggestions,
  MEAL_SHARE,
  MEAL_TYPES,
  type SwapPlanMealInput,
  type CompletedSet,
  type ActivityType,
  BALANCED_RULES,
  calorieTarget,
  type Diet,
  type DietRules,
  evaluateMeal,
  type FitnessWeek,
  type GeneratePlanInput,
  type HealthProfile,
  type HealthProfileInput,
  type MealLog,
  type MealLogInput,
  type NutritionDay,
  type UpdateMealInput,
  type UpdateWorkoutInput,
  type MealPlan,
  type MealPlanDay,
  type MealPortions,
  type MealType,
  planMeals,
  type Recipe,
  type RecipeIngredient,
  workoutCalories,
  type WorkoutLog,
  type WorkoutLogInput,
  type WorkoutProgram,
  tehranDate,
  weightPlan,
} from '@all-in-one/applets/health/contracts';
import { addDays } from '@all-in-one/shared/schemas';

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Calories used for plans and meal checks when the profile is incomplete. */
export const DEFAULT_CALORIES = 2000;

function toDiet(d: DbDiet): Diet {
  return {
    slug: d.slug,
    name: d.name,
    summary: d.summary,
    description: d.description,
    carbsPct: d.carbsPct,
    proteinPct: d.proteinPct,
    fatPct: d.fatPct,
    encourage: d.encourage,
    limit: d.limit,
    rules: d.rules as unknown as DietRules,
  };
}

function toRecipe(r: DbRecipe): Recipe {
  return {
    slug: r.slug,
    title: r.title,
    mealType: r.mealType,
    diets: r.diets,
    calories: r.calories,
    proteinG: r.proteinG,
    carbsG: r.carbsG,
    fatG: r.fatG,
    prepMinutes: r.prepMinutes,
    ingredients: r.ingredients as unknown as RecipeIngredient[],
    steps: r.steps as unknown as string[],
    tags: r.tags,
  };
}

function toMealLog(m: DbMealLog): MealLog {
  return {
    id: m.id,
    date: iso(m.date),
    mealType: m.mealType,
    description: m.description,
    portions: m.portions as MealPortions,
    calories: m.calories,
    proteinG: m.proteinG,
    carbsG: m.carbsG,
    fatG: m.fatG,
    score: m.score,
    feedback: m.feedback as string[],
    recipeSlug: m.recipeSlug,
  };
}

/**
 * Daily calories a dated weight goal asks for (deficit < 0), replacing the
 * goal's fixed adjustment; undefined without a goal or once it is overdue.
 */
function goalCalories(p: DbProfile | null, now: Date): number | undefined {
  if (!p?.weightKg || !p.targetWeightKg || !p.targetDate) return undefined;
  const plan = weightPlan({
    currentKg: p.weightKg,
    startKg: p.goalStartWeightKg ?? p.weightKg,
    targetKg: p.targetWeightKg,
    today: tehranDate(now),
    targetDate: iso(p.targetDate),
  });
  if (plan.pace === 'overdue') return undefined;
  return plan.dailyCalories;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- profile ----------

  async profile(userId: string, now = new Date()): Promise<HealthProfile> {
    const p = await this.prisma.healthProfile.findUnique({ where: { userId } });
    return this.toProfile(p, now);
  }

  async saveProfile(
    userId: string,
    input: HealthProfileInput,
    now = new Date(),
  ): Promise<HealthProfile> {
    const p = await this.prisma.$transaction(async (tx) => {
      const before = await tx.healthProfile.findUnique({
        where: { userId },
        select: { weightKg: true },
      });
      const saved = await tx.healthProfile.upsert({
        where: { userId },
        create: { userId, ...input },
        update: input,
      });
      // A changed weight is also today's weigh-in, so the weight chart follows it.
      if (input.weightKg && input.weightKg !== before?.weightKg) {
        const date = toDate(tehranDate(now));
        await tx.healthWeightLog.upsert({
          where: { userId_date: { userId, date } },
          create: { userId, date, weightKg: input.weightKg },
          update: { weightKg: input.weightKg },
        });
      }
      return saved;
    });
    return this.toProfile(p, now);
  }

  private toProfile(p: DbProfile | null, now: Date): HealthProfile {
    const profile = {
      sex: p?.sex ?? null,
      birthYear: p?.birthYear ?? null,
      heightCm: p?.heightCm ?? null,
      weightKg: p?.weightKg ?? null,
      activityLevel: p?.activityLevel ?? 'LIGHT',
      goal: p?.goal ?? 'MAINTAIN',
      dietMode: p?.dietMode ?? 'NONE',
      dietSlug: p?.dietSlug ?? null,
      ownDietNotes: p?.ownDietNotes ?? null,
      excludedIngredients: p?.excludedIngredients ?? [],
    } as const;
    const targetDate = p?.targetDate ? iso(p.targetDate) : null;
    const targetWeightKg = p?.targetWeightKg ?? null;
    return {
      ...profile,
      targetWeightKg,
      targetDate,
      calorieTarget: calorieTarget(
        profile,
        now.getUTCFullYear(),
        goalCalories(p, now),
      ),
    };
  }

  // ---------- fitness ----------

  activities(): Promise<ActivityType[]> {
    return this.prisma.activityType.findMany({
      orderBy: { sortOrder: 'asc' },
    }) as Promise<ActivityType[]>;
  }

  async programs(): Promise<WorkoutProgram[]> {
    const rows = await this.prisma.workoutProgram.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r) => ({
      ...r,
      level: r.level as WorkoutProgram['level'],
      exercises: r.exercises as unknown as WorkoutProgram['exercises'],
    }));
  }

  async workouts(
    userId: string,
    from: string,
    to: string,
  ): Promise<WorkoutLog[]> {
    const rows = await this.prisma.workoutLog.findMany({
      where: { userId, date: { gte: toDate(from), lte: toDate(to) } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { activity: true },
    });
    return rows.map((r) => ({
      id: r.id,
      activitySlug: r.activitySlug,
      activityName: r.activity.name,
      programSlug: r.programSlug,
      routineId: r.routineId,
      completedSets: r.completedSets as unknown as CompletedSet[],
      date: iso(r.date),
      durationMin: r.durationMin,
      intensity: r.intensity,
      distanceKm: r.distanceKm,
      steps: r.steps,
      calories: r.calories,
      notes: r.notes,
    }));
  }

  async logWorkout(
    userId: string,
    input: WorkoutLogInput,
  ): Promise<WorkoutLog> {
    const activity = await this.prisma.activityType.findUnique({
      where: { slug: input.activitySlug },
    });
    if (!activity) throw new NotFoundException('این نوع فعالیت پیدا نشد');
    const profile = await this.prisma.healthProfile.findUnique({
      where: { userId },
      select: { weightKg: true },
    });
    const intensity = input.intensity ?? 'MODERATE';
    const row = await this.prisma.workoutLog.create({
      data: {
        userId,
        activitySlug: activity.slug,
        programSlug: input.programSlug ?? null,
        date: toDate(input.date),
        durationMin: input.durationMin,
        intensity,
        distanceKm: input.distanceKm ?? null,
        steps: input.steps ?? null,
        notes: input.notes ?? null,
        calories: workoutCalories(
          activity.met,
          profile?.weightKg ?? null,
          input.durationMin,
          intensity,
        ),
      },
    });
    return {
      ...(await this.workouts(userId, iso(row.date), iso(row.date))).find(
        (w) => w.id === row.id,
      )!,
    };
  }

  /** Changes a logged workout; calories follow the new activity, time and intensity. */
  async updateWorkout(
    userId: string,
    id: string,
    patch: UpdateWorkoutInput,
  ): Promise<WorkoutLog> {
    const log = await this.prisma.workoutLog.findFirst({
      where: { id, userId },
    });
    if (!log) throw new NotFoundException('ورزش پیدا نشد');
    const activity = await this.prisma.activityType.findUnique({
      where: { slug: patch.activitySlug ?? log.activitySlug },
    });
    if (!activity) throw new NotFoundException('این نوع فعالیت پیدا نشد');
    const profile = await this.prisma.healthProfile.findUnique({
      where: { userId },
      select: { weightKg: true },
    });
    const durationMin = patch.durationMin ?? log.durationMin;
    const intensity = patch.intensity ?? log.intensity;
    const row = await this.prisma.workoutLog.update({
      where: { id },
      data: {
        activitySlug: activity.slug,
        ...(patch.date ? { date: toDate(patch.date) } : {}),
        durationMin,
        intensity,
        ...(patch.distanceKm !== undefined
          ? { distanceKm: patch.distanceKm }
          : {}),
        ...(patch.steps !== undefined ? { steps: patch.steps } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        calories: workoutCalories(
          activity.met,
          profile?.weightKg ?? null,
          durationMin,
          intensity,
        ),
      },
    });
    const day = iso(row.date);
    return (await this.workouts(userId, day, day)).find(
      (w) => w.id === row.id,
    ) as WorkoutLog;
  }

  async removeWorkout(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.workoutLog.deleteMany({
      where: { id, userId },
    });
    if (!count) throw new NotFoundException('ورزش پیدا نشد');
  }

  /** Seven days ending on `date`. */
  async week(userId: string, date: string): Promise<FitnessWeek> {
    const from = addDays(date, -6);
    const logs = await this.prisma.workoutLog.findMany({
      where: { userId, date: { gte: toDate(from), lte: toDate(date) } },
      select: { durationMin: true, calories: true },
    });
    return {
      from,
      to: date,
      sessions: logs.length,
      minutes: logs.reduce((s, l) => s + l.durationMin, 0),
      calories: logs.reduce((s, l) => s + (l.calories ?? 0), 0),
      goalMinutes: 150,
    };
  }

  // ---------- nutrition ----------

  async diets(): Promise<Diet[]> {
    return (
      await this.prisma.diet.findMany({ orderBy: { sortOrder: 'asc' } })
    ).map(toDiet);
  }

  async recipes(filter: {
    mealType?: MealType;
    diet?: string;
  }): Promise<Recipe[]> {
    const rows = await this.prisma.recipe.findMany({
      where: {
        mealType: filter.mealType,
        ...(filter.diet ? { diets: { has: filter.diet } } : {}),
      },
      orderBy: { title: 'asc' },
    });
    return rows.map(toRecipe);
  }

  async recipe(slug: string): Promise<Recipe> {
    const r = await this.prisma.recipe.findUnique({ where: { slug } });
    if (!r) throw new NotFoundException('دستور پخت پیدا نشد');
    return toRecipe(r);
  }

  async meals(userId: string, date: string): Promise<MealLog[]> {
    const rows = await this.prisma.mealLog.findMany({
      where: { userId, date: toDate(date) },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toMealLog);
  }

  /** Logs a meal and scores it against the user's diet and calorie target. */
  async logMeal(
    userId: string,
    input: MealLogInput,
    now = new Date(),
  ): Promise<MealLog> {
    const { rules, target } = await this.nutritionContext(userId, now);
    const evaluation = evaluateMeal(input, rules, target);
    const row = await this.prisma.mealLog.create({
      data: {
        userId,
        date: toDate(input.date),
        mealType: input.mealType,
        description: input.description,
        portions: input.portions,
        calories: input.calories ?? null,
        proteinG: input.proteinG ?? null,
        carbsG: input.carbsG ?? null,
        fatG: input.fatG ?? null,
        recipeSlug: input.recipeSlug ?? null,
        score: evaluation.score,
        feedback: evaluation.feedback,
      },
    });
    return toMealLog(row);
  }

  /** Changes a logged meal and scores it again. */
  async updateMeal(
    userId: string,
    id: string,
    patch: UpdateMealInput,
    now = new Date(),
  ): Promise<MealLog> {
    const meal = await this.prisma.mealLog.findFirst({ where: { id, userId } });
    if (!meal) throw new NotFoundException('وعده پیدا نشد');
    const merged = {
      date: patch.date ?? iso(meal.date),
      mealType: patch.mealType ?? meal.mealType,
      description: patch.description ?? meal.description,
      portions: patch.portions ?? (meal.portions as MealPortions),
      calories: patch.calories !== undefined ? patch.calories : meal.calories,
      proteinG: patch.proteinG !== undefined ? patch.proteinG : meal.proteinG,
      carbsG: patch.carbsG !== undefined ? patch.carbsG : meal.carbsG,
      fatG: patch.fatG !== undefined ? patch.fatG : meal.fatG,
    };
    const { rules, target } = await this.nutritionContext(userId, now);
    const evaluation = evaluateMeal(
      { ...merged, calories: merged.calories ?? undefined },
      rules,
      target,
    );
    const row = await this.prisma.mealLog.update({
      where: { id },
      data: {
        ...merged,
        date: toDate(merged.date),
        // A meal changed by hand is no longer the plan's recipe.
        recipeSlug: patch.description ? null : meal.recipeSlug,
        score: evaluation.score,
        feedback: evaluation.feedback,
      },
    });
    return toMealLog(row);
  }

  /** A day's meals with totals against the calorie target. */
  async nutritionDay(
    userId: string,
    date: string,
    now = new Date(),
  ): Promise<NutritionDay> {
    const [meals, { target }] = await Promise.all([
      this.meals(userId, date),
      this.nutritionContext(userId, now),
    ]);
    const sum = (pick: (m: MealLog) => number | null) =>
      meals.reduce((total, m) => total + (pick(m) ?? 0), 0);
    return {
      date,
      calorieTarget: target,
      calories: sum((m) => m.calories),
      proteinG: sum((m) => m.proteinG),
      carbsG: sum((m) => m.carbsG),
      fatG: sum((m) => m.fatG),
      meals,
    };
  }

  async removeMeal(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.mealLog.deleteMany({
      where: { id, userId },
    });
    if (!count) throw new NotFoundException('وعده پیدا نشد');
  }

  /** The diet's rules and calorie target the user is evaluated against. */
  async nutritionContext(
    userId: string,
    now = new Date(),
  ): Promise<{ dietSlug: string; rules: DietRules; target: number }> {
    const profile = await this.profile(userId, now);
    const usesAppDiet =
      profile.dietMode === 'APP_DIET' ||
      profile.dietMode === 'APP_PLAN' ||
      profile.dietMode === 'OWN';
    const diet =
      usesAppDiet && profile.dietSlug
        ? await this.prisma.diet.findUnique({
            where: { slug: profile.dietSlug },
          })
        : null;
    return {
      dietSlug: diet?.slug ?? 'balanced',
      rules: diet ? (diet.rules as unknown as DietRules) : BALANCED_RULES,
      target: profile.calorieTarget ?? DEFAULT_CALORIES,
    };
  }

  async generatePlan(
    userId: string,
    input: GeneratePlanInput,
    now = new Date(),
  ): Promise<MealPlan> {
    const { dietSlug, target } = await this.nutritionContext(userId, now);
    const recipes = await this.prisma.recipe.findMany({
      where: { diets: { has: dietSlug } },
    });
    const dates = Array.from({ length: input.days ?? 7 }, (_, i) =>
      addDays(input.startDate, i),
    );
    const profile = await this.profile(userId, now);
    const allowed = recipes
      .map(toRecipe)
      .filter((r) => recipeAllowed(r, profile.excludedIngredients ?? []));
    for (const mealType of MEAL_TYPES)
      if (!allowed.some((r) => r.mealType === mealType))
        throw new BadRequestException(
          'برای همه وعده‌ها دستور پخت سازگار با رژیم و محدودیت‌ها موجود نیست؛ رژیم یا محدودیت‌ها را بررسی کنید.',
        );
    const days = planMeals(allowed, dietSlug, target, dates).map((day) => ({
      ...day,
      meals: day.meals.map((meal) => {
        const recipe = allowed.find((r) => r.slug === meal.recipeSlug)!;
        return {
          ...meal,
          servings:
            Math.round(
              Math.min(
                3,
                Math.max(
                  0.5,
                  (target * MEAL_SHARE[meal.mealType]) /
                    Math.max(1, recipe.calories),
                ),
              ) * 100,
            ) / 100,
        };
      }),
    }));
    const plan = await this.prisma.mealPlan.create({
      data: {
        userId,
        startDate: toDate(input.startDate),
        dietSlug,
        calorieTarget: target,
        days: days as object[],
      },
    });
    return this.withRecipes(
      plan.id,
      iso(plan.startDate),
      dietSlug,
      target,
      days,
    );
  }

  async currentPlan(userId: string): Promise<MealPlan | null> {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!plan) return null;
    return this.withRecipes(
      plan.id,
      iso(plan.startDate),
      plan.dietSlug,
      plan.calorieTarget,
      plan.days as unknown as MealPlanDay[],
    );
  }

  async suggestions(userId: string) {
    const [diets, profile] = await Promise.all([
      this.diets(),
      this.profile(userId),
    ]);
    return {
      suggestions: dietSuggestions(diets, profile.goal),
      note: 'این گزینه‌ها برای مقایسه‌اند؛ انتخاب نهایی رژیم با شماست و محدودیت مواد غذایی هنگام چیدن برنامه اعمال می‌شود.',
    };
  }

  async planShopping(userId: string) {
    const plan = await this.currentPlan(userId);
    if (!plan) throw new NotFoundException('برنامه غذایی ندارید');
    return shoppingList(plan);
  }

  async swapPlanMeal(
    userId: string,
    input: SwapPlanMealInput,
  ): Promise<MealPlan> {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!plan) throw new NotFoundException('برنامه غذایی ندارید');
    const days = structuredClone(plan.days) as unknown as MealPlanDay[];
    const day = days.find((d) => d.date === input.date);
    const meal = day?.meals.find((m) => m.mealType === input.mealType);
    if (!meal) throw new NotFoundException('این وعده در برنامه نیست');
    const [recipe, profile] = await Promise.all([
      this.recipe(input.recipeSlug),
      this.profile(userId),
    ]);
    if (
      recipe.mealType !== input.mealType ||
      !recipe.diets.includes(plan.dietSlug) ||
      !recipeAllowed(recipe, profile.excludedIngredients ?? [])
    )
      throw new BadRequestException(
        'این غذا با وعده، رژیم یا محدودیت مواد غذایی سازگار نیست',
      );
    meal.recipeSlug = recipe.slug;
    meal.servings =
      Math.round(
        Math.min(
          3,
          Math.max(
            0.5,
            (plan.calorieTarget * MEAL_SHARE[input.mealType]) /
              Math.max(1, recipe.calories),
          ),
        ) * 100,
      ) / 100;
    const { count } = await this.prisma.mealPlan.updateMany({
      where: { id: plan.id, userId, days: { equals: plan.days! } },
      data: { days: days as object[] },
    });
    if (!count)
      throw new ConflictException('برنامه تغییر کرده؛ دوباره دریافت کنید');
    return this.withRecipes(
      plan.id,
      iso(plan.startDate),
      plan.dietSlug,
      plan.calorieTarget,
      days,
    );
  }

  private async withRecipes(
    id: string,
    startDate: string,
    dietSlug: string,
    calorieTarget: number,
    days: MealPlanDay[],
  ): Promise<MealPlan> {
    const slugs = [
      ...new Set(days.flatMap((d) => d.meals.map((m) => m.recipeSlug))),
    ];
    const recipes = await this.prisma.recipe.findMany({
      where: { slug: { in: slugs } },
    });
    return {
      id,
      startDate,
      dietSlug,
      calorieTarget,
      days,
      recipes: Object.fromEntries(recipes.map((r) => [r.slug, toRecipe(r)])),
    };
  }
}
