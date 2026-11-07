-- CreateTable
CREATE TABLE "progress_notification_settings" (
    "userId" UUID NOT NULL,
    "firstWeek" BOOLEAN NOT NULL DEFAULT false,
    "weekly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "progress_notification_settings_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "progress_notification_settings" ADD CONSTRAINT "progress_notification_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
