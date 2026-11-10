# Poshtetgarm roadmaps — source of truth

Repository: `mojtabanpe/all_in_one`; canonical branch: `master`.
Updated: 2026-11-10.

## Stable roadmap names and commands

| ID                | Persian name         | File                                 | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | -------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **AIO Growth v1** | رودمپ مارکتینگ       | [aio-growth-v1.md](aio-growth-v1.md) | In progress (lanes: Claude C1–C7 and Codex X1–X6 done): billing live with three active plans and a verified real Zibal payment, SMS delivered, social pages with earned-week offers active, Search Console set up and admin reports reviewed. Instagram reach baseline recorded, with organic signup attribution and pilot funnel review pending (X7). Linuxor banner and caption ready for publication. Direct Android 1.0.4 published. The owner verified the paid-link registration fix on production. Enamad removed from the public footer. Owner waived PageSpeed checks and dropped interviews. Cafe Bazaar/Myket APKs await approval and publication, then one verified purchase per store (C8/O11). |
| **AIO Coach v1**  | رودمپ ویدئوهای تمرین | [aio-coach-v1.md](aio-coach-v1.md)   | In progress: 33/62 published and verified, including exercises 19–34. TRX chest press deferred. TRX plank still integration and phone/PWA playback check pending.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

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
