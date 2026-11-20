-- AlterTable
ALTER TABLE "progress_notification_settings" ALTER COLUMN "firstWeek" SET DEFAULT true,
ALTER COLUMN "weekly" SET DEFAULT true,
ALTER COLUMN "dailyTasks" SET DEFAULT true;

-- AlterTable
ALTER TABLE "review_reminder_settings" ALTER COLUMN "enabled" SET DEFAULT true;

-- CreateTable
CREATE TABLE "local_reminder_devices" (
    "userId" UUID NOT NULL,
    "client" VARCHAR(16) NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminders" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "local_reminder_devices_pkey" PRIMARY KEY ("userId","client")
);

-- CreateIndex
CREATE INDEX "local_reminder_devices_lastAt_idx" ON "local_reminder_devices"("lastAt");

-- AddForeignKey
ALTER TABLE "local_reminder_devices" ADD CONSTRAINT "local_reminder_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
