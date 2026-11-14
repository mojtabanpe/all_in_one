# AIO Deployment v1

Status: DONE — verified on GitHub on 2026-11-14. Mixed code/documentation pushes deploy after successful CI; documentation-only pushes keep CI and skip every build/release job.

| Item                             | State        | Evidence / next step                                                                                                                                                                                                       |
| -------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skip documentation-only releases | DONE locally | CI compares the full push with `git diff --no-renames`, marks code/configuration runs with a SHA-specific artifact, and Deploy checks the successful triggering run before building images. CI still checks documentation. |
| Keep manual deployment           | DONE locally | `workflow_dispatch` bypasses the documentation gate. Unknown/unavailable comparison history requires deployment; a missing/expired marker safely skips automatic release.                                                  |
| GitHub verification              | DONE         | Mixed-push CI/Deploy succeeded for `e80b9a9`; docs-only CI succeeded for `6312dcb`, with all image/release jobs skipped. See linked evidence below.                                                                        |

Documentation: `.md`, `.mdx`, `.rst` files and everything under `docs/`, `design-system/`, `graphify-out/`. Other paths, including workflow and deployment configuration, require deployment. Renames inspect both old and new paths so moving code into a documentation directory still triggers deployment. The gate uses CI's full before/after range, never just the last commit.

Local validation: full-push classification scenarios, workflow YAML parsing, agent-document checks and formatting. Production and documentation-only behavior verified below.

## GitHub evidence — 2026-11-14

- `e80b9a9` pushed with owner authorization. All 63 local Nx lint/test/build/typecheck tasks and formatting passed under Node 24.
- [CI 43568427512](https://github.com/mojtabanpe/all_in_one/actions/runs/43568427512) succeeded and uploaded the SHA-specific deployment marker for the mixed documentation/workflow/script push.
- [Deploy 43568710287](https://github.com/mojtabanpe/all_in_one/actions/runs/43568710287) succeeded, including image build, server pull and release activation. Public `/api/health` returned `status: ok`, `database: up` afterward.
- Documentation-only push `6312dcb`: [CI 43568815321](https://github.com/mojtabanpe/all_in_one/actions/runs/43568815321) succeeded and produced no deployment marker. [Deploy 43569102366](https://github.com/mojtabanpe/all_in_one/actions/runs/43569102366) completed successfully with only `changes` running; `build`, `pull`, `bundle`, and `deploy` all have conclusion `skipped`. No image build or server release happened for this push.
