-- CreateTable
CREATE TABLE "english_shadowing_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "sentences" INTEGER NOT NULL,
    "attempted" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "english_shadowing_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "english_shadowing_sessions_userId_createdAt_idx" ON "english_shadowing_sessions"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "english_shadowing_sessions" ADD CONSTRAINT "english_shadowing_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
