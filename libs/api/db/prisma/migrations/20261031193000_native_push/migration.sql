ALTER TABLE "push_subscriptions"
ADD COLUMN "platform" VARCHAR(10) NOT NULL DEFAULT 'WEB',
ADD COLUMN "fcmToken" TEXT;
