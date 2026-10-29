import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type Diet as DbDiet,
  type HealthProfile as DbProfile,
  type MealLog as DbMealLog,
  PrismaService,
  type Recipe as DbRecipe,
} from '@all-in-one/api/db';
import {
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
    score: m.score,
    feedback: m.feedback as string[],
    recipeSlug: m.recipeSlug,
  };
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
    const p = await this.prisma.healthProfile.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
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
    } as const;
    return {
      ...profile,
      calorieTarget: calorieTarget(profile, now.getUTCFullYear()),
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
        recipeSlug: input.recipeSlug ?? null,
        score: evaluation.score,
        feedback: evaluation.feedback,
      },
    });
    return toMealLog(row);
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
    const days = planMeals(recipes, dietSlug, target, dates);
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
