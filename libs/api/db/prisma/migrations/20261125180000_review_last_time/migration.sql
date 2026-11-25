-- Additive and nullable: the running release ignores it; existing rows stay NULL (no backfill).
ALTER TABLE "english_review_days" ADD COLUMN "lastReviewAt" TIMESTAMP(3);
