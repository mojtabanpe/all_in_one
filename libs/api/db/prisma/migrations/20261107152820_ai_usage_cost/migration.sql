-- AlterTable
ALTER TABLE "ai_usage_days" ADD COLUMN     "outputUnits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tier" VARCHAR(10);
