-- CreateTable
CREATE TABLE "in_app_notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "key" VARCHAR(150) NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'general',
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "in_app_notifications_userId_dismissedAt_expiresAt_idx" ON "in_app_notifications"("userId", "dismissedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "in_app_notifications_userId_key_key" ON "in_app_notifications"("userId", "key");

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
