<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

# Project conventions

- Apps: `api` (NestJS 12 + Prisma 7), `public` (Angular 22 SSR, no login), `admin`, `customer` (Angular 22). See README.md.
- Use Node 24 (`.nvmrc`). Angular 22 refuses Node < 22.22.3.
- Backend: follow the `nestjs` skill (v12 APIs). Validate input with Zod schemas from `@all-in-one/shared/schemas` via `@Body({ schema })`.
- Frontend: follow `angular-developer` and `spartan` skills. Signals, `httpResource`, Signal Forms. Apps, applets and feature code use the wrapper components from `libs/shared/packages`, never `@spartan-ng/helm/*` directly (see "User directives").
- Shared schemas use `import * as z from 'zod/mini'` (named `{ z }` imports defeat tree-shaking in the browser).
- Database: edit `apps/api/prisma/schema.prisma`, then `pnpm nx run api:prisma-migrate --name=<change>`. Never edit applied migrations.
- The api reads `API_PORT`, not `PORT`: Nx loads the root `.env` into every task, and `PORT` would leak into the Angular dev servers.
- Tags: `scope:api`, `scope:web`, `scope:shared`; `@nx/enforce-module-boundaries` blocks api <-> web imports.
- Before pushing: `pnpm nx run-many -t lint test build typecheck`.

# User directives (binding — given by the project owner)

Every instruction the owner gives is recorded here and must be followed in every session.
When the owner gives a new instruction, add it to this list in the same change.

## UI components (2026-10-29)

1. **Spartan only.** Every UI component used anywhere in the project must come from spartan/ui
   (Brain + Helm). Check spartan first (`pnpm nx g @spartan-ng/cli:info --json`, https://www.spartan.ng/components).
2. **No custom component without permission.** If spartan has no solution, ASK the owner before
   building a custom component. Never build one silently. Record each approval below under
   "Approved custom components".
3. **Spartan lives in `libs/shared/spartan`.** The copied Helm code (spartan CLI `componentsPath`) is there.
4. **Wrappers are mandatory.** All spartan components are wrapped by the project's own components in
   `libs/shared/packages`. Apps and applets import only the wrappers, never spartan directly.
5. **Glassmorphism.** The whole design is glass style (translucent surfaces, backdrop blur, soft borders).
   Implement it through spartan theming (CSS variables / Helm classes) and the wrappers.
6. **Mobile: floating bottom navigation.** On phone sizes every app shows a floating bottom navigation bar.
7. **Mobile: bottom sheets, never modals.** On phone sizes every notification, alert, dialog and
   confirmation is shown as a bottom sheet. Modals are not used on mobile.
8. **Use the `ui-ux-pro-max` skill** for design decisions (palette, typography, layout, UX rules).

## Applets (2026-10-29)

9. **`libs/applets`** holds applets: self-contained features that work independently and can be
   embedded in any app/UI. An applet must not depend on a specific app.
10. Current applets:
    - **planner**
    - **english-learning**
    - **health**, made of many sub-areas:
      - *Fitness*: TRX, gym, walking, a specific sport, home workouts, and more.
      - *Nutrition*: evaluate each meal; ask whether the user follows a specific diet; offer diets
        the app knows for the user to pick; or have the app plan the user's meals and give the recipes.

## Decisions (2026-10-29)

12. **Language: Persian, RTL.** The whole UI is Persian (`lang="fa" dir="rtl"`, Vazirmatn font).
    English-learning content stays English where it is the subject being learned.
13. **Toasts:** short, transient toasts use spartan `sonner` (bottom position, above the bottom nav).
    Dialogs, alerts and confirmations on phones are bottom sheets (spartan drawer/sheet), never modals.
14. **Applets ship as MVP + backend:** auth first, then Prisma tables and api endpoints per applet.

## Memory (2026-10-29)

11. Keep every owner instruction in project memory (this file). Do not drop or weaken existing ones.

## Approved custom components

- **BottomNav** (2026-10-29): floating bottom navigation for phone sizes, in `libs/shared/packages`,
  assembled from spartan pieces (`hlmBtn`, ng-icons) inside a glass container.
