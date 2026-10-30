-- Planner TickTick parity (directive 23): lists, sections, folders, tags, checklist,
-- comments, members, trash, habits, focus records, calendars, countdowns.

-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('TASK', 'NOTE');

-- CreateEnum
CREATE TYPE "ListRole" AS ENUM ('OWNER', 'EDITOR');

-- CreateEnum
CREATE TYPE "FocusKind" AS ENUM ('POMODORO', 'STOPWATCH');

-- CreateEnum
CREATE TYPE "CountdownKind" AS ENUM ('COUNTDOWN', 'ANNIVERSARY', 'BIRTHDAY', 'HOLIDAY');



-- CreateTable
CREATE TABLE "planner_folders" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planner_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planner_lists" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(16) NOT NULL DEFAULT 'sky',
    "isInbox" BOOLEAN NOT NULL DEFAULT false,
    "folderId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planner_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planner_list_members" (
    "listId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "ListRole" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planner_list_members_pkey" PRIMARY KEY ("listId","userId")
);

-- CreateTable
CREATE TABLE "planner_sections" (
    "id" UUID NOT NULL,
    "listId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "planner_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planner_checklist_items" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "planner_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planner_tags" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "color" VARCHAR(16) NOT NULL DEFAULT 'slate',

    CONSTRAINT "planner_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planner_task_tags" (
    "taskId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "planner_task_tags_pkey" PRIMARY KEY ("taskId","tagId")
);

-- CreateTable
CREATE TABLE "planner_comments" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planner_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planner_habit_sections" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "planner_habit_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planner_habits" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sectionId" UUID,
    "name" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(40) NOT NULL DEFAULT 'lucideSparkles',
    "color" VARCHAR(16) NOT NULL DEFAULT 'sage',
    "goal" INTEGER NOT NULL DEFAULT 1,
    "unit" VARCHAR(20) NOT NULL DEFAULT '',
    "weekdays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planner_habits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planner_habit_checkins" (
    "habitId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "planner_habit_checkins_pkey" PRIMARY KEY ("habitId","date")
);

-- CreateTable
CREATE TABLE "planner_focuses" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "taskId" UUID,
    "kind" "FocusKind" NOT NULL DEFAULT 'POMODORO',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "note" VARCHAR(1000) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planner_focuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planner_calendars" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "url" VARCHAR(2000) NOT NULL,
    "color" VARCHAR(16) NOT NULL DEFAULT 'violet',
    "lastFetchedAt" TIMESTAMP(3),
    "lastError" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planner_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planner_countdowns" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "date" DATE NOT NULL,
    "kind" "CountdownKind" NOT NULL DEFAULT 'COUNTDOWN',
    "repeatYearly" BOOLEAN NOT NULL DEFAULT false,
    "color" VARCHAR(16) NOT NULL DEFAULT 'rose',
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planner_countdowns_pkey" PRIMARY KEY ("id")
);

-- Data: tasks move into lists named after their old areas (one list per user and area).
ALTER TABLE "planner_lists" ADD COLUMN "legacyArea" VARCHAR(32);
INSERT INTO "planner_lists" ("id", "ownerId", "name", "color", "legacyArea", "updatedAt")
SELECT gen_random_uuid(), t."userId",
  CASE t."area" WHEN 'personal' THEN 'شخصی' WHEN 'work' THEN 'کار' WHEN 'health' THEN 'سلامت'
    WHEN 'learning' THEN 'یادگیری' WHEN 'home' THEN 'خانه' ELSE t."area" END,
  CASE t."area" WHEN 'work' THEN 'violet' WHEN 'health' THEN 'rose' WHEN 'learning' THEN 'amber'
    WHEN 'home' THEN 'sage' ELSE 'sky' END,
  t."area", CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "userId", "area" FROM "planner_tasks") t;
INSERT INTO "planner_list_members" ("listId", "userId", "role")
SELECT "id", "ownerId", 'OWNER' FROM "planner_lists";

ALTER TABLE "planner_tasks"
ADD COLUMN     "assigneeId" UUID,
ADD COLUMN     "content" VARCHAR(10000) NOT NULL DEFAULT '',
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "kind" "TaskKind" NOT NULL DEFAULT 'TASK',
ADD COLUMN     "listId" UUID,
ADD COLUMN     "sectionId" UUID,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "date" DROP NOT NULL,
ALTER COLUMN "priority" SET DEFAULT 'NONE';

