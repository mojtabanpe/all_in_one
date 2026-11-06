-- AlterTable
ALTER TABLE "users" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "onboardingGoal" VARCHAR(16),
ADD COLUMN     "onboardingSkipped" BOOLEAN NOT NULL DEFAULT false;
