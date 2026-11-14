# AIO Deployment v1

Status: pushed with owner authorization on 2026-11-14. Mixed-push CI passed and automatic image build started; release completion and documentation-only skip verification are in progress.

| Item                             | State        | Evidence / next step                                                                                                                                                                                                       |
| -------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skip documentation-only releases | DONE locally | CI compares the full push with `git diff --no-renames`, marks code/configuration runs with a SHA-specific artifact, and Deploy checks the successful triggering run before building images. CI still checks documentation. |
| Keep manual deployment           | DONE locally | `workflow_dispatch` bypasses the documentation gate. Unknown/unavailable comparison history requires deployment; a missing/expired marker safely skips automatic release.                                                  |
| GitHub verification              | TODO         | After an owner-authorized push, verify a documentation-only push skips build/deploy and a mixed code/documentation push releases after successful CI.                                                                      |

Documentation: `.md`, `.mdx`, `.rst` files and everything under `docs/`, `design-system/`, `graphify-out/`. Other paths, including workflow and deployment configuration, require deployment. Renames inspect both old and new paths so moving code into a documentation directory still triggers deployment. The gate uses CI's full before/after range, never just the last commit.

Local validation: full-push classification scenarios, workflow YAML parsing, agent-document checks and formatting. Production behavior is not yet verified.

## GitHub evidence — 2026-11-14

- `e80b9a9` pushed with owner authorization. All 63 local Nx lint/test/build/typecheck tasks and formatting passed under Node 24.
- [CI 43568427512](https://github.com/mojtabanpe/all_in_one/actions/runs/43568427512) succeeded and uploaded the SHA-specific deployment marker for the mixed documentation/workflow/script push.
- [Deploy 43568710287](https://github.com/mojtabanpe/all_in_one/actions/runs/43568710287) passed the changes gate and started image builds. Release completion is still pending.
- This documentation-only follow-up is the real GitHub skip test; its CI and skipped build/deploy jobs must be checked before claiming success.
