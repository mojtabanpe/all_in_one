-- CreateEnum
CREATE TYPE "BillingAdjustmentAction" AS ENUM ('EXTEND', 'END');

-- CreateTable
CREATE TABLE "billing_adjustments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "action" "BillingAdjustmentAction" NOT NULL,
    "days" INTEGER,
    "reason" VARCHAR(200) NOT NULL,
    "previousUntil" TIMESTAMP(3),
    "newUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_adjustments_userId_createdAt_idx" ON "billing_adjustments"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "billing_adjustments" ADD CONSTRAINT "billing_adjustments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_adjustments" ADD CONSTRAINT "billing_adjustments_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
