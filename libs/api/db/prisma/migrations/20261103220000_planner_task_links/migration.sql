-- AlterTable
ALTER TABLE "planner_tasks" ADD COLUMN     "links" TEXT[] DEFAULT ARRAY[]::TEXT[];
