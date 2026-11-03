-- AlterTable
ALTER TABLE "user_ai_settings" ADD COLUMN     "sttEleven" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ttsEleven" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "user_ai_presets" ADD COLUMN     "elevenlabs" BOOLEAN NOT NULL DEFAULT false;
