-- CreateEnum
CREATE TYPE "EnglishDialogueEventKind" AS ENUM ('OPEN', 'FINISH');

-- CreateTable
CREATE TABLE "english_dialogue_events" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "EnglishDialogueEventKind" NOT NULL,
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "english_dialogue_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "english_dialogue_events_slug_kind_idx" ON "english_dialogue_events"("slug", "kind");

-- CreateIndex
CREATE INDEX "english_dialogue_events_userId_createdAt_idx" ON "english_dialogue_events"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "english_dialogue_events" ADD CONSTRAINT "english_dialogue_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
