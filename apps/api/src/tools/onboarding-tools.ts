import type { OnboardingGoal } from '@all-in-one/shared/schemas';
import type { OnboardingService } from '../app/onboarding.service';
import type { ToolSink } from './tool-kit';

/** The assistant and MCP complete the same first steps as the HTTP interface. */
export function observeFirstActions(
  sink: ToolSink,
  onboarding: OnboardingService,
): ToolSink {
  const goals: Record<string, OnboardingGoal> = {
    create_task: 'planner',
    review_card: 'english',
    log_meal: 'health',
    log_workout: 'health',
  };
  return {
    user: sink.user,
    tool: (name, spec, run) =>
      sink.tool(name, spec, async (args) => {
        const result = await run(args);
        const goal = goals[name];
        if (goal) {
          // Progress failure must never turn a saved tool action into an error/retry.
          try {
            await onboarding.complete(sink.user, goal);
          } catch {
            /* best effort */
          }
        }
        return result;
      }),
  };
}
