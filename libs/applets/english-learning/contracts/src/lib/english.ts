import * as z from 'zod/mini';

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const REVIEW_GRADES = ['again', 'hard', 'good', 'easy'] as const;
export type ReviewGrade = (typeof REVIEW_GRADES)[number];
export const REVIEW_GRADE_LABELS: Record<ReviewGrade, string> = {
  again: 'بلد نبودم',
  hard: 'سخت بود',
  good: 'بلد بودم',
  easy: 'خیلی آسان',
};

/** Leitner boxes 1–5; box 5 + correct answer = mastered. */
export const MAX_BOX = 5;
/** Days until the next review, by box. */
export const BOX_INTERVAL_DAYS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 8,
  5: 16,
};
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export interface ReviewOutcome {
  box: number;
  dueAt: Date;
  lapse: boolean;
}

/**
 * Leitner scheduling. "again" sends the word back to box 1 and shows it again
 * in 10 minutes; "hard" keeps the box with half the interval; "good" moves up
 * one box; "easy" moves up two.
 */
export function scheduleReview(
  box: number,
  grade: ReviewGrade,
  now: Date,
): ReviewOutcome {
  const current = Math.min(Math.max(box, 1), MAX_BOX);
  switch (grade) {
    case 'again':
      return {
        box: 1,
        dueAt: new Date(now.getTime() + 10 * MINUTE),
        lapse: true,
      };
    case 'hard':
      return {
        box: current,
        dueAt: new Date(
          now.getTime() + Math.max(BOX_INTERVAL_DAYS[current] / 2, 0.5) * DAY,
        ),
        lapse: false,
      };
    case 'good':
    case 'easy': {
      const next = Math.min(current + (grade === 'easy' ? 2 : 1), MAX_BOX);
      return {
        box: next,
        dueAt: new Date(now.getTime() + BOX_INTERVAL_DAYS[next] * DAY),
        lapse: false,
      };
    }
  }
}

export const reviewSchema = z.object({ grade: z.enum(REVIEW_GRADES) });
export type ReviewInput = z.infer<typeof reviewSchema>;

export const createWordSchema = z.object({
  term: z.string().check(z.trim(), z.minLength(1), z.maxLength(80)),
  meaningFa: z.string().check(z.trim(), z.minLength(1), z.maxLength(200)),
  partOfSpeech: z.optional(z.string().check(z.trim(), z.maxLength(20))),
  example: z.optional(z.string().check(z.trim(), z.maxLength(300))),
  exampleFa: z.optional(z.string().check(z.trim(), z.maxLength(300))),
});
export type CreateWordInput = z.infer<typeof createWordSchema>;

export interface EnglishDeckSummary {
  slug: string;
  title: string;
  description: string;
  level: CefrLevel;
  wordCount: number;
  /** Words of this deck the user has started */
  started: number;
  /** Words in the last box */
  mastered: number;
}

export interface ReviewCard {
  wordId: string;
  term: string;
  phonetic: string | null;
  partOfSpeech: string | null;
  meaningFa: string;
  example: string | null;
  exampleFa: string | null;
  box: number;
}

export interface EnglishStats {
  dueNow: number;
  learning: number;
  mastered: number;
  reviewedToday: number;
  /** Consecutive days with at least one review, ending today or yesterday */
  streakDays: number;
}

/** Streak from review days (YYYY-MM-DD, any order), counted back from `today`. */
export function streakFrom(days: readonly string[], today: string): number {
  const set = new Set(days);
  const cursor = new Date(`${today}T00:00:00Z`);
  if (!set.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
