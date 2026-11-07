import * as z from 'zod/mini';

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
