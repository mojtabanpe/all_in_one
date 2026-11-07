-- CreateEnum
CREATE TYPE "GrowthAdminReport" AS ENUM ('SUMMARY', 'CAMPAIGNS', 'RETENTION', 'CHURN');

-- CreateEnum
CREATE TYPE "GrowthReportAction" AS ENUM ('VIEW', 'EXPORT');

-- CreateTable
CREATE TABLE "growth_report_audit" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "report" "GrowthAdminReport" NOT NULL,
    "action" "GrowthReportAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "growth_report_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "growth_report_audit_createdAt_id_idx" ON "growth_report_audit"("createdAt", "id");
