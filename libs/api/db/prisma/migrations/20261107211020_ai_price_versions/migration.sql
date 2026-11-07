-- CreateTable
CREATE TABLE "ai_price_versions" (
    "day" DATE NOT NULL,
    "prices" JSONB NOT NULL,
    "models" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_price_versions_pkey" PRIMARY KEY ("day")
);


-- Start the history with the prices already saved, effective today (Tehran), with the models in use now.
INSERT INTO "ai_price_versions" ("day", "prices", "models")
SELECT (now() AT TIME ZONE 'Asia/Tehran')::date,
       settings -> 'prices',
       jsonb_build_object(
         'chat', COALESCE(settings ->> 'chatModel', ''),
         'tts', COALESCE(settings ->> 'ttsModel', ''),
         'stt', COALESCE(settings ->> 'sttModel', '')
       )
FROM "managed_ai_configuration"
WHERE id = 1 AND settings ? 'prices';
