-- AlterTable
ALTER TABLE "progress_notification_settings" ADD COLUMN     "dailyTasks" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dailyTasksTime" TEXT NOT NULL DEFAULT '08:30';
