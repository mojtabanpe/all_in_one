-- CreateTable
CREATE TABLE "growth_client_days" (
    "visitorId" UUID NOT NULL,
    "client" VARCHAR(24) NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "growth_client_days_pkey" PRIMARY KEY ("visitorId","client","day")
);

-- CreateIndex
CREATE INDEX "growth_client_days_day_client_idx" ON "growth_client_days"("day", "client");
