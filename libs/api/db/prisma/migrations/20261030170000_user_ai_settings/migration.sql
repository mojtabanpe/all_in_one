-- AlterTable
ALTER TABLE "meal_logs" ADD COLUMN     "carbsG" INTEGER,
ADD COLUMN     "fatG" INTEGER,
ADD COLUMN     "proteinG" INTEGER;

-- CreateTable
CREATE TABLE "user_ai_settings" (
    "userId" UUID NOT NULL,
    "chatUrl" VARCHAR(500),
    "chatModel" VARCHAR(100),
    "chatKey" VARCHAR(1000),
    "ttsUrl" VARCHAR(500),
    "ttsModel" VARCHAR(100),
    "ttsModel2" VARCHAR(100),
    "ttsKey" VARCHAR(1000),
    "sttUrl" VARCHAR(500),
    "sttModel" VARCHAR(100),
    "sttKey" VARCHAR(1000),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_ai_settings_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "user_ai_settings" ADD CONSTRAINT "user_ai_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

