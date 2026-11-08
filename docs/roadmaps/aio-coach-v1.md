# AIO Coach v1 — رودمپ تولید و آپلود ویدئوهای تمرین

**Purpose:** produce, medically/biomechanically review, upload, connect and verify exercise demonstration videos in Poshtetgarm.  
**Status:** IN_PROGRESS — 14 of 62 clips published, including the interim `wall-slide` (10) v003.
`trx-chest` (14) v004 was reviewed and needs revision before publication.
Anonymous MP4 delivery verified for all 14 published clips; inline playback on a phone/PWA still needs verification.

## Summary (2026-11-09)

| Checkpoint                        | State         | Evidence                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload pipeline and storage       | `DONE`        | `apps/api/src/tools/exercise-video-upload.service.ts` (admin only, MP4 `ftyp` check, 8 MiB), served from `/api/exercise-videos` (volume `exercise-videos` in `deploy/compose.yml`)                                                                                                                                                                                            |
| Approved clips published          | `IN_PROGRESS` | 14/62 `published` in `production-tracker.csv`: body-squat, reverse-lunge, wall-pushup, pushup, glute-bridge, bird-dog, prone-w (interim v2), jumping-jack, dead-bug, plank, march, trx-squat, trx-row, wall-slide (interim v003)                                                                                                                                              |
| Catalog mapping safe from re-seed | `DONE`        | `libs/applets/health/api/src/lib/seed.ts` only fills `videoUrl` where it is `null`, so uploaded clips survive deploys                                                                                                                                                                                                                                                         |
| In-app playback                   | `DONE` (code) | Uploaded clips play inline (`<video controls muted loop playsinline preload="metadata">`, 16:9) in the exercise sheet and guided session; a failed clip falls back to the link. Fixed: the exercise sheet called `new URL()` on the site-relative clip path and threw. Tests: `exerciseVideoSource` (health-contracts), clip/fallback test in `training-session-page.spec.ts` |
| Anonymous MP4 delivery            | `DONE`        | 2026-11-08: all 14 published tracker URLs returned HTTP 206, `Content-Type: video/mp4` and `Content-Range: bytes 0-31/…` for an unauthenticated range GET.                                                                                                                                                                                                                    |
| Inline phone/PWA playback         | `VERIFY`      | Exercise sheet and guided session still need a playback check on a phone and in the installed PWA.                                                                                                                                                                                                                                                                            |
| TRX chest press v004              | `IN_PROGRESS` | Reviewed 2026-11-09. The opening pose is closer to a chest press. The grips still fall to hip height, and the final hold does not return to the opening arm extension.                                                                                                                                                                                                        |
| Remaining 48 clips                | `TODO`        | Owner generates in Gemini with the reference images; agent reviews, uploads via MCP and updates the tracker                                                                                                                                                                                                                                                                   |

## Existing source of truth

- `docs/exercise-video-kit/README.fa.md` — detailed production plan and review standards.
- `docs/exercise-video-kit/production-tracker.csv` — 62 exercise slugs, planned filenames, status, public URL and review notes (source of truth for clip state).
- `docs/exercise-video-kit/prompts/` and `ALL-PROMPTS.md` — generation prompts.
- `docs/exercise-video-kit/manifest-template.json` — upload manifest template.
- `libs/applets/health/api/src/lib/` — exercise catalog; verify current catalog before assigning slugs.

## Workflow and checkpoints

- [x] `DONE` Upload path: MCP tool `upload_exercise_video` → `ExerciseVideoUploadService` (admin, MP4 ≤ 8 MiB) →
      `data/exercise-videos` volume → public `/api/exercise-videos/<slug>-<uuid>.mp4`; `videoUrl` set on the catalog row.
- [x] `DONE` Inventory: tracker rows for the 14 published clips carry the public URL and review notes (2026-11-06–08).
- [ ] `IN_PROGRESS` Coach visual reference `aio-coach-v1` is in use for the published clips; qualified review still
      needed for complex/advanced exercises before they are generated.
- [x] `DONE` Attach by stable slug: the upload writes `videoUrl` for that slug; seed never overwrites a set `videoUrl`.
- [x] `DONE` (code, 2026-11-07) Inline playback with controls, fixed 16:9 geometry (no layout shift), metadata-only
      preload for mobile data, and a link fallback when the clip fails to load.
- [ ] `VERIFY` Open either new clip on a production phone and installed PWA. Anonymous MP4 byte ranges were verified for all 14 published clips on 2026-11-08.
- [x] `DONE` `dead-bug` and `plank` v001 uploaded via Poshtetgarm MCP. A separate catalog lookup returned the new URLs;
      anonymous range responses reported the exact uploaded sizes (377,258 and 995,257 bytes). URLs are in the tracker.
- [ ] `TODO` `prone-w` v3 to replace the interim v2 (prompt 07 already updated).
- [x] `DONE` `wall-slide` v003 was approved for interim publication on 2026-11-08. Uploaded the silent 8 s
      cut (source 11–19 s, 1280×720) via MCP. A separate catalog lookup returned the new URL and an anonymous
      MP4 range GET reported 696,701 bytes. The elbows finish below shoulder height and continuous forearm
      contact is unclear.
- [x] `DONE` `march` v001 was approved and published via MCP on 2026-11-08 (silent, 1280×720, 10 s).
- [x] `DONE` `trx-squat` v002 was approved and published via MCP on 2026-11-08 (silent, 1280×720, 10 s).
- [x] `DONE` `trx-row` v002 was approved and published via MCP on 2026-11-08 (silent, 1280×720, 10 s).
- [ ] `IN_PROGRESS` `trx-chest` v001 reviewed on 2026-11-08. The trainer faces the anchor side, the straps run
      upward in front of him, and the anchor is outside the frame. v002 fixes the direction, but detached strap handles hang behind him
      while his hands move separate grips. Prompt 14 now defines both anchor-to-hand connections frame by frame.
- [ ] `IN_PROGRESS` Retried `trx-chest` v003 in Gemini on 2026-11-09 using the existing prompt and three attached reference images. Reviewed the returned MP4 at one-second intervals. The straps appear to reach the grips, but the coach rocks forward and back with bent elbows and low hands. Regenerate with visibly extended arms at chest height at both ends of the repetition.
- [ ] `IN_PROGRESS` Reviewed `trx-chest` v004 on 2026-11-09 at one-second intervals. The opening reach and elbow movement are clearer than v003. Around 3–4 s, the grips are beside the hips. The final hold is lower and more bent than the opening pose. Revise before publication.
- [ ] `TODO` Continue the TRX batch (14–18), starting with `trx-chest`. Per clip: owner generates → agent/owner review
      (tracker `generated` → `reviewed`) → MCP upload → `published` with URL.

## Historical handoff — NOT verified as uploaded

Prior conversations mention video review/approval for Squat, Push-up, Glute Bridge and other exercises, with files such as `gemini_generated_video_ED7EE4D1.mp4`, `gemini_generated_video_51486F58.mp4`, `gemini_generated_video_C98E2A1A.mp4`, `gemini_generated_video_A3DFE2DA.mp4`. These are handoff references only; inspect the actual files, metadata and storage records before marking any published. Prior upload/deploy attempts were not conclusively verified.

## Next action

1. Open `dead-bug` or `plank` on a phone and in the installed PWA; confirm inline playback in the exercise sheet and guided session.
2. Regenerate `trx-chest` and review the next take against [prompt 14](../exercise-video-kit/prompts/14-trx-chest.txt).
   Generate `prone-w` v3 with prompt 07.

Last updated: 2026-11-09.
