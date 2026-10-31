-- Additive only: existing tasks remain native one-off tasks. No production task is reconciled here.
ALTER TABLE "planner_tasks"
  ADD COLUMN "isSeries" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "repeatRule" VARCHAR(1000),
  ADD COLUMN "repeatFrom" VARCHAR(16) NOT NULL DEFAULT 'SCHEDULE',
  ADD COLUMN "recurrenceEnd" DATE,
  ADD COLUMN "recurrenceTimezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Tehran',
  ADD COLUMN "durationMin" INTEGER,
  ADD COLUMN "seriesId" UUID,
  ADD COLUMN "occurrenceDate" DATE,
  ADD COLUMN "seriesUntil" DATE,
  ADD COLUMN "excludedDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "completionAnchor" DATE,
  ADD COLUMN "completionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "idempotencyKey" VARCHAR(200),
  ADD COLUMN "sourceProvider" VARCHAR(30),
  ADD COLUMN "sourceId" VARCHAR(200);
CREATE UNIQUE INDEX "planner_tasks_seriesId_occurrenceDate_key" ON "planner_tasks"("seriesId", "occurrenceDate");
CREATE UNIQUE INDEX "planner_tasks_userId_idempotencyKey_key" ON "planner_tasks"("userId", "idempotencyKey");
CREATE UNIQUE INDEX "planner_tasks_userId_sourceProvider_sourceId_key" ON "planner_tasks"("userId", "sourceProvider", "sourceId");
CREATE INDEX "planner_tasks_isSeries_listId_idx" ON "planner_tasks"("isSeries", "listId");
ALTER TABLE "planner_tasks" ADD CONSTRAINT "planner_tasks_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "planner_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planner_tasks" ADD CONSTRAINT "planner_tasks_recurrence_shape_check" CHECK (
  ("seriesId" IS NULL AND "occurrenceDate" IS NULL) OR
  ("seriesId" IS NOT NULL AND "occurrenceDate" IS NOT NULL AND NOT "isSeries")
);
ALTER TABLE "planner_tasks" ADD CONSTRAINT "planner_tasks_repeatFrom_check" CHECK ("repeatFrom" IN ('SCHEDULE', 'COMPLETION'));
ALTER TABLE "planner_tasks" ADD CONSTRAINT "planner_tasks_duration_check" CHECK ("durationMin" IS NULL OR "durationMin" BETWEEN 1 AND 10080);
