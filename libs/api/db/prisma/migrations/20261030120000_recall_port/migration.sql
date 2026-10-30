-- Recall port (directives 20-21): English decks/cards/texts, auth tokens, MCP.

-- DropForeignKey
ALTER TABLE "english_word_progress" DROP CONSTRAINT "english_word_progress_userId_fkey";

-- DropForeignKey
ALTER TABLE "english_word_progress" DROP CONSTRAINT "english_word_progress_wordId_fkey";

-- DropForeignKey
ALTER TABLE "english_words" DROP CONSTRAINT "english_words_deckId_fkey";

-- DropForeignKey
ALTER TABLE "english_words" DROP CONSTRAINT "english_words_ownerId_fkey";

-- The old CEFR catalog rows: that content now ships in code as starter decks
-- (libs/applets/english-learning/api), and decks belong to users from here on.
DELETE FROM "english_decks";

-- DropIndex
DROP INDEX "english_decks_slug_key";

-- AlterTable
ALTER TABLE "english_decks" DROP COLUMN "level",
DROP COLUMN "slug",
DROP COLUMN "sortOrder",
DROP COLUMN "title",
ADD COLUMN     "color" VARCHAR(16) NOT NULL DEFAULT 'sky',
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "name" VARCHAR(200) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "userId" UUID NOT NULL,
ALTER COLUMN "description" SET DEFAULT '',
ALTER COLUMN "description" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Accounts created before email verification existed count as verified.
UPDATE "users" SET "emailVerifiedAt" = CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "english_word_progress";

-- DropTable
DROP TABLE "english_words";

-- DropEnum
DROP TYPE "CefrLevel";

-- CreateTable
CREATE TABLE "password_resets" (
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "english_cards" (
    "id" UUID NOT NULL,
    "deckId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "unit" VARCHAR(16) NOT NULL DEFAULT '',
    "examples" TEXT NOT NULL DEFAULT '',
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspensions" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "english_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "english_texts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "ai" BOOLEAN NOT NULL DEFAULT false,
    "rating" SMALLINT,
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "ratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "english_texts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_keys" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_clients" (
    "id" UUID NOT NULL,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "mcp_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_pending" (
    "id" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "params" JSONB NOT NULL,
    "csrfHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_pending_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_codes" (
    "codeHash" TEXT NOT NULL,
    "keyId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "params" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_codes_pkey" PRIMARY KEY ("codeHash")
);

-- CreateTable
CREATE TABLE "mcp_credentials" (
    "tokenHash" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "keyId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "scopes" TEXT[],
    "accessExpires" TIMESTAMP(3) NOT NULL,
    "refreshExpires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_credentials_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "password_resets_userId_idx" ON "password_resets"("userId");

-- CreateIndex
CREATE INDEX "email_verifications_userId_idx" ON "email_verifications"("userId");

-- CreateIndex
CREATE INDEX "english_cards_userId_deckId_dueAt_idx" ON "english_cards"("userId", "deckId", "dueAt");

-- CreateIndex
CREATE INDEX "english_texts_userId_createdAt_idx" ON "english_texts"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_keys_tokenHash_key" ON "mcp_keys"("tokenHash");

-- CreateIndex
CREATE INDEX "mcp_keys_userId_idx" ON "mcp_keys"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_credentials_refreshHash_key" ON "mcp_credentials"("refreshHash");

-- CreateIndex
CREATE INDEX "mcp_credentials_keyId_idx" ON "mcp_credentials"("keyId");

-- CreateIndex
CREATE INDEX "english_decks_userId_createdAt_idx" ON "english_decks"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "english_decks" ADD CONSTRAINT "english_decks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "english_cards" ADD CONSTRAINT "english_cards_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "english_decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "english_cards" ADD CONSTRAINT "english_cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "english_texts" ADD CONSTRAINT "english_texts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_keys" ADD CONSTRAINT "mcp_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_pending" ADD CONSTRAINT "mcp_pending_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "mcp_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_codes" ADD CONSTRAINT "mcp_codes_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "mcp_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_codes" ADD CONSTRAINT "mcp_codes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "mcp_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_credentials" ADD CONSTRAINT "mcp_credentials_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "mcp_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_credentials" ADD CONSTRAINT "mcp_credentials_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "mcp_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

