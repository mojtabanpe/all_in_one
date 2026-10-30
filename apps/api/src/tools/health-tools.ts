import { BadRequestException } from '@nestjs/common';
import type {
  HealthAiService,
  HealthService,
} from '@all-in-one/applets/health/api';
import {
  ACTIVITY_LEVELS,
  DIET_MODES,
  FOOD_GROUPS,
  generatePlanSchema,
  HEALTH_GOALS,
  healthProfileSchema,
  INTENSITIES,
  MEAL_TYPES,
  mealLogSchema,
  SEXES,
  updateMealSchema,
  updateWorkoutSchema,
  workoutLogSchema,
} from '@all-in-one/applets/health/contracts';
import { daysBetween } from '@all-in-one/applets/planner/contracts';
import * as z from 'zod';
import { parseWith, type ToolSink } from './tool-kit';

const id = z.uuid();
const date = z.iso.date().describe('YYYY-MM-DD (Tehran calendar day)');
const portions = z
  .partialRecord(z.enum(FOOD_GROUPS), z.number().int().min(0).max(10))
  .describe(
    'Servings per food group (0-10), used to score the meal against the diet',
  );
const nutrition = {
  calories: z
    .number()
    .int()
    .min(0)
    .max(5000)
    .describe('kcal; estimate it from the description if the user gives none'),
  protein_g: z.number().int().min(0).max(500).optional(),
  carbs_g: z.number().int().min(0).max(1000).optional(),
  fat_g: z.number().int().min(0).max(500).optional(),
};

/** snake_case macro names → the contracts' camelCase. */
const macros = (a: {
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}) => ({
  ...(a.protein_g !== undefined ? { proteinG: a.protein_g } : {}),
  ...(a.carbs_g !== undefined ? { carbsG: a.carbs_g } : {}),
  ...(a.fat_g !== undefined ? { fatG: a.fat_g } : {}),
});

/**
 * Health (Gordool-style) tools: profile, meals with calories and macros,
 * daily nutrition, workouts, the catalog and meal plans.
 */