UPDATE "planner_tasks" t SET "content" = COALESCE(t."notes", ''), "listId" = l."id"
FROM "planner_lists" l WHERE l."ownerId" = t."userId" AND l."legacyArea" = t."area";

ALTER TABLE "planner_tasks" ALTER COLUMN "listId" SET NOT NULL,
DROP COLUMN "area",
DROP COLUMN "notes";
ALTER TABLE "planner_lists" DROP COLUMN "legacyArea";

-- CreateIndex
CREATE INDEX "planner_folders_userId_idx" ON "planner_folders"("userId");

-- CreateIndex
CREATE INDEX "planner_lists_ownerId_idx" ON "planner_lists"("ownerId");

-- CreateIndex
CREATE INDEX "planner_list_members_userId_idx" ON "planner_list_members"("userId");

-- CreateIndex
CREATE INDEX "planner_sections_listId_idx" ON "planner_sections"("listId");

-- CreateIndex
CREATE INDEX "planner_checklist_items_taskId_idx" ON "planner_checklist_items"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "planner_tags_userId_name_key" ON "planner_tags"("userId", "name");

-- CreateIndex
CREATE INDEX "planner_task_tags_tagId_idx" ON "planner_task_tags"("tagId");

-- CreateIndex
CREATE INDEX "planner_comments_taskId_idx" ON "planner_comments"("taskId");

-- CreateIndex
CREATE INDEX "planner_habit_sections_userId_idx" ON "planner_habit_sections"("userId");

-- CreateIndex
CREATE INDEX "planner_habits_userId_idx" ON "planner_habits"("userId");

-- CreateIndex
CREATE INDEX "planner_focuses_userId_startAt_idx" ON "planner_focuses"("userId", "startAt");

-- CreateIndex
CREATE INDEX "planner_calendars_userId_idx" ON "planner_calendars"("userId");

-- CreateIndex
CREATE INDEX "planner_countdowns_userId_idx" ON "planner_countdowns"("userId");

-- CreateIndex
CREATE INDEX "planner_tasks_listId_status_idx" ON "planner_tasks"("listId", "status");

-- CreateIndex
CREATE INDEX "planner_tasks_assigneeId_idx" ON "planner_tasks"("assigneeId");

-- AddForeignKey
ALTER TABLE "planner_folders" ADD CONSTRAINT "planner_folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_lists" ADD CONSTRAINT "planner_lists_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_lists" ADD CONSTRAINT "planner_lists_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "planner_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_list_members" ADD CONSTRAINT "planner_list_members_listId_fkey" FOREIGN KEY ("listId") REFERENCES "planner_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_list_members" ADD CONSTRAINT "planner_list_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_sections" ADD CONSTRAINT "planner_sections_listId_fkey" FOREIGN KEY ("listId") REFERENCES "planner_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_tasks" ADD CONSTRAINT "planner_tasks_listId_fkey" FOREIGN KEY ("listId") REFERENCES "planner_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_tasks" ADD CONSTRAINT "planner_tasks_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "planner_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_tasks" ADD CONSTRAINT "planner_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_checklist_items" ADD CONSTRAINT "planner_checklist_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "planner_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_tags" ADD CONSTRAINT "planner_tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_task_tags" ADD CONSTRAINT "planner_task_tags_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "planner_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_task_tags" ADD CONSTRAINT "planner_task_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "planner_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_comments" ADD CONSTRAINT "planner_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "planner_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_comments" ADD CONSTRAINT "planner_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_habit_sections" ADD CONSTRAINT "planner_habit_sections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_habits" ADD CONSTRAINT "planner_habits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_habits" ADD CONSTRAINT "planner_habits_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "planner_habit_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_habit_checkins" ADD CONSTRAINT "planner_habit_checkins_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "planner_habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_focuses" ADD CONSTRAINT "planner_focuses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_focuses" ADD CONSTRAINT "planner_focuses_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "planner_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_calendars" ADD CONSTRAINT "planner_calendars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_countdowns" ADD CONSTRAINT "planner_countdowns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

