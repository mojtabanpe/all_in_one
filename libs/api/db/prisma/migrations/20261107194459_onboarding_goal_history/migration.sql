BEGIN;

-- CreateTable
CREATE TABLE "onboarding_goal_changes" (
    "id" SERIAL NOT NULL,
    "userId" UUID NOT NULL,
    "goal" VARCHAR(16),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_goal_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_goal_changes_userId_id_idx" ON "onboarding_goal_changes"("userId", "id");

-- AddForeignKey
ALTER TABLE "onboarding_goal_changes" ADD CONSTRAINT "onboarding_goal_changes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the known state at migration; earlier choices cannot be reconstructed.
INSERT INTO "onboarding_goal_changes" ("userId", "goal")
SELECT "id", CASE WHEN "onboardingSkipped" THEN NULL ELSE "onboardingGoal" END
FROM "users"
WHERE "onboardingSkipped" OR "onboardingGoal" IN ('planner', 'english', 'health');

COMMIT;
