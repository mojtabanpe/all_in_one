-- Additive and nullable: the running release ignores both columns; existing rows stay NULL (no backfill).
ALTER TABLE "users" ADD COLUMN "signupSource" VARCHAR(40);

ALTER TABLE "english_review_days" ADD COLUMN "firstReviewAt" TIMESTAMP(3);
