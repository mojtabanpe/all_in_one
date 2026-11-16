-- AlterTable
ALTER TABLE "progress_notification_settings" ADD COLUMN     "sms" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "sms_notices" (
    "userId" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_notices_pkey" PRIMARY KEY ("userId","kind")
);

-- AddForeignKey
ALTER TABLE "sms_notices" ADD CONSTRAINT "sms_notices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
