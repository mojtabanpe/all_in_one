-- AlterTable
ALTER TABLE "user_ai_settings" ADD COLUMN     "chatProxy" VARCHAR(500),
ADD COLUMN     "chatProxyOn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sttProxy" VARCHAR(500),
ADD COLUMN     "sttProxyOn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ttsProxy" VARCHAR(500),
ADD COLUMN     "ttsProxyOn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "user_ai_presets" ADD COLUMN     "proxy" VARCHAR(500);
