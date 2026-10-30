import type {
  HealthService,
  TrainingService,
} from '@all-in-one/applets/health/api';
import {
  EQUIPMENT,
  generateRoutineSchema,
  saveRoutineSchema,
  logSessionSchema,
  swapPlanMealSchema,
  exerciseFilterSchema,
} from '@all-in-one/applets/health/contracts';
import * as z from 'zod';
import { parseWith, type ToolSink } from './tool-kit';

/** Native applet tools shared by MCP and the in-app assistant; no upstream platform. */
export function healthCoachTools(
  kit: ToolSink,
  s: { training: TrainingService; health: HealthService },
) {
  const user = kit.user;
  const read = 'health:read' as const,
    write = 'health:write' as const;
  const id = z.uuid();
  kit.tool(
    'search_exercises',
    {
      description:
        'Search our exercise catalog by Persian name or slug, equipment (including trx), muscle or level. Includes optional video links.',
      scope: read,
      kind: 'read',
      input: z.fromJSONSchema(z.toJSONSchema(exerciseFilterSchema)),
    },
    (a) => s.training.exercises(parseWith(exerciseFilterSchema, a)),
  );
  kit.tool(
    'get_exercise',
    {
      description:
        'Exercise instructions, common mistakes, muscles, equipment and optional video.',
      scope: read,
      kind: 'read',
      input: { slug: z.string().min(1).max(64) },
    },
    (a) => s.training.exercise(a.slug),
  );
  kit.tool(
    'get_exercise_alternatives',
    {
      description:
        'Alternative exercises for the same primary muscle, optionally limited to equipment.',
      scope: read,
      kind: 'read',
      input: {
        slug: z.string().min(1).max(64),
        equipment: z.enum(EQUIPMENT).optional(),
      },
    },
    (a) => s.training.alternatives(a.slug, a.equipment),
  );
  kit.tool(
    'list_training_routines',
    {
      description: 'Your saved personal training routines.',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.training.routines(user),
  );
  kit.tool(
    'get_training_routine',
    {
      description:
        'One personal routine with warmup, days, sets, reps, rest, cooldown and progression guidance.',
      scope: read,
      kind: 'read',
      input: { routine_id: id },
    },
    (a) => s.training.routine(user, a.routine_id),
  );
  kit.tool(
    'generate_training_routine',
    {
      description:
        'Build and save an equipment-aware training template for home, TRX or gym. Inputs use camelCase. Does not require an external AI service. Space sessions of the same muscles apart.',
      scope: write,
      kind: 'create',
      input: z.fromJSONSchema(z.toJSONSchema(generateRoutineSchema)),
    },
    (a) => s.training.generate(user, parseWith(generateRoutineSchema, a)),
  );
  kit.tool(
    'create_training_routine',
    {
      description:
        'Save a custom routine using exercise slugs from search_exercises, with sets, reps, seconds and restSeconds. Inputs use camelCase.',
      scope: write,
      kind: 'create',
      input: z.fromJSONSchema(z.toJSONSchema(saveRoutineSchema)),
    },
    (a) => s.training.save(user, parseWith(saveRoutineSchema, a)),
  );
  kit.tool(
    'update_training_routine',
    {
      description:
        'Replace a personal routine. Read it first and supply the complete routine in data.',
      scope: write,
      kind: 'update',
      input: {
        routine_id: id,
        data: z.fromJSONSchema(z.toJSONSchema(saveRoutineSchema)),
      },
    },
    (a) =>
      s.training.save(user, parseWith(saveRoutineSchema, a.data), a.routine_id),
  );
  kit.tool(
    'delete_training_routine',
    {
      description: 'Delete your saved routine; previous session logs remain.',
      scope: write,
      kind: 'delete',
      input: { routine_id: id },
    },
    (a) => s.training.remove(user, a.routine_id),
  );
  kit.tool(
    'log_training_session',
    {
      description:
        'Record actual completed sets for a routine day (zero-based dayIndex). Only use repetitions, seconds and weights reported by the user; do not log planned sets as completed. Inputs use camelCase.',
      scope: write,
      kind: 'create',
      input: z.fromJSONSchema(z.toJSONSchema(logSessionSchema)),
    },
    (a) => s.training.logSession(user, parseWith(logSessionSchema, a)),
  );
  kit.tool(
    'get_training_progress',
    {
      description:
        'Actual sets, load volume, best weights, history and primary-muscle coverage over at most 92 days. Load volume excludes bodyweight.',
      scope: read,
      kind: 'read',
      input: { from: z.iso.date(), to: z.iso.date() },
    },
    (a) => s.training.progress(user, a.from, a.to),
  );
  kit.tool(
    'suggest_diets',
    {
      description:
        'Compare starting diet options based on your goal; suggestions do not automatically change your diet.',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.health.suggestions(user),
  );
  kit.tool(
    'get_shopping_list',
    {
      description:
        'Shopping list for the current meal plan; each ingredient shows its original per-serving amount and total serving multiplier.',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.health.planShopping(user),
  );
  kit.tool(
    'swap_meal_plan_meal',
    {
      description:
        'Replace a planned meal with a recipe compatible with its meal type, plan diet and current excluded ingredients. Inputs use camelCase.',
      scope: write,
      kind: 'update',
      input: z.fromJSONSchema(z.toJSONSchema(swapPlanMealSchema)),
    },
    (a) => s.health.swapPlanMeal(user, parseWith(swapPlanMealSchema, a)),
  );
}
