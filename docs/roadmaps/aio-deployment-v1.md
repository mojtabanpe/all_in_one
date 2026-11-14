# AIO Deployment v1

Status: implemented locally on 2026-11-14; GitHub verification pending. Unpushed under directive 124.

| Item                             | State        | Evidence / next step                                                                                                                                                                                                       |
| -------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skip documentation-only releases | DONE locally | CI compares the full push with `git diff --no-renames`, marks code/configuration runs with a SHA-specific artifact, and Deploy checks the successful triggering run before building images. CI still checks documentation. |
| Keep manual deployment           | DONE locally | `workflow_dispatch` bypasses the documentation gate. Unknown/unavailable comparison history requires deployment; a missing/expired marker safely skips automatic release.                                                  |
| GitHub verification              | TODO         | After an owner-authorized push, verify a documentation-only push skips build/deploy and a mixed code/documentation push releases after successful CI.                                                                      |

Documentation: `.md`, `.mdx`, `.rst` files and everything under `docs/`, `design-system/`, `graphify-out/`. Other paths, including workflow and deployment configuration, require deployment. Renames inspect both old and new paths so moving code into a documentation directory still triggers deployment. The gate uses CI's full before/after range, never just the last commit.

Local validation: full-push classification scenarios, workflow YAML parsing, agent-document checks and formatting. Production behavior is not yet verified.
