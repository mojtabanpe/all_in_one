import * as z from 'zod/mini';
import type { CompletedSet } from './coaching';

export const INTENSITIES = ['LOW', 'MODERATE', 'HIGH'] as const;
export type Intensity = (typeof INTENSITIES)[number];
export const INTENSITY_LABELS: Record<Intensity, string> = {
  LOW: 'سبک',
  MODERATE: 'متوسط',
  HIGH: 'شدید',
};

export const ACTIVITY_CATEGORIES = [
  'gym',
  'trx',
  'cardio',
  'home',
  'sport',
  'mind',
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];
export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  gym: 'باشگاه',
  trx: 'TRX',
  cardio: 'هوازی',
  home: 'ورزش در خانه',
  sport: 'رشته‌های ورزشی',
  mind: 'ذهن و بدن',
};

export interface ActivityType {
  slug: string;
  name: string;
  category: ActivityCategory;
  met: number;
  icon: string;
}

export interface ProgramExercise {
  name: string;
  sets?: number;
  reps?: number;
  seconds?: number;
  restSeconds?: number;
  note?: string;
}

export interface WorkoutProgram {
  slug: string;
  title: string;
  activitySlug: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  description: string;
  sessionsPerWeek: number;
  minutes: number;
  exercises: ProgramExercise[];
}

export const workoutLogSchema = z.object({
  activitySlug: z.string().check(z.minLength(1), z.maxLength(32)),
  programSlug: z.optional(z.string().check(z.maxLength(64))),
  date: z.iso.date(),
  durationMin: z.int().check(z.gte(1), z.lte(600)),
  intensity: z._default(z.enum(INTENSITIES), 'MODERATE'),
  distanceKm: z.optional(z.number().check(z.gte(0), z.lte(300))),
  steps: z.optional(z.int().check(z.gte(0), z.lte(200_000))),
  notes: z.optional(z.string().check(z.trim(), z.maxLength(1000))),
});
export type WorkoutLogInput = z.input<typeof workoutLogSchema>;

/** Change a logged workout; calories are recalculated. */
export const updateWorkoutSchema = z.partial(
  z.object({
    activitySlug: z.string().check(z.minLength(1), z.maxLength(32)),
    date: z.iso.date(),
    durationMin: z.int().check(z.gte(1), z.lte(600)),
    intensity: z.enum(INTENSITIES),
    distanceKm: z.nullable(z.number().check(z.gte(0), z.lte(300))),
    steps: z.nullable(z.int().check(z.gte(0), z.lte(200_000))),
    notes: z.nullable(z.string().check(z.trim(), z.maxLength(1000))),
  }),
);
export type UpdateWorkoutInput = z.infer<typeof updateWorkoutSchema>;

export interface WorkoutLog {
  id: string;
  activitySlug: string;
  activityName: string;
  programSlug: string | null;
  routineId?: string | null;
  completedSets?: CompletedSet[];
  date: string;
  durationMin: number;
  intensity: Intensity;
  distanceKm: number | null;
  steps: number | null;
  calories: number | null;
  notes: string | null;
}

export interface FitnessWeek {
  from: string;
  to: string;
  sessions: number;
  minutes: number;
  calories: number;
  /** WHO: 150 min of moderate activity per week */
  goalMinutes: number;
}

const INTENSITY_FACTOR: Record<Intensity, number> = {
  LOW: 0.8,
  MODERATE: 1,
  HIGH: 1.2,
};

/** kcal ≈ MET × kg × hours, scaled by intensity. Needs the user's weight. */
export function workoutCalories(
  met: number,
  weightKg: number | null,
  minutes: number,
  intensity: Intensity,
): number | null {
  if (!weightKg) return null;
  return Math.round(
    met * INTENSITY_FACTOR[intensity] * weightKg * (minutes / 60),
  );
}
