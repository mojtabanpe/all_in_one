-- AlterEnum
ALTER TYPE "BillingRewardCampaign" ADD VALUE 'SECOND_CONTACT';

-- AlterTable
ALTER TABLE "billing_rewards" ALTER COLUMN "adminId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "email_verifications" ADD COLUMN     "email" TEXT;
