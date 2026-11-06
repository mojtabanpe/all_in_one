# Poshtetgarm roadmaps — source of truth

Repository: `mojtabanpe/all_in_one`; canonical branch: `master`.
Updated: 2026-11-06.

## Stable roadmap names and commands

| ID                | Persian name         | File                                 | State                                                                                                       |
| ----------------- | -------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **AIO Growth v1** | رودمپ مارکتینگ       | [aio-growth-v1.md](aio-growth-v1.md) | In progress: local landing/SEO, registration and analytics verified; Zibal transport tested; no release yet |
| **AIO Coach v1**  | رودمپ ویدئوهای تمرین | [aio-coach-v1.md](aio-coach-v1.md)   | In progress; deployment/upload verification pending                                                         |

To resume in any ChatGPT/Codex session: **«رودمپ مارکتینگ رو پیش ببر»** or **«رودمپ ویدئوهای تمرین رو پیش ببر»**. The agent should read this index and the linked roadmap from `master`, verify current repo/deployment state, carry out the next authorized task, then update the roadmap status and evidence. Never infer completed deployment from a merged commit.

## Status convention

- `DONE`: verified with code, tests, or live evidence (record which).
- `IN_PROGRESS`: actively underway.
- `TODO`: not started or not verified.
- `BLOCKED`: dependency requires action.
- `VERIFY`: previous claim exists but current state is unconfirmed.

## Rules

- Do not store credentials, API keys, private video links or payment secrets in these files.
- Every completed item must include commit/PR, test evidence, or deployed URL verification.
- Keep customer-facing AI provider credentials on the server, not in browser settings.
- Roadmaps are plans, not claims that features are deployed.
