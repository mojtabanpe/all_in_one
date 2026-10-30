import * as z from 'zod/mini';
import type { WorkoutLog } from './fitness';

export const EQUIPMENT = [
  'bodyweight',
  'trx',
  'dumbbell',
  'barbell',
  'cable',
  'machine',
  'band',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];
export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  bodyweight: 'بدون وسیله',
  trx: 'TRX',
  dumbbell: 'دمبل',
  barbell: 'هالتر',
  cable: 'سیم‌کش',
  machine: 'دستگاه',
  band: 'کش',
};
export const MUSCLES = [
  'legs',
  'glutes',
  'back',
  'chest',
  'shoulders',
  'arms',
  'core',
  'cardio',
] as const;
export type Muscle = (typeof MUSCLES)[number];
export const MUSCLE_LABELS: Record<Muscle, string> = {
  legs: 'پا',
  glutes: 'باسن',
  back: 'پشت',
  chest: 'سینه',
  shoulders: 'سرشانه',
  arms: 'بازو',
  core: 'مرکز بدن',
  cardio: 'هوازی',
};
export const TRAINING_LEVELS = [
  'beginner',
  'intermediate',
  'advanced',
] as const;
export const TRAINING_GOALS = [
  'strength',
  'muscle',
  'fitness',
  'weight_loss',
] as const;
export type TrainingGoal = (typeof TRAINING_GOALS)[number];
export const TRAINING_GOAL_LABELS: Record<TrainingGoal, string> = {
  strength: 'قدرت',
  muscle: 'عضله‌سازی',
  fitness: 'آمادگی عمومی',
  weight_loss: 'کاهش وزن',
};
export interface Exercise {
  slug: string;
  name: string;
  equipment: Equipment;
  muscle: Muscle;
  secondaryMuscles: Muscle[];
  level: (typeof TRAINING_LEVELS)[number];
  instructions: string[];
  mistakes: string[];
  alternatives: string[];
  videoUrl: string | null;
  timed: boolean;
}
export const exerciseFilterSchema = z.object({
  search: z.optional(z.string().check(z.trim(), z.maxLength(100))),
  equipment: z.optional(z.enum(EQUIPMENT)),
  muscle: z.optional(z.enum(MUSCLES)),
  level: z.optional(z.enum(TRAINING_LEVELS)),
});
export type ExerciseFilter = z.infer<typeof exerciseFilterSchema>;
export const exerciseVideoSchema = z.object({
  videoUrl: z.nullable(
    z.url().check(
      z.maxLength(2000),
      z.refine(
        (url) => url.startsWith('https://'),
        'نشانی ویدئو باید HTTPS باشد',
      ),
    ),
  ),
});
export const generateRoutineSchema = z.object({
  title: z.string().check(z.trim(), z.minLength(1), z.maxLength(120)),
  goal: z.enum(TRAINING_GOALS),
  level: z.enum(TRAINING_LEVELS),
  equipment: z.array(z.enum(EQUIPMENT)).check(z.minLength(1), z.maxLength(7)),
  daysPerWeek: z.int().check(z.gte(2), z.lte(6)),
  weeks: z.int().check(z.gte(1), z.lte(12)),
  minutes: z.int().check(z.gte(20), z.lte(90)),
});
export type GenerateRoutineInput = z.infer<typeof generateRoutineSchema>;
export const routineExerciseSchema = z.object({
  exerciseSlug: z.string().check(z.minLength(1), z.maxLength(64)),
  sets: z.int().check(z.gte(1), z.lte(8)),
  reps: z.int().check(z.gte(1), z.lte(50)),
  seconds: z.int().check(z.gte(0), z.lte(300)),
  restSeconds: z.int().check(z.gte(15), z.lte(300)),
});
export type RoutineExercise = z.infer<typeof routineExerciseSchema>;
export const routineDaySchema = z.object({
  title: z.string().check(z.trim(), z.minLength(1), z.maxLength(120)),
  exercises: z
    .array(routineExerciseSchema)
    .check(z.minLength(1), z.maxLength(12)),
});
export type RoutineDay = z.infer<typeof routineDaySchema>;
export const saveRoutineSchema = z
  .extend(generateRoutineSchema, {
    days: z.array(routineDaySchema).check(z.minLength(2), z.maxLength(6)),
  })
  .check(
    z.refine(
      (v) => v.days.length === v.daysPerWeek,
      'تعداد جلسه‌ها با روزهای هفته برابر نیست',
    ),
  );
export type SaveRoutineInput = z.infer<typeof saveRoutineSchema>;
export interface WorkoutRoutine extends GenerateRoutineInput {
  id: string;
  days: RoutineDay[];
  warmup: string[];
  cooldown: string[];
  progression: string[];
}
export const completedSetSchema = z
  .object({
    exerciseSlug: z.string().check(z.minLength(1), z.maxLength(64)),
    reps: z.int().check(z.gte(0), z.lte(100)),
    weightKg: z.number().check(z.gte(0), z.lte(500)),
    seconds: z.int().check(z.gte(0), z.lte(3600)),
  })
  .check(
    z.refine((s) => s.reps > 0 || s.seconds > 0, 'تکرار یا زمان را وارد کنید'),
  );
