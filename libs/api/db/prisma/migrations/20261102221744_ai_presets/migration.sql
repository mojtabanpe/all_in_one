-- CreateTable
CREATE TABLE "user_ai_presets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "model2" VARCHAR(100),
    "key" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_ai_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_ai_presets_userId_kind_createdAt_idx" ON "user_ai_presets"("userId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "user_ai_presets" ADD CONSTRAINT "user_ai_presets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
