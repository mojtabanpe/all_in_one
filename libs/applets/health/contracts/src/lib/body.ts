import * as z from 'zod/mini';

/** Health days are Tehran calendar days, like the planner's. */
export const HEALTH_TIME_ZONE = 'Asia/Tehran';

const tehranDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: HEALTH_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The Tehran calendar day (YYYY-MM-DD) of an instant. */
export function tehranDate(at: Date): string {
  return tehranDay.format(at);
}

/** Whole days from `from` to `to` (YYYY-MM-DD). */
export function daysFromTo(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

// ---------------------------------------------------------------- weight

const weightKg = z.number().check(z.gte(30), z.lte(300));

export const logWeightSchema = z.object({
  date: z.iso.date(),
  weightKg,
});
export type LogWeightInput = z.infer<typeof logWeightSchema>;

/** Both null clears the goal. */
export const weightGoalSchema = z.object({
  targetWeightKg: z.nullable(weightKg),
  targetDate: z.nullable(z.iso.date()),
});
export type WeightGoalInput = z.infer<typeof weightGoalSchema>;

export interface WeightEntry {
  id: string;
  date: string;
  weightKg: number;
}

/**
 * How demanding the goal is: `safe` up to 0.75 kg a week (gain: 0.25), `fast`
 * up to 1 kg (gain: 0.5), `too-fast` beyond; `done` once reached, `overdue`
 * when the date has passed without reaching it.
 */
export type WeightPace = 'safe' | 'fast' | 'too-fast' | 'done' | 'overdue';

export interface WeightPlan {
  /** Positive: kilograms still to lose; negative: to gain. */
  remainingKg: number;
  daysLeft: number;
  /** Weekly change needed to arrive on time (positive = loss). */
  weeklyKg: number;
  /** Daily calories against maintenance (negative = deficit), capped to safe limits. */
  dailyCalories: number;
  pace: WeightPace;
  /** Share of the way from the starting weight to the target, 0–100. */
  progressPct: number;
}

export interface WeightProgress {
  currentKg: number | null;
  startKg: number | null;
  startDate: string | null;
  targetKg: number | null;
  targetDate: string | null;
  plan: WeightPlan | null;
  /** Latest entries first (at most 60). */
  entries: WeightEntry[];
}

/** Energy in one kilogram of body fat (the usual 7,700 kcal estimate). */
const KCAL_PER_KG = 7700;

/** What reaching `targetKg` by `targetDate` asks for, from `currentKg` on `today`. */
export function weightPlan(input: {
  currentKg: number;
  startKg: number;
  targetKg: number;
  today: string;
  targetDate: string;
}): WeightPlan {
  const { currentKg, startKg, targetKg } = input;
  const remainingKg = Math.round((currentKg - targetKg) * 10) / 10;
  const daysLeft = daysFromTo(input.today, input.targetDate);
  const losing = startKg >= targetKg;
  const reached = losing ? currentKg <= targetKg : currentKg >= targetKg;
  const span = startKg - targetKg;
  const progressPct = reached
    ? 100
    : span === 0
      ? 0
      : Math.max(0, Math.min(100, ((startKg - currentKg) / span) * 100));
  if (reached || daysLeft <= 0) {
    return {
      remainingKg: reached ? 0 : remainingKg,
      daysLeft: Math.max(daysLeft, 0),
      weeklyKg: 0,
      dailyCalories: 0,
      pace: reached ? 'done' : 'overdue',
      progressPct: Math.round(progressPct),
    };
  }
  const weeklyKg = Math.round(((remainingKg * 7) / daysLeft) * 100) / 100;
  const rate = Math.abs(weeklyKg);
  const [safe, fast] = losing ? [0.75, 1] : [0.25, 0.5];
  const pace: WeightPace =
    rate <= safe ? 'safe' : rate <= fast ? 'fast' : 'too-fast';
  // Never plan a deficit beyond 1,000 kcal or a surplus beyond 500 kcal a day.
  const daily = (weeklyKg * KCAL_PER_KG) / 7;
  const dailyCalories = -Math.round(
    losing ? Math.min(daily, 1000) : Math.max(daily, -500),
  );
  return {
    remainingKg,
    daysLeft,
    weeklyKg,
    dailyCalories,
    pace,
    progressPct: Math.round(progressPct),
  };
}

// ---------------------------------------------------------------- fasting

/** Common time-restricted eating windows (fasting hours : eating hours). */
export const FASTING_PROTOCOLS = [12, 14, 16, 18, 20, 24] as const;
export const MAX_FAST_HOURS = 72;

const fastHours = z.int().check(z.gte(1), z.lte(MAX_FAST_HOURS));

export const startFastSchema = z.object({
  targetHours: fastHours,
  /** When the fast began; defaults to now. At most 72 hours ago. */
  startedAt: z.optional(z.iso.datetime({ offset: true })),
});
export type StartFastInput = z.infer<typeof startFastSchema>;

export const endFastSchema = z.object({
  endedAt: z.optional(z.iso.datetime({ offset: true })),
});
export type EndFastInput = z.infer<typeof endFastSchema>;

export const updateFastSchema = z.object({
  targetHours: z.optional(fastHours),
  startedAt: z.optional(z.iso.datetime({ offset: true })),
  endedAt: z.optional(z.nullable(z.iso.datetime({ offset: true }))),
});
export type UpdateFastInput = z.infer<typeof updateFastSchema>;

export interface Fast {
  id: string;
  /** ISO instants */
  startedAt: string;
  endedAt: string | null;
  targetHours: number;
}

export interface FastingState {
  active: Fast | null;
  /** Finished fasts, latest first (at most 14). */
  recent: Fast[];
}

/** "16:8" style label for a fasting length (24 hours and more: "۲۴ ساعته"). */
export function fastingProtocolLabel(hours: number): string {
  const fa = (n: number) => n.toLocaleString('fa-IR');
  return hours < 24 ? `${fa(hours)}:${fa(24 - hours)}` : `${fa(hours)} ساعته`;
}

/** Hours a fast lasted (or has lasted so far, at `now`). */
export function fastHoursElapsed(fast: Fast, now: Date): number {
  const end = fast.endedAt ? Date.parse(fast.endedAt) : now.getTime();
  return Math.max(0, (end - Date.parse(fast.startedAt)) / 3_600_000);
}

/** Whether a finished fast reached its target. */
export function fastCompleted(fast: Fast): boolean {
  return (
    !!fast.endedAt && fastHoursElapsed(fast, new Date()) >= fast.targetHours
  );
}
