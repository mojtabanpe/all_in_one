import { Injectable } from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import {
  onboardingGoalSchema,
  type OnboardingGoal,
  type OnboardingInput,
  type OnboardingState,
} from '@all-in-one/shared/schemas';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async state(userId: string): Promise<OnboardingState> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        onboardingGoal: true,
        onboardingSkipped: true,
        onboardingCompletedAt: true,
      },
    });
    const goal = onboardingGoalSchema.safeParse(user.onboardingGoal);
    return {
      goal: goal.success ? goal.data : null,
      skipped: user.onboardingSkipped,
      completed: !!user.onboardingCompletedAt,
    };
  }

  async choose(
    userId: string,
    input: OnboardingInput,
  ): Promise<OnboardingState> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        onboardingGoal: input.goal,
        onboardingSkipped: input.goal === null,
        onboardingCompletedAt: null,
      },
    });
    return this.state(userId);
  }

  /** Only a successful matching action completes the chosen first step. */
  async complete(userId: string, goal: OnboardingGoal): Promise<void> {
    await this.prisma.user.updateMany({
      where: {
        id: userId,
        onboardingGoal: goal,
        onboardingSkipped: false,
        onboardingCompletedAt: null,
      },
      data: { onboardingCompletedAt: new Date() },
    });
  }
}
