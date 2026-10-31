CREATE TABLE "review_reminder_settings" (
  "userId" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "time" VARCHAR(5) NOT NULL DEFAULT '20:00',
  CONSTRAINT "review_reminder_settings_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "review_reminder_settings" ADD CONSTRAINT "review_reminder_settings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