export type CompletedSet = z.infer<typeof completedSetSchema>;
export const logSessionSchema = z.object({
  routineId: z.uuid(),
  dayIndex: z.int().check(z.gte(0), z.lte(5)),
  date: z.iso.date(),
  durationMin: z.int().check(z.gte(1), z.lte(600)),
  sets: z.array(completedSetSchema).check(z.minLength(1), z.maxLength(96)),
  notes: z.optional(z.string().check(z.trim(), z.maxLength(1000))),
});
export type LogSessionInput = z.infer<typeof logSessionSchema>;
export interface TrainingProgress {
  from: string;
  to: string;
  sessions: number;
  totalSets: number;
  volumeKg: number;
  muscles: { muscle: Muscle; sets: number }[];
  exercises: {
    exerciseSlug: string;
    sets: number;
    bestWeightKg: number;
    volumeKg: number;
    history: { date: string; weightKg: number; reps: number }[];
  }[];
}
export type TrainingSession = WorkoutLog & {
  routineId: string | null;
  completedSets: CompletedSet[];
};

/** Deterministic, equipment-aware template; no external service or AI required. */
export function buildRoutine(
  input: GenerateRoutineInput,
  catalog: readonly Exercise[],
): RoutineDay[] {
  const ranks = { beginner: 0, intermediate: 1, advanced: 2 };
  const suitable = catalog.filter(
    (e) => ranks[e.level] <= ranks[input.level] && e.muscle !== 'cardio',
  );
  const chosen = suitable.filter((e) => input.equipment.includes(e.equipment));
  // Everyone has their own body: bodyweight moves fill groups the chosen equipment can't cover.
  const fallback = suitable.filter((e) => e.equipment === 'bodyweight');
  const count = Math.min(6, Math.max(3, Math.floor((input.minutes - 8) / 5)));
  const sets = input.level === 'beginner' ? 2 : 3;
  const muscleOrder: Muscle[] = [
    'legs',
    'back',
    'chest',
    'glutes',
    'shoulders',
    'core',
    'arms',
  ];
  return Array.from({ length: input.daysPerWeek }, (_, day) => {
    const selected: Exercise[] = [];
    for (const muscle of muscleOrder) {
      const own = chosen.filter((e) => e.muscle === muscle);
      const options = own.length
        ? own
        : fallback.filter((e) => e.muscle === muscle);
      if (options.length) selected.push(options[day % options.length]);
      if (selected.length >= count) break;
    }
    // Few groups covered: add a second move per group from the chosen equipment.
    for (const e of chosen) {
      if (selected.length >= count) break;
      if (!selected.includes(e)) selected.push(e);
    }
    if (!selected.length) throw new Error('حرکتی برای ساخت برنامه پیدا نشد.');
    return {
      title: `جلسه ${(day + 1).toLocaleString('fa-IR')}`,
      exercises: selected.map((e) => ({
        exerciseSlug: e.slug,
        sets,
        reps: e.timed
          ? 1
          : input.goal === 'strength'
            ? 6
            : input.goal === 'muscle'
              ? 10
              : 12,
        seconds: e.timed ? 25 : 0,
        restSeconds: input.goal === 'strength' ? 120 : 60,
      })),
    };
  });
}

export function trainingProgress(
  logs: readonly TrainingSession[],
  catalog: readonly Exercise[],
  from: string,
  to: string,
): TrainingProgress {
  const groups = new Map<string, TrainingProgress['exercises'][number]>();
  const muscles = new Map<Muscle, number>();
  let totalSets = 0,
    volumeKg = 0;
  for (const log of [...logs].sort((a, b) => a.date.localeCompare(b.date)))
    for (const set of log.completedSets) {
      const entry = groups.get(set.exerciseSlug) ?? {
        exerciseSlug: set.exerciseSlug,
        sets: 0,
        bestWeightKg: 0,
        volumeKg: 0,
        history: [],
      };
      entry.sets++;
      entry.bestWeightKg = Math.max(entry.bestWeightKg, set.weightKg);
      entry.volumeKg += set.reps * set.weightKg;
      entry.history.push({
        date: log.date,
        weightKg: set.weightKg,
        reps: set.reps,
      });
      groups.set(set.exerciseSlug, entry);
      totalSets++;
      volumeKg += set.reps * set.weightKg;
      const exercise = catalog.find((e) => e.slug === set.exerciseSlug);
      if (exercise)
        muscles.set(exercise.muscle, (muscles.get(exercise.muscle) ?? 0) + 1);
    }
  return {
    from,
    to,
    sessions: logs.filter((l) => l.completedSets.length > 0).length,
    totalSets,
    volumeKg,
    muscles: [...muscles].map(([muscle, sets]) => ({ muscle, sets })),
    exercises: [...groups.values()],
  };
}
