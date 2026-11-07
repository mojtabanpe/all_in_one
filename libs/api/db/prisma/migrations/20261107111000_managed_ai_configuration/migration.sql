-- Copy only the operator-approved account's active settings, once. Existing key
-- ciphertext is preserved and never emitted. Presets and account metadata stay out.
CREATE TABLE "managed_ai_configuration" (
    "id" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    CONSTRAINT "managed_ai_configuration_pkey" PRIMARY KEY ("id")
);

INSERT INTO "managed_ai_configuration" ("id", "settings")
SELECT 1, to_jsonb(s) - ARRAY['userId', 'updatedAt', 'chatModels', 'ttsModels', 'sttModels']
FROM "user_ai_settings" s
WHERE s."userId" = '7e8fc3be-541a-4a1f-8136-13e9bce48512';
