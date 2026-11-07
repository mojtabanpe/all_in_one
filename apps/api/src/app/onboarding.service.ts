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
      established: await this.established(userId),
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

  /** Someone who already used the app (before or outside the guide) does not need a first step. */
  private async established(userId: string): Promise<boolean> {
    const where = { where: { userId }, select: { userId: true } };
    const found = await Promise.all([
      this.prisma.plannerTask.findFirst(where),
      this.prisma.englishCard.findFirst(where),
      this.prisma.englishReviewDay.findFirst(where),
      this.prisma.mealLog.findFirst(where),
      this.prisma.workoutLog.findFirst(where),
    ]);
    return found.some(Boolean);
  }

  /** Only a successful matching action completes the chosen first step. */
  async complete(userId: string, goal: OnboardingGoal): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: {
        id: userId,
        onboardingGoal: goal,
        onboardingSkipped: false,
        onboardingCompletedAt: null,
      },
      data: { onboardingCompletedAt: new Date() },
    });
    return count > 0;
  }
}
