# AIO Coach v1 — رودمپ تولید و آپلود ویدئوهای تمرین

**Purpose:** produce, medically/biomechanically review, upload, connect and verify exercise demonstration videos in Poshtetgarm.  
**Status:** IN_PROGRESS / VERIFY deployment and uploaded objects. **Do not treat chat approvals or attached videos as verified production uploads.**

## Existing source of truth

- `docs/exercise-video-kit/README.fa.md` — detailed production plan and review standards.
- `docs/exercise-video-kit/production-tracker.csv` — 61 exercise slugs, planned filenames and status fields. At last repository inspection, early rows still said `pending`; tracker may lag behind work performed in previous chats.
- `docs/exercise-video-kit/prompts/` and `ALL-PROMPTS.md` — generation prompts.
- `docs/exercise-video-kit/manifest-template.json` — upload manifest template.
- `libs/applets/health/api/src/lib/` — exercise catalog; verify current catalog before assigning slugs.

## Workflow and checkpoints

- [ ] `VERIFY` Confirm exact current deployment status and MCP upload permissions, auth, API behavior and storage backend; report evidence.
- [ ] `VERIFY` Inventory approved video files from previous sessions; map each actual video to canonical slug and review approval; don't infer slug from filename alone.
- [ ] `TODO` Confirm coach visual reference `aio-coach-v1` and exercise biomechanics; get qualified review for complex/advanced exercises.
- [ ] `TODO` Upload approved MP4s only; verify storage URI, public playback URL, mime type, duration, orientation and actual anonymous playback.
- [ ] `TODO` Attach video to exercise catalog using stable slug and versioned filename; avoid duplicate or incorrect mappings.
- [ ] `TODO` Update `production-tracker.csv` statuses `pending → generated → reviewed → published` with proof and `public_url`; mark revisions separately.
- [ ] `TODO` Verify videos load on mobile/PWA and production; test slow connections, missing media, playback controls and caching.
- [ ] `TODO` Continue remaining exercise batches by equipment/level with cost and quality tracking.

## Historical handoff — NOT verified as uploaded

Prior conversations mention video review/approval for Squat, Push-up, Glute Bridge and other exercises, with files such as `gemini_generated_video_ED7EE4D1.mp4`, `gemini_generated_video_51486F58.mp4`, `gemini_generated_video_C98E2A1A.mp4`, `gemini_generated_video_A3DFE2DA.mp4`. These are handoff references only; inspect the actual files, metadata and storage records before marking any published. Prior upload/deploy attempts were not conclusively verified.

## Next action

Reconcile existing video assets and storage/database records with `production-tracker.csv`; then finish deployment/upload of approved assets, validate public playback, and commit evidence-based tracker updates. Do not overwrite existing production mappings without checking them.

Last updated: 2026-11-06.
