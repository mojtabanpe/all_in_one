# Poshtetgarm roadmaps — source of truth

Repository: `mojtabanpe/all_in_one`; canonical branch: `master`.
Updated: 2026-11-14.

## Stable roadmap names and commands

Deployment: [AIO Deployment v1](aio-deployment-v1.md) — DONE, verified on GitHub on 2026-11-14: mixed-push CI/deployment succeeded (`e80b9a9`); documentation-only CI succeeded and all build/release jobs were skipped (`6312dcb`). CI checks and manual deployment preserved.

| ID                | Persian name         | File                                 | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | -------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AIO Growth v1** | رودمپ مارکتینگ       | [aio-growth-v1.md](aio-growth-v1.md) | In progress. X8/X9 complete by owner confirmation on 2026-11-14; production notification migration verified. Campaigns started; English pilot Reel verified live and owner-approved health Reel published at 11:45 Tehran on 2026-11-14 (separate connector read-back verified). Production campaign counts read with QA excluded: Linuxor 40 landing browsers / 7 signups; legacy Instagram 4 / 1; English pilot 4 / 0. X7 remains open for in-app registration and follow-up measurement; bio still uses the legacy general link. C1–C7 and X1–X6 done; billing, SMS, Search Console and admin reports verified. C8/O11 await store approval, publication and test purchases. X10 client/distribution usage reporting is complete locally (Bazaar/Myket/direct APK/PWA/web); existing APKs work without a rebuild. Production release and real-device verification pending. |
| **AIO Coach v1**  | رودمپ ویدئوهای تمرین | [aio-coach-v1.md](aio-coach-v1.md)   | Publication complete: 62/62 published and delivery verified. Clutch curl (49) v007 published on 2026-11-14; separate catalog lookup, anonymous HTTP 206 and full byte match verified. Mobile/PWA playback confirmed by the owner on 2026-11-14. Qualified review remains unverified; wall-slide v003 remains an accepted interim clip.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

| **AIO Planner Focus v1** | پومودورو و اعلان پایان | [aio-planner-focus-v1.md](aio-planner-focus-v1.md) | Implementation complete locally: custom whole-minute duration, 15/30/45/60 presets (default 30), persistent completion push with cancellation/resume. Tests and builds pass; database migration application and real-device delivery await verification. Unpushed per directive 124. |

To resume in any Claude (Claude Code) or ChatGPT/Codex session: **«رودمپ مارکتینگ رو پیش ببر»** or **«رودمپ ویدئوهای تمرین رو پیش ببر»**. The agent should read this index and the linked roadmap from `master`, verify current repo/deployment state, carry out the next authorized task, then update the roadmap status and evidence. Never infer completed deployment from a merged commit.

## Status convention

- `DONE`: verified with code, tests, or live evidence (record which).
- `IN_PROGRESS`: actively underway.
- `TODO`: not started or not verified.
- `DEFERRED`: intentionally set aside for later.
- `BLOCKED`: dependency requires action.
- `VERIFY`: previous claim exists but current state is unconfirmed.

## Rules

- Do not store credentials, API keys, private video links or payment secrets in these files.
- Every completed item must include commit/PR, test evidence, or deployed URL verification.
- Keep customer-facing AI provider credentials on the server, not in browser settings.
- Roadmaps are plans, not claims that features are deployed.
- Both agents work from these files and `AGENTS.md` only (directive 107): pull `master` first, and in the same commit
  as the work update the item, the roadmap's summary/checkpoint table and this index row so they never disagree.
