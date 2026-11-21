ALTER TABLE "users"
    ADD COLUMN "vpnFriend" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "vpnSyncAt" TIMESTAMP(3);

ALTER TABLE "telegram_links" ADD COLUMN "vpnMenuVisible" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "users_vpnSyncAt_idx" ON "users"("vpnSyncAt");
