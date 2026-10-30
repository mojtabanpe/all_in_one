ALTER TABLE "planner_habits"
  ADD COLUMN "externalSourceId" VARCHAR(120),
  ADD COLUMN "repeatRule" VARCHAR(500),
  ADD COLUMN "reminders" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX "planner_habits_userId_externalSourceId_key"
  ON "planner_habits"("userId", "externalSourceId");
