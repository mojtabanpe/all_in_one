ALTER TABLE "planner_tasks"
  ADD COLUMN "externalSourceId" VARCHAR(120),
  ADD COLUMN "recurrenceRule" VARCHAR(500),
  ADD COLUMN "reminders" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "timeZone" VARCHAR(80),
  ADD COLUMN "endTime" VARCHAR(5);

CREATE UNIQUE INDEX "planner_tasks_userId_externalSourceId_key"
  ON "planner_tasks"("userId", "externalSourceId");
