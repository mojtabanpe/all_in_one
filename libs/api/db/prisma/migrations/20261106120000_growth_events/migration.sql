-- CreateTable
CREATE TABLE "growth_events" (
    "id" UUID NOT NULL,
    "visitorId" UUID NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "language" VARCHAR(2) NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "campaign" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "growth_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "growth_events_day_name_idx" ON "growth_events"("day", "name");

-- CreateIndex
CREATE UNIQUE INDEX "growth_events_visitorId_name_day_key" ON "growth_events"("visitorId", "name", "day");

