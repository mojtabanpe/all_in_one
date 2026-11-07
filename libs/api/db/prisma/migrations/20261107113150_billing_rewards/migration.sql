-- CreateEnum
CREATE TYPE "BillingRewardCampaign" AS ENUM ('TELEGRAM_JOIN', 'INSTAGRAM_FOLLOW');

-- CreateTable
CREATE TABLE "billing_rewards" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "campaign" "BillingRewardCampaign" NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_rewards_userId_campaign_key" ON "billing_rewards"("userId", "campaign");

-- AddForeignKey
ALTER TABLE "billing_rewards" ADD CONSTRAINT "billing_rewards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_rewards" ADD CONSTRAINT "billing_rewards_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
