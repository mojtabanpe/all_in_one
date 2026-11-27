-- AlterTable
ALTER TABLE "telegram_link_codes" ADD COLUMN     "entry" VARCHAR(24);

-- AlterTable
ALTER TABLE "telegram_links" ADD COLUMN     "lastReviewReminderDay" VARCHAR(10);

-- CreateTable
CREATE TABLE "telegram_daily_counts" (
    "day" VARCHAR(10) NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "entry" VARCHAR(24) NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "telegram_daily_counts_pkey" PRIMARY KEY ("day","kind","entry")
);
