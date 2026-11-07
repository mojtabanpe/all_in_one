CREATE TABLE "managed_ai_presets" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "model2" VARCHAR(100),
    "key" VARCHAR(1000),
    "proxy" VARCHAR(500),
    "elevenlabs" BOOLEAN NOT NULL DEFAULT false,
    "deepgram" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "managed_ai_presets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "managed_ai_presets_kind_createdAt_idx" ON "managed_ai_presets"("kind", "createdAt");

-- Preserve the approved operator's saved provider presets and model lists.
INSERT INTO "managed_ai_presets" ("id", "kind", "url", "model", "model2", "key", "proxy", "elevenlabs", "deepgram", "createdAt")
SELECT "id", "kind", "url", "model", "model2", "key", "proxy", "elevenlabs", "deepgram", "createdAt"
FROM "user_ai_presets" WHERE "userId" = '7e8fc3be-541a-4a1f-8136-13e9bce48512';

UPDATE "managed_ai_configuration" AS m
SET "settings" = m."settings" || jsonb_build_object('chatModels', s."chatModels", 'ttsModels', s."ttsModels", 'sttModels', s."sttModels")
FROM "user_ai_settings" AS s
WHERE m."id" = 1 AND s."userId" = '7e8fc3be-541a-4a1f-8136-13e9bce48512';
