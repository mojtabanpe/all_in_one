-- AlterTable
ALTER TABLE "users" ADD COLUMN "enabledApplets" TEXT[] NOT NULL DEFAULT ARRAY['planner', 'english', 'health', 'expenses']::TEXT[];

-- CreateTable
CREATE TABLE "default_expense_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(32),
    "color" VARCHAR(24) NOT NULL DEFAULT 'emerald',
    "icon" VARCHAR(40) NOT NULL DEFAULT 'lucideWallet',
    "keywords" VARCHAR(500) NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "default_expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "default_expense_categories_sortOrder_idx" ON "default_expense_categories"("sortOrder");
