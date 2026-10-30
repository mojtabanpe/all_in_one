import * as z from 'zod/mini';

export const SEXES = ['FEMALE', 'MALE'] as const;
export const ACTIVITY_LEVELS = [
  'SEDENTARY',
  'LIGHT',
  'MODERATE',
  'ACTIVE',
  'VERY_ACTIVE',
] as const;
export const HEALTH_GOALS = ['LOSE', 'MAINTAIN', 'GAIN'] as const;
export const DIET_MODES = ['NONE', 'OWN', 'APP_DIET', 'APP_PLAN'] as const;
export type Sex = (typeof SEXES)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type HealthGoal = (typeof HEALTH_GOALS)[number];
export type DietMode = (typeof DIET_MODES)[number];

export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  SEDENTARY: 'کم‌تحرک (پشت میز)',
  LIGHT: 'سبک (۱ تا ۳ روز ورزش)',
  MODERATE: 'متوسط (۳ تا ۵ روز ورزش)',
  ACTIVE: 'فعال (۶ تا ۷ روز ورزش)',
  VERY_ACTIVE: 'خیلی فعال (کار بدنی یا دو جلسه در روز)',
};
export const HEALTH_GOAL_LABELS: Record<HealthGoal, string> = {
  LOSE: 'کاهش وزن',
  MAINTAIN: 'حفظ وزن',
  GAIN: 'افزایش وزن',
};
/** The nutrition onboarding question: "do you follow a diet?" */
export const DIET_MODE_LABELS: Record<DietMode, string> = {
  NONE: 'رژیم خاصی ندارم؛ فقط وعده‌هایم را بسنج',
  OWN: 'رژیم خودم را دارم',
  APP_DIET: 'یکی از رژیم‌های برنامه را انتخاب می‌کنم',
  APP_PLAN: 'برنامه غذایی‌ام را تو بچین (با دستور پخت)',
};

export const healthProfileSchema = z.object({
  excludedIngredients: z.optional(
    z
      .array(z.string().check(z.trim(), z.minLength(1), z.maxLength(80)))
      .check(z.maxLength(30)),
  ),
  sex: z.optional(z.nullable(z.enum(SEXES))),
  birthYear: z.optional(z.nullable(z.int().check(z.gte(1920), z.lte(2020)))),
  heightCm: z.optional(z.nullable(z.int().check(z.gte(100), z.lte(250)))),
  weightKg: z.optional(z.nullable(z.number().check(z.gte(30), z.lte(300)))),
  activityLevel: z.optional(z.enum(ACTIVITY_LEVELS)),
  goal: z.optional(z.enum(HEALTH_GOALS)),
  dietMode: z.optional(z.enum(DIET_MODES)),
  dietSlug: z.optional(z.nullable(z.string().check(z.maxLength(64)))),
  ownDietNotes: z.optional(
    z.nullable(z.string().check(z.trim(), z.maxLength(2000))),
  ),
});
export type HealthProfileInput = z.infer<typeof healthProfileSchema>;

export interface HealthProfile {
  sex: Sex | null;
  birthYear: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel;
  goal: HealthGoal;
  dietMode: DietMode;
  dietSlug: string | null;
  ownDietNotes: string | null;
  excludedIngredients?: string[];
  /** Daily calories, when sex/age/height/weight are known */
  calorieTarget: number | null;
}

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};
const GOAL_ADJUSTMENT: Record<HealthGoal, number> = {
  LOSE: -500,
  MAINTAIN: 0,
  GAIN: 300,
};
const FLOOR: Record<Sex, number> = { FEMALE: 1200, MALE: 1500 };

/**
 * Daily calorie target: Mifflin-St Jeor BMR × activity factor, adjusted for the
 * goal, never below a safe floor (1200 kcal women / 1500 kcal men).
 */
export function calorieTarget(
  p: Pick<
    HealthProfile,
    'sex' | 'birthYear' | 'heightCm' | 'weightKg' | 'activityLevel' | 'goal'
  >,
  year: number,
): number | null {
  if (!p.sex || !p.birthYear || !p.heightCm || !p.weightKg) return null;
  const age = year - p.birthYear;
  const bmr =
    10 * p.weightKg +
    6.25 * p.heightCm -
    5 * age +
    (p.sex === 'MALE' ? 5 : -161);
  const target =
    bmr * ACTIVITY_FACTOR[p.activityLevel] + GOAL_ADJUSTMENT[p.goal];
  return Math.round(Math.max(target, FLOOR[p.sex]) / 10) * 10;
}