export function healthTools(
  kit: ToolSink,
  s: { health: HealthService; ai: HealthAiService },
) {
  const user = kit.user;
  const read = 'health:read' as const;
  const write = 'health:write' as const;

  kit.tool(
    'get_health_profile',
    {
      description:
        'Health profile: body data, goal, diet mode and the daily calorie target.',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.health.profile(user),
  );
  kit.tool(
    'update_health_profile',
    {
      description:
        'Update the health profile; omitted fields remain unchanged. Excluded ingredients are text filters, not a verified allergy database.',
      scope: write,
      kind: 'update',
      input: {
        sex: z.enum(SEXES).optional(),
        birth_year: z.number().int().min(1900).max(2100).optional(),
        height_cm: z.number().int().min(80).max(250).optional(),
        weight_kg: z.number().min(20).max(400).optional(),
        activity_level: z.enum(ACTIVITY_LEVELS).optional(),
        goal: z.enum(HEALTH_GOALS).optional(),
        diet_mode: z.enum(DIET_MODES).optional(),
        diet_slug: z.string().max(64).optional().describe('From list_diets'),
        own_diet_notes: z.string().max(2000).optional(),
        excluded_ingredients: z
          .array(z.string().min(1).max(80))
          .max(30)
          .optional(),
      },
    },
    (a) =>
      s.health.saveProfile(
        user,
        parseWith(healthProfileSchema, {
          sex: a.sex,
          birthYear: a.birth_year,
          heightCm: a.height_cm,
          weightKg: a.weight_kg,
          activityLevel: a.activity_level,
          goal: a.goal,
          dietMode: a.diet_mode,
          dietSlug: a.diet_slug,
          ownDietNotes: a.own_diet_notes,
          excludedIngredients: a.excluded_ingredients,
        }),
      ),
  );

  // ---------------------------------------------------------------- nutrition
  kit.tool(
    'get_nutrition_day',
    {
      description:
        "A day's logged meals (with ids) and totals of calories and macros against the calorie target.",
      scope: read,
      kind: 'read',
      input: { date },
    },
    (a) => s.health.nutritionDay(user, a.date),
  );
  kit.tool(
    'log_meal',
    {
      description:
        'Log a meal. Estimate calories and macros yourself (or call estimate_meal) when the user does not give them. The meal is scored against the diet.',
      scope: write,
      kind: 'create',
      input: {
        date,
        meal_type: z.enum(MEAL_TYPES),
        description: z
          .string()
          .min(1)
          .max(500)
          .describe("What was eaten, in the user's words"),
        ...nutrition,
        portions: portions.optional(),
      },
    },
    (a) =>
      s.health.logMeal(
        user,
        parseWith(mealLogSchema, {
          date: a.date,
          mealType: a.meal_type,
          description: a.description,
          portions: a.portions ?? {},
          calories: a.calories,
          ...macros(a),
        }),
      ),
  );
  kit.tool(
    'update_meal',
    {
      description:
        'Change a logged meal (find its id with get_nutrition_day). When the food changes, send the new description AND new calories/macros/portions.',
      scope: write,
      kind: 'update',
      input: {
        meal_id: id,
        date: date.optional(),
        meal_type: z.enum(MEAL_TYPES).optional(),
        description: z.string().min(1).max(500).optional(),
        calories: z.number().int().min(0).max(5000).nullable().optional(),
        protein_g: z.number().int().min(0).max(500).nullable().optional(),
        carbs_g: z.number().int().min(0).max(1000).nullable().optional(),
        fat_g: z.number().int().min(0).max(500).nullable().optional(),
        portions: portions.optional(),
      },
    },
    (a) =>
      s.health.updateMeal(
        user,
        a.meal_id,
        parseWith(updateMealSchema, {
          date: a.date,
          mealType: a.meal_type,
          description: a.description,
          calories: a.calories,
          portions: a.portions,
          ...macros(a),
        }),
      ),
  );
  kit.tool(
    'delete_meal',
    {
      description: 'Delete a logged meal.',
      scope: write,
      kind: 'delete',
      input: { meal_id: id },
    },
    (a) => s.health.removeMeal(user, a.meal_id),
  );
  kit.tool(
    'estimate_meal',
    {
      description:
        "Estimate calories, macros and food-group portions of a described meal with the user's AI (does not save).",
      scope: read,
      kind: 'read',
      input: { description: z.string().min(2).max(500) },
    },
    (a) => s.ai.estimateMeal(user, a.description),
  );
  kit.tool(
    'list_diets',
    {
      description: 'Diets the app knows (slug, macros split, rules).',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.health.diets(),
  );
  kit.tool(
    'list_recipes',
    {
      description:
        'Recipes with calories and macros, optionally for a meal type and a diet slug.',
      scope: read,
      kind: 'read',
      input: {
        meal_type: z.enum(MEAL_TYPES).optional(),
        diet: z.string().max(64).optional(),
      },
    },
    (a) => s.health.recipes({ mealType: a.meal_type, diet: a.diet }),
  );
  kit.tool(
    'get_recipe',
    {
      description: 'One recipe with ingredients and steps.',
      scope: read,
      kind: 'read',
      input: { slug: z.string().min(1).max(64) },
    },
    (a) => s.health.recipe(a.slug),
  );
  kit.tool(
    'get_meal_plan',
    {
      description: "The user's current meal plan with recipes per day.",
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.health.currentPlan(user),
  );
  kit.tool(
    'generate_meal_plan',
    {
      description:
        "Plan meals with the app's recipes for the user's diet and calorie target.",
      scope: write,
      kind: 'create',
      input: {
        start_date: date,
        days: z.number().int().min(1).max(7).default(7),
      },
    },
    (a) =>
      s.health.generatePlan(
        user,
        parseWith(generatePlanSchema, {
          startDate: a.start_date,
          days: a.days,
        }),
      ),
  );

  // ---------------------------------------------------------------- fitness
  kit.tool(
    'list_activities',
    {
      description:
        'Activity types (slug, name, category) for logging workouts.',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.health.activities(),
  );
  kit.tool(
    'list_workout_programs',
    {
      description: 'Step-by-step workout programs (gym, TRX, home, walking…).',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.health.programs(),
  );
  kit.tool(
    'list_workouts',
    {
      description: 'Logged workouts between two dates (at most 92 days).',
      scope: read,
      kind: 'read',
      input: { start_date: date, end_date: date },
    },
    (a) => {
      const span = daysBetween(a.start_date, a.end_date);
      if (span < 0 || span > 92)
        throw new BadRequestException('The range covers at most 92 days');
      return s.health.workouts(user, a.start_date, a.end_date);
    },
  );
  kit.tool(
    'get_fitness_week',
    {
      description:
        'Sessions, minutes and calories of the 7 days ending on a date, against 150 minutes a week.',
      scope: read,
      kind: 'read',
      input: { date },
    },
    (a) => s.health.week(user, a.date),
  );
  kit.tool(
    'log_workout',
    {
      description:
        'Log a workout (activity slug from list_activities); calories are calculated from weight and intensity.',
      scope: write,
      kind: 'create',
      input: {
        activity_slug: z.string().min(1).max(32),
        date,
        duration_min: z.number().int().min(1).max(600),
        intensity: z.enum(INTENSITIES).default('MODERATE'),
        distance_km: z.number().min(0).max(300).optional(),
        steps: z.number().int().min(0).max(200_000).optional(),
        notes: z.string().max(1000).optional(),
        program_slug: z.string().max(64).optional(),
      },
    },
    (a) =>
      s.health.logWorkout(
        user,
        parseWith(workoutLogSchema, {
          activitySlug: a.activity_slug,
          programSlug: a.program_slug,
          date: a.date,
          durationMin: a.duration_min,
          intensity: a.intensity,
          distanceKm: a.distance_km,
          steps: a.steps,
          notes: a.notes,
        }),
      ),
  );
  kit.tool(
    'update_workout',
    {
      description:
        'Change a logged workout (id from list_workouts); calories are recalculated.',
      scope: write,
      kind: 'update',
      input: {
        workout_id: id,
        activity_slug: z.string().min(1).max(32).optional(),
        date: date.optional(),
        duration_min: z.number().int().min(1).max(600).optional(),
        intensity: z.enum(INTENSITIES).optional(),
        distance_km: z.number().min(0).max(300).nullable().optional(),
        steps: z.number().int().min(0).max(200_000).nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
      },
    },
    (a) =>
      s.health.updateWorkout(
        user,
        a.workout_id,
        parseWith(updateWorkoutSchema, {
          activitySlug: a.activity_slug,
          date: a.date,
          durationMin: a.duration_min,
          intensity: a.intensity,
          distanceKm: a.distance_km,
          steps: a.steps,
          notes: a.notes,
        }),
      ),
  );
  kit.tool(
    'delete_workout',
    {
      description: 'Delete a logged workout.',
      scope: write,
      kind: 'delete',
      input: { workout_id: id },
    },
    (a) => s.health.removeWorkout(user, a.workout_id),
  );
}
