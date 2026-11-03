-- AlterTable
ALTER TABLE "user_ai_settings" ADD COLUMN     "sttDeepgram" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ttsDeepgram" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "user_ai_presets" ADD COLUMN     "deepgram" BOOLEAN NOT NULL DEFAULT false;
