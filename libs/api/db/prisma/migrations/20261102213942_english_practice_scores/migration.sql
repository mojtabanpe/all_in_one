-- CreateEnum
CREATE TYPE "EnglishPracticeKind" AS ENUM ('SHADOWING', 'WRITING', 'SPEAKING', 'LISTENING');

-- AlterTable
ALTER TABLE "english_shadowing_sessions" ADD COLUMN     "kind" "EnglishPracticeKind" NOT NULL DEFAULT 'SHADOWING',
ADD COLUMN     "mistakes" INTEGER;

-- CreateIndex
CREATE INDEX "english_shadowing_sessions_userId_kind_createdAt_idx" ON "english_shadowing_sessions"("userId", "kind", "createdAt");
