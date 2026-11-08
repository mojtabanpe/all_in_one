-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('ZIBAL', 'BAZAAR', 'MYKET');

-- AlterTable
ALTER TABLE "billing_orders" ADD COLUMN     "provider" "BillingProvider" NOT NULL DEFAULT 'ZIBAL',
ADD COLUMN     "purchaseToken" VARCHAR(512);

-- CreateIndex
CREATE UNIQUE INDEX "billing_orders_provider_purchaseToken_key" ON "billing_orders"("provider", "purchaseToken");

