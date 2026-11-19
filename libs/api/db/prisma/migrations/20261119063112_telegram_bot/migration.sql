-- CreateTable
CREATE TABLE "telegram_links" (
    "userId" UUID NOT NULL,
    "chatId" BIGINT NOT NULL,
    "language" VARCHAR(2) NOT NULL DEFAULT 'fa',
    "lastSummaryDay" VARCHAR(10),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "telegram_link_codes" (
    "codeHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "language" VARCHAR(2) NOT NULL DEFAULT 'fa',
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_link_codes_pkey" PRIMARY KEY ("codeHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_chatId_key" ON "telegram_links"("chatId");

-- CreateIndex
CREATE INDEX "telegram_link_codes_userId_idx" ON "telegram_link_codes"("userId");

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
