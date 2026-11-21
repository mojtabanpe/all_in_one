# AIO English Dialogues v1 — گفتگوهای آماده شدوینگ

Owner request (2026-11-21, directive 198): a library of ready conversations for every level, used in shadowing,
with usage events so the levels and topics people actually use get more dialogues.

## Summary

| ID  | Item                                                                          | State | Evidence                                                                                                                          |
| --- | ----------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 12 dialogues: A1, A2, B1, B2 × 3 (`DIALOGUE_LIBRARY`, english contracts)      | DONE  | `dialogue-library.spec.ts` (unique slugs, ≥3 per level, alternating speakers)                                                     |
| D2  | Static Kokoro audio for both voices, no AI cost (`assets/dialogue-tts`)       | DONE  | 166 clips (4.3 MB) voiced on Colab 2026-11-21; local api answered `X-TTS-Cache: STATIC` for both voices; `speech.service.spec.ts` |
| D3  | Shadowing tab: level picker + ready list above «New exercise with AI»         | DONE  | Local mobile browser 2026-11-21: list, play, finish; `OPEN`/`FINISH` rows written, unknown slug 404                               |
| D4  | Events `OPEN` / `FINISH` (+ score) in `english_dialogue_events`               | DONE  | Migration `20261121160000_english_dialogue_events` (additive); `POST /api/english/dialogues/:slug/events`                         |
| D5  | Admin report in `/admin/content` («گفتگوهای آماده شدوینگ»), staff excluded    | DONE  | `GET /api/english/dialogues/usage` (ADMIN)                                                                                        |
| D6  | Release                                                                       | TODO  | Not pushed (directive 124)                                                                                                        |
| D7  | After two weeks: read the report, write more dialogues for the most used ones | TODO  | —                                                                                                                                 |

## How to add dialogues

1. Add them to `DIALOGUE_LIBRARY` (first speaker a woman, second a man; speakers alternate).
2. `node tools/colab/export-dialogue-lines.mjs > dialogue-lines.json`
3. On Colab run `tools/colab/jobs/dialogue_tts.py --input dialogue-lines.json` (voices `af_heart` / `am_michael`).
4. Unzip into `libs/applets/english-learning/api/assets/dialogue-tts/` (replace the folder; the manifest maps
   `"<voice>\n<text>"` to the MP3).

## Notes

- Ready dialogues have no listening questions; switching to the listening tab clears a ready dialogue.
- Recording checks (speech-to-text) still need AI access; playing the sentences does not.
