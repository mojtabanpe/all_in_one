import * as z from 'zod/mini';
import { GROWTH_CLIENTS } from './growth';

export const ONBOARDING_COMPLETED_HEADER = 'X-Poshtetgarm-Onboarding-Completed';

export const onboardingGoalSchema = z.enum(['planner', 'english', 'health']);
export type OnboardingGoal = z.infer<typeof onboardingGoalSchema>;
/** Null skips the guide; selecting a goal reopens it. */
export const onboardingInputSchema = z.strictObject({
  goal: z.nullable(onboardingGoalSchema),
});
export type OnboardingInput = z.infer<typeof onboardingInputSchema>;
export interface OnboardingState {
  goal: OnboardingGoal | null;
  skipped: boolean;
  completed: boolean;
  /** The account already has its own tasks, cards or health logs: no first-step guide. */
  established: boolean;
}

/** The app or browser the first-step page opened in, kept once on the account (directive 165). */
export const onboardingSourceSchema = z.strictObject({
  client: z.enum(GROWTH_CLIENTS),
});
export type OnboardingSourceInput = z.infer<typeof onboardingSourceSchema>;
