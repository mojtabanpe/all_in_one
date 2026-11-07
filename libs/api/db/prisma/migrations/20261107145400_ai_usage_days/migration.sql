-- CreateTable
CREATE TABLE "ai_usage_days" (
    "userId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "units" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_days_pkey" PRIMARY KEY ("userId","day","kind")
);

-- CreateIndex
CREATE INDEX "ai_usage_days_day_idx" ON "ai_usage_days"("day");

-- AddForeignKey
ALTER TABLE "ai_usage_days" ADD CONSTRAINT "ai_usage_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
