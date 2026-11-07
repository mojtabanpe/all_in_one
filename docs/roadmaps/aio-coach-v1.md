# AIO Coach v1 — رودمپ تولید و آپلود ویدئوهای تمرین

**Purpose:** produce, medically/biomechanically review, upload, connect and verify exercise demonstration videos in Poshtetgarm.  
**Status:** IN_PROGRESS — 8 of 62 clips published (tracker), in-app inline playback added 2026-11-07; next clip to
generate is `dead-bug` v002 (08, both sides; v001 rejected). Production playback of the newest build still needs a check from a network that reaches
poshtetgarm.ir.

## Summary (2026-11-07)

| Checkpoint                        | State         | Evidence                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload pipeline and storage       | `DONE`        | `apps/api/src/tools/exercise-video-upload.service.ts` (admin only, MP4 `ftyp` check, 8 MiB), served from `/api/exercise-videos` (volume `exercise-videos` in `deploy/compose.yml`)                                                                                                                                                                                            |
| Approved clips published          | `IN_PROGRESS` | 8/62 `published` in `production-tracker.csv`: body-squat, reverse-lunge, wall-pushup, pushup, glute-bridge, bird-dog, prone-w (interim v2), jumping-jack                                                                                                                                                                                                                      |
| Catalog mapping safe from re-seed | `DONE`        | `libs/applets/health/api/src/lib/seed.ts` only fills `videoUrl` where it is `null`, so uploaded clips survive deploys                                                                                                                                                                                                                                                         |
| In-app playback                   | `DONE` (code) | Uploaded clips play inline (`<video controls muted loop playsinline preload="metadata">`, 16:9) in the exercise sheet and guided session; a failed clip falls back to the link. Fixed: the exercise sheet called `new URL()` on the site-relative clip path and threw. Tests: `exerciseVideoSource` (health-contracts), clip/fallback test in `training-session-page.spec.ts` |
| Anonymous production playback     | `VERIFY`      | 2026-11-07 the cloud agent's HTTPS to poshtetgarm.ir was reset by the network (not a server answer); recheck from Iran after deploy                                                                                                                                                                                                                                           |
| Remaining 54 clips                | `TODO`        | Owner generates in Gemini with the reference images; agent reviews, uploads via MCP and updates the tracker                                                                                                                                                                                                                                                                   |

## Existing source of truth

- `docs/exercise-video-kit/README.fa.md` — detailed production plan and review standards.
- `docs/exercise-video-kit/production-tracker.csv` — 62 exercise slugs, planned filenames, status, public URL and review notes (source of truth for clip state).
- `docs/exercise-video-kit/prompts/` and `ALL-PROMPTS.md` — generation prompts.
- `docs/exercise-video-kit/manifest-template.json` — upload manifest template.
- `libs/applets/health/api/src/lib/` — exercise catalog; verify current catalog before assigning slugs.

## Workflow and checkpoints

- [x] `DONE` Upload path: MCP tool `upload_exercise_video` → `ExerciseVideoUploadService` (admin, MP4 ≤ 8 MiB) →
      `data/exercise-videos` volume → public `/api/exercise-videos/<slug>-<uuid>.mp4`; `videoUrl` set on the catalog row.
- [x] `DONE` Inventory: tracker rows for the 8 owner-approved clips carry the public URL and review notes (2026-11-06/07).
- [ ] `IN_PROGRESS` Coach visual reference `aio-coach-v1` is in use for the published clips; qualified review still
      needed for complex/advanced exercises before they are generated.
- [x] `DONE` Attach by stable slug: the upload writes `videoUrl` for that slug; seed never overwrites a set `videoUrl`.
- [x] `DONE` (code, 2026-11-07) Inline playback with controls, fixed 16:9 geometry (no layout shift), metadata-only
      preload for mobile data, and a link fallback when the clip fails to load.
- [ ] `VERIFY` Anonymous playback on production phone/PWA after this deploy (status 200, `video/mp4`, range requests,
      plays inline in the installed PWA). Not reachable from the cloud agent's network.
- [ ] `TODO` `prone-w` v3 to replace the interim v2 (prompt 07 already updated).
- [ ] `TODO` Next clips in order: 08 `dead-bug` v002 (v001 rejected 2026-11-07), 09 `plank`, 10 `wall-slide`, 11 `march`, then the TRX batch (12–18).
      Per clip: owner generates → agent/owner review (tracker `generated` → `reviewed`) → MCP upload → `published` with URL.

## Historical handoff — NOT verified as uploaded

Prior conversations mention video review/approval for Squat, Push-up, Glute Bridge and other exercises, with files such as `gemini_generated_video_ED7EE4D1.mp4`, `gemini_generated_video_51486F58.mp4`, `gemini_generated_video_C98E2A1A.mp4`, `gemini_generated_video_A3DFE2DA.mp4`. These are handoff references only; inspect the actual files, metadata and storage records before marking any published. Prior upload/deploy attempts were not conclusively verified.

## Next action

1. After deploy, open an exercise with a clip (e.g. «اسکات با وزن بدن») on a phone and in the PWA; confirm inline playback
   and record it here.
2. Owner: generate `dead-bug` v002 with the rewritten prompt 08 (both sides, one arm + opposite leg at a time), attach
   the reference images. v001 was rejected 2026-11-07 (both arms moved together in rep 1; one side only). Then upload
   through the MCP tool.
3. Owner: generate `prone-w` v3 and replace the interim clip.

Last updated: 2026-11-07.
