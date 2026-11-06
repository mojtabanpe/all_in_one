-- AlterTable
ALTER TABLE "growth_events" ADD COLUMN     "milestoneKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "growth_events_milestoneKey_key" ON "growth_events"("milestoneKey");

