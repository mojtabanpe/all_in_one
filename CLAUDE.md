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
- Applets: `libs/applets/<name>/{contracts,api,web}` (tags `scope:shared|api|web`, `type:applet|contracts`).
  `contracts` = Zod schemas, types, pure logic used by both sides; `api` = Nest module + seed function (the api app
  imports the module and `apps/api/src/seed.ts` calls the seed); `web` = exported routes, using only `@all-in-one/ui`
  and `@all-in-one/web/shared`. An applet never imports another applet or an app.
- Database: Prisma schema folder `libs/api/db/prisma/schema/` (`base.prisma` + `<applet>.prisma`; add back-relations on
  `User` in `base.prisma`). Then `pnpm nx run api-db:prisma-migrate --name=<change>`. Never edit applied migrations.
- Auth: global `AuthGuard` (cookie `aio_session`, JWT); mark open routes `@Public()`, restrict with `@Roles('ADMIN')`,
  read the user with `@CurrentUser()` (`@all-in-one/api/auth`). Frontend: `authGuard(role?)`, `guestGuard`,
  `authInterceptor`, `LoginPage` (route data `{ appName, allowRegister }`) from `@all-in-one/web/shared`.
- Angular gotchas seen here: never call `inject()` inside an `httpResource`/`computed` callback (use a field);
  `withComponentInputBinding()` sets unbound inputs to `undefined` (don't rely on input defaults in routed components);
  a `@for` variable shadows a component method of the same name.
- Scripted edits: Prettier reformats files, so `str.replace` patches can silently miss — assert the match or use the Edit tool.
- The api reads `API_PORT`, not `PORT`: Nx loads the root `.env` into every task, and `PORT` would leak into the Angular dev servers.
- Tags: `scope:api`, `scope:web`, `scope:shared`; `@nx/enforce-module-boundaries` blocks api <-> web imports.
- UI wrappers (`@all-in-one/ui`, `libs/shared/packages/ui`):
  - `src/lib/spartan/*` is GENERATED from spartan Helm directives by `node tools/scripts/generate-ui-wrappers.mjs`
    (re-run after adding spartan components). `AioX extends HlmX` (inherits inputs, host bindings, host
    directives; Angular does NOT inherit `providers`, so the generator copies them), selector `hlm…` → `aio…`
    (`<button aioBtn variant="outline">`, `<section aioCard>`). Inputs named after a Helm selector keep it
    (`aioTooltip` + `[hlmTooltip]="text"`).
  - `src/lib/components/*` are hand-written wrappers for Helm _components_ (checkbox, switch, native-select,
    spinner, field-error, toaster, accordion trigger/content), plus `aio-dialog` (dialog ↔ bottom drawer),
    `AioConfirm`, `aioToast`, `aio-bottom-nav`, `aio-app-shell`, `aio-icon` + `provideIcons`.
  - ESLint `no-restricted-imports` blocks `@spartan-ng/*` outside `libs/shared/spartan` and `libs/shared/packages`.
  - `libs/shared/packages/ui/package.json` and `libs/shared/spartan/package.json` declare `sideEffects` so
    unused wrappers are tree-shaken (subclasses are otherwise kept).
- Design system: `design-system/all-in-one/MASTER.md`; tokens in `libs/shared/packages/ui/src/styles/theme.css`.
  Each app's `styles.css` only imports that theme.
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
   Its Nx project must stay named `ui-helm`: the spartan `ui` generator looks it up by that name.
4. **Wrappers are mandatory.** All spartan components are wrapped by the project's own components in
   `libs/shared/packages`. Apps and applets import only the wrappers, never spartan directly.
5. **Glassmorphism.** The whole design is glass style (translucent surfaces, backdrop blur, soft borders).
   Implement it through spartan theming (CSS variables / Helm classes) and the wrappers.
6. **Mobile: floating bottom navigation.** On phone sizes every app shows a floating bottom navigation bar.
7. **Mobile: bottom sheets, never modals.** On phone sizes every notification, alert, dialog and
   confirmation is shown as a bottom sheet. Modals are not used on mobile.
8. **Use the `ui-ux-pro-max` skill** for design decisions (palette, typography, layout, UX rules).
15. **Use the `better-design` skill** (2026-10-30) for all UI/UX design, redesign and review work. The owner
    judged the first visual design "very bad"; redesign through better-design. The skill needs the Better
    Design MCP (`https://better-design.com/api/mcp`); if it is not connected, say so and do not claim its
    guidance was used. better-design takes precedence over generic design advice when both apply.

## Applets (2026-10-29)

9. **`libs/applets`** holds applets: self-contained features that work independently and can be
   embedded in any app/UI. An applet must not depend on a specific app.
10. Current applets:
    - **planner**
    - **english-learning**
    - **health**, made of many sub-areas:
      - _Fitness_: TRX, gym, walking, a specific sport, home workouts, and more.
      - _Nutrition_: evaluate each meal; ask whether the user follows a specific diet; offer diets
        the app knows for the user to pick; or have the app plan the user's meals and give the recipes.

## Decisions (2026-10-29)

12. **Language: Persian, RTL.** The whole UI is Persian (`lang="fa" dir="rtl"`, Vazirmatn font).
    English-learning content stays English where it is the subject being learned.
13. **Toasts:** short, transient toasts use spartan `sonner` (bottom position, above the bottom nav).
    Dialogs, alerts and confirmations on phones are bottom sheets (spartan drawer/sheet), never modals.
14. **Applets ship as MVP + backend:** auth first, then Prisma tables and api endpoints per applet.

## Git (2026-10-30)

16. **Work and push on `master`.** Commit directly on `master` and push to `origin master`. Never create or
    push a separate branch unless the owner explicitly asks for one in that conversation. (This overrides the
    usual "branch first" habit.)

## Memory (2026-10-29)

11. Keep every owner instruction in project memory (this file). Do not drop or weaken existing ones.

## Approved custom components

- **BottomNav** (2026-10-29): floating bottom navigation for phone sizes, in `libs/shared/packages`,
  assembled from spartan pieces (`hlmBtn`, ng-icons) inside a glass container.
