import { onboardingGoalSchema, type OnboardingGoal } from './onboarding';

export const LANDING_GOAL_COOKIE = 'aio_landing_goal';
export const LANDING_PATHS: Record<OnboardingGoal, string> = {
  english: '/daily-english',
  planner: '/daily-planner',
  health: '/health-tracking',
};
export const GOAL_APP_PATHS: Record<OnboardingGoal, string> = {
  english: '/english',
  planner: '/planner',
  health: '/health',
};
export function landingGoalForPath(path: string): OnboardingGoal | null {
  const slug = path.replace(/\/$/, '');
  if (['/daily-english', '/leitner-flashcards'].includes(slug))
    return 'english';
  if (['/daily-planner', '/habit-building'].includes(slug)) return 'planner';
  if (['/health-tracking', '/home-workout'].includes(slug)) return 'health';
  return null;
}
/** Explicit choice and campaign intent beat a previous visit. Never infer from the social platform alone. */
export function resolveLandingGoal(
  params: { get(key: string): string | null },
  remembered?: string | null,
): OnboardingGoal | null {
  if (params.get('view') === 'all') return null;
  const explicit = onboardingGoalSchema.safeParse(params.get('goal'));
  if (explicit.success) return explicit.data;
  const campaign = (params.get('utm_campaign') ?? '').toLowerCase();
  const tokens = campaign.split(/[^a-z0-9]+/);
  if (tokens.some((t) => ['english', 'flashcards', 'leitner'].includes(t)))
    return 'english';
  if (
    tokens.some((t) =>
      ['planner', 'plan', 'habit', 'habits', 'planning'].includes(t),
    )
  )
    return 'planner';
  if (
    tokens.some((t) =>
      ['health', 'workout', 'fitness', 'nutrition'].includes(t),
    )
  )
    return 'health';
  const previous = onboardingGoalSchema.safeParse(remembered);
  return previous.success ? previous.data : null;
}
