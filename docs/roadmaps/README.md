# Poshtetgarm roadmaps — source of truth

Repository: `mojtabanpe/all_in_one`; canonical branch: `master`.
Updated: 2026-11-07.

## Stable roadmap names and commands

| ID                | Persian name         | File                                 | State                                                                                                                                           |
| ----------------- | -------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **AIO Growth v1** | رودمپ مارکتینگ       | [aio-growth-v1.md](aio-growth-v1.md) | In progress: acquisition/SEO, billing, managed AI, quotas, cost reporting and channel churn on production; payments await plans and prices      |
| **AIO Coach v1**  | رودمپ ویدئوهای تمرین | [aio-coach-v1.md](aio-coach-v1.md)   | In progress: 8/62 clips published, inline playback in app; `dead-bug` approved (upload pending), next clip `plank`, production playback recheck |

To resume in any Claude (Claude Code) or ChatGPT/Codex session: **«رودمپ مارکتینگ رو پیش ببر»** or **«رودمپ ویدئوهای تمرین رو پیش ببر»**. The agent should read this index and the linked roadmap from `master`, verify current repo/deployment state, carry out the next authorized task, then update the roadmap status and evidence. Never infer completed deployment from a merged commit.

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
- Both agents work from these files and `AGENTS.md` only (directive 107): pull `master` first, and in the same commit
  as the work update the item, the roadmap's summary/checkpoint table and this index row so they never disagree.
