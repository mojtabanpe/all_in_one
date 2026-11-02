-- AlterTable
ALTER TABLE "user_ai_settings" ADD COLUMN     "chatModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sttModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ttsModels" TEXT[] DEFAULT ARRAY[]::TEXT[];
