-- CreateTable
CREATE TABLE "billing_reward_requests" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "campaign" "BillingRewardCampaign" NOT NULL,
    "handle" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_reward_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_reward_requests_createdAt_idx" ON "billing_reward_requests"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_reward_requests_userId_campaign_key" ON "billing_reward_requests"("userId", "campaign");

-- AddForeignKey
ALTER TABLE "billing_reward_requests" ADD CONSTRAINT "billing_reward_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
