-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BillingRewardCampaign" ADD VALUE 'REFERRAL_INVITER';
ALTER TYPE "BillingRewardCampaign" ADD VALUE 'REFERRAL_INVITED';

-- AlterTable
ALTER TABLE "billing_rewards" ADD COLUMN     "key" VARCHAR(40) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "inviteCode" VARCHAR(12);

-- CreateTable
CREATE TABLE "referrals" (
    "inviteeId" UUID NOT NULL,
    "inviterId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardedAt" TIMESTAMP(3),

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("inviteeId")
);

-- CreateIndex
CREATE INDEX "referrals_inviterId_idx" ON "referrals"("inviterId");

-- CreateIndex
CREATE INDEX "referrals_rewardedAt_createdAt_idx" ON "referrals"("rewardedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_rewards_userId_campaign_key_key" ON "billing_rewards"("userId", "campaign", "key");

-- DropIndex (after the new one exists, so a week can never be granted twice meanwhile)
DROP INDEX "billing_rewards_userId_campaign_key";

-- CreateIndex
CREATE UNIQUE INDEX "users_inviteCode_key" ON "users"("inviteCode");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

