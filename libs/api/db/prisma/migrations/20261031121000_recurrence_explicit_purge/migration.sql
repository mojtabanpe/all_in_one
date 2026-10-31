-- Explicit permanent deletion of a series also purges its snapshots, just as deleting a list does.
-- Ordinary recurrence edits and completions never delete historical rows.
ALTER TABLE "planner_tasks" DROP CONSTRAINT "planner_tasks_seriesId_fkey";
ALTER TABLE "planner_tasks" ADD CONSTRAINT "planner_tasks_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "planner_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
