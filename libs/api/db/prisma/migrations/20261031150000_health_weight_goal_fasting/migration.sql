-- AlterTable
ALTER TABLE "health_profiles" ADD COLUMN     "goalStartDate" DATE,
ADD COLUMN     "goalStartWeightKg" DOUBLE PRECISION,
ADD COLUMN     "targetDate" DATE,
ADD COLUMN     "targetWeightKg" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "health_weight_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_weight_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_fasts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "targetHours" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_fasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "health_weight_logs_userId_date_key" ON "health_weight_logs"("userId", "date");

-- CreateIndex
CREATE INDEX "health_fasts_userId_startedAt_idx" ON "health_fasts"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "health_weight_logs" ADD CONSTRAINT "health_weight_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_fasts" ADD CONSTRAINT "health_fasts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: the weight already on a profile becomes its first weigh-in.
INSERT INTO "health_weight_logs" ("id", "userId", "date", "weightKg")
SELECT gen_random_uuid(), "userId", ("updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran')::date, "weightKg"
FROM "health_profiles"
WHERE "weightKg" IS NOT NULL;
