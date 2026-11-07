-- CreateEnum
CREATE TYPE "PhoneCodePurpose" AS ENUM ('VERIFY', 'RESET');

-- AlterTable
ALTER TABLE "billing_subscriptions" ADD COLUMN     "expiryNoticeFor" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" VARCHAR(16),
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "phone_codes" (
    "userId" UUID NOT NULL,
    "purpose" "PhoneCodePurpose" NOT NULL,
    "phone" VARCHAR(16) NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "sends" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_codes_pkey" PRIMARY KEY ("userId","purpose")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- AddForeignKey
ALTER TABLE "phone_codes" ADD CONSTRAINT "phone_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

