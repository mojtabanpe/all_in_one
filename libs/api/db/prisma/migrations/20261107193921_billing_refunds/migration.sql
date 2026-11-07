-- AlterEnum
ALTER TYPE "BillingAdjustmentAction" ADD VALUE 'REFUND';

-- AlterEnum
ALTER TYPE "BillingOrderStatus" ADD VALUE 'REFUNDED';

-- CreateTable
CREATE TABLE "billing_refunds" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "amountRial" INTEGER NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "reference" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_refunds_orderId_key" ON "billing_refunds"("orderId");

-- CreateIndex
CREATE INDEX "billing_refunds_createdAt_idx" ON "billing_refunds"("createdAt");

-- AddForeignKey
ALTER TABLE "billing_refunds" ADD CONSTRAINT "billing_refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "billing_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_refunds" ADD CONSTRAINT "billing_refunds_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
