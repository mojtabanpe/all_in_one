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
- Design system (Skeuo Next base): `design-system/all-in-one/MASTER.md`; tokens in
  `libs/shared/packages/ui/src/styles/theme.css`; material (pill/pillow buttons, inset inputs, card shadow) is in
  `libs/shared/packages/ui/src/lib/material.ts`: each `xMaterial(hlm: HlmX)` is called from the generated `AioX`
  constructor (the generator wires it by parameter type) and adds a later `classes()` source, which wins over Helm's
  classes while template classes still win over both. Hand-written wrappers pass material through Helm inputs
  (`aio-native-select` → `selectClass`). Style guide at admin `/design`. Each app's `styles.css` only imports the
  theme; apps load Inter + Vazirmatn through `project.json` styles. A CSS variable built from `var(--primary)` on
  `:root` resolves there, so applet accents don't reach it: put such gradients in the class itself.
- Applet accents: the applet root gets `applet-planner` / `applet-english` / `applet-health` (sets spartan `--primary`
  etc.). Dialogs/sheets are portalled to `<body>`, so pass the same class as `aio-dialog contentClass`. Duolingo-style
  chunky buttons: `aioBtn class="btn-3d"` (`btn-3d-quiet` for outline). Recolour one button by overriding `--primary`
  on it (`[--primary:var(--gem)]`); keep such class strings literal in source so Tailwind finds them.
- spartan `aioProgress`: `[value]` is a percentage (0–100); `max` is ignored by the indicator.
- Don't use `·` as a separator next to Persian digits (it reads as ۰); use the Persian comma `،`.
- Touch targets ≥ 44px; small round checkboxes get an invisible hit area (`after:absolute after:-inset-3`).
- Planner (TickTick parity): `libs/applets/planner/api` exports one service per area (lists, tasks, tags, habits,
  focus + countdowns, calendars); access goes through `PlannerAccess` (list membership). TickTick's limits live in
  `PLANNER_LIMITS` (contracts). Planner dates are Tehran calendar days. Calendar feeds are fetched with an SSRF guard.
- AI: `libs/api/ai` (`AiGateway`, per-user settings, SSRF guard; `AI_ALLOW_PRIVATE_URLS=true` only for trusted
  single-user servers). Tools live once in `apps/api/src/tools` (`ToolsService.register(sink)`); the MCP server
  (`apps/api/src/mcp`) and the in-app assistant (`apps/api/src/assistant`, web `web-assistant` in the customer header)
  both consume them. `assistant: false` keeps bulk-destructive or sharing tools out of the assistant.
- ChatGPT connection: `apps/api/src/mcp` (OAuth + personal tokens, tools from `apps/api/src/tools`,
  validated with the contracts schemas). Mounted on Express before the CSRF check. A new applet capability that
  ChatGPT should reach gets a tool there. Docs: `docs/chatgpt-mcp.md`.
- Production layout (`deploy/`, guide `deploy/README.fa.md`): one domain; `/` public SSR, `/app/` customer (PWA,
  `baseHref /app/`), `/admin/`, `/api/` + OAuth paths. Images come from `deploy/images.dockerfile` (not named
  `Dockerfile`: the `@nx/docker` plugin would infer a project from it). Servers listen on loopback (`API_HOST`, `HOST`).
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
9. **Use the `better-design` skill** (2026-10-30) for all UI/UX design, redesign and review work. The owner
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

## Design references (2026-10-30)

17. Each applet follows a reference product's UX and look (adapted to spartan + RTL + glass):
    - **planner → TickTick**: smart lists (today, tomorrow, next 7 days, all), quick-add on top, compact task
      rows with round priority-coloured checkboxes, overdue/today/completed sections, calm blue accent.
    - **english-learning → Duolingo**: bright green, chunky rounded "3D" buttons, big friendly cards, XP and
      streak flame up top, playful copy, celebration at the end of a session.
    - **health → Gordool (https://gordol.app)**: friendly Persian coach voice, daily stats at a glance
      (calories, macros, weekly training), quick "+" logging in two taps, streak "fire", step-by-step workouts.
      Each applet sets its own accent through spartan CSS variables on its root; the shared design system stays.

## Design system (2026-10-30)

18. **Base design system: Better Design "Skeuo Next"** (owner's choice). The owner asked to define the design
    system and colour palette first. Cool porcelain glass, glossy graphite pill buttons, aqua accent, 22px radius,
    pillow shadows; Inter (Latin) + Vazirmatn (Persian). It is adapted to glass, RTL and the applet accents
    above, and documented in `design-system/all-in-one/MASTER.md` (palette, contrast, type, shape, spacing).
    The living style guide is the admin page `/design`. New colours go into `theme.css` and MASTER.md together,
    with their contrast checked.

19. **Never edit spartan Helm code for design** (2026-10-30). The owner: "you should have changed the wrapper".
    `libs/shared/spartan` stays as the spartan CLI generates it; every visual customization (material, sizes, radius,
    shadows) goes into the wrappers in `libs/shared/packages` (see `material.ts`) or the theme variables.

## Recall port (2026-10-30)

20. **The English applet is Recall** (`github.com/mojtabanpe/flashcard`). Everything in that repo moves into the
    language part of this app, replacing the old english-learning model (CEFR decks + simple Leitner + "my words"):
    user decks and cards with SM-2 and Leitner leeches, study, AI card answers, reading texts (own and AI-written,
    rated), reader, practice (writing, listening, pronunciation), TTS/STT through the 9Router gateway. The old
    CEFR decks become starter decks the user can copy. No data import: users start from scratch.
21. **Recall's non-language parts come too:** the ChatGPT connection (MCP with OAuth and personal tokens), password
    reset by email, email verification at signup, and PWA install for the customer app.
22. **Domain: poshtetgarm.ir** (Recall's domain) serves this app.

## TickTick parity (2026-10-30)

23. **The planner gets every capability of TickTick's ChatGPT MCP** (https://help.ticktick.com/articles/7438129581631995904):
    task queries (search, by id, undone by preset range today/last24hour/last7day/tomorrow/next24hour/next7day,
    undone by date range ≤14 days, completed by date, multi-condition filter), lists with sections and folders,
    tasks (create, batch create, complete, checklist items, complete up to 20 in a list, update, batch update, move,
    trash), comments, assignment in shared lists with members, tags (create, rename, color, delete), habits with
    sections and check-ins (past 90 days), focus records (query ≤1 month, create, update without changing duration,
    delete), subscribed calendars (events ≤3 months) and countdowns. The same operations are exposed as tools on
    this app's ChatGPT MCP server.

## AI (2026-10-30)

24. **Each user brings their own AI.** In the profile («حساب کاربری ← هوش مصنوعی») every user sets an
    OpenAI-compatible chat url (+ model, key), a text-to-speech url and a speech-to-text url. Without them the AI
    features are off for that user; there is no server-wide AI gateway. Keys are stored encrypted, never shown again.
25. **AI can do everything, everywhere.** Planner, health and English get AI features, and an in-app assistant
    acts on the user's data with the same tools as the ChatGPT MCP (e.g. "change today's lunch to X" → finds the
    meal, estimates its calories and updates it). Every new capability gets a tool so both can use it.

## Git (2026-10-30)

16. **Work and push on `master`.** Commit directly on `master` and push to `origin master`. Never create or
    push a separate branch unless the owner explicitly asks for one in that conversation. (This overrides the
    usual "branch first" habit.)

## Memory (2026-10-29)

11. Keep every owner instruction in project memory (this file). Do not drop or weaken existing ones.

## Recall data (2026-10-31)

30. **Recall's decks, cards and texts come over** (owner, overrides the "no data import" part of directive 20).
    `deploy/import-recall.sh <email>...` copies the chosen Recall accounts (`memnpe@gmail.com`, `admin@recall.com`)
    with their decks, cards (SM-2 state), reading texts, keeping ids. Accounts keep their bcrypt passwords;
    `verifyPassword` accepts them and login re-hashes to scrypt.

## Deployment (2026-10-31)

31. **Push to `master` deploys.** `.github/workflows/deploy.yml` runs after CI passes: images are built on GitHub,
    then the server's self-hosted runner (`aio-server`, label `aio`, `/opt/actions-runner-aio`) loads them and
    runs `deploy/release.sh` (health check, rollback). CI must stay green (`nx format:check` included).

## Brand (2026-10-31)

32. **The app is called «پشتت گرم»** (Poshtet Garm), not «همه در یک». The logo is a hand holding a warm sun:
    porcelain hand, orange sun (`#e88329`) on the deep-teal primary (`#18514b`). Source:
    `design-system/all-in-one/logo/poshtetgarm-1024.png`; the PWA icons and favicons are generated from it.

## Approved custom components

- **BottomNav** (2026-10-29): floating bottom navigation for phone sizes, in `libs/shared/packages`,
  assembled from spartan pieces (`hlmBtn`, ng-icons) inside a glass container.

## Independent health coaching (2026-10-30)

26. Build our own health features, selecting useful ideas from reviewed fitness/nutrition MCPs. Do not depend on their platforms or APIs. Support home, TRX and gym routines, exercise instruction and alternatives, logged sets/progress, diet-aware meal plans and shopping lists. Exercise video links are optional and can be added later.

27. **Design review (2026-10-30):** Review and improve the current Claude-designed version when needed; preserve its established design system and verify responsive behavior before changing visuals.

28. **Full redesign with Emil Kowalski (2026-10-30):** The owner rejected the previous UI and explicitly requested `npx skills@latest add emilkowalski/skills`. Use the installed `emil-design-eng` and relevant animation skills for a substantial app redesign. This supersedes the earlier instruction to preserve the Skeuo Next visual direction. Keep Persian RTL, Spartan wrappers, mobile bottom navigation and bottom-sheet behavior. Prefer calm surfaces, strong hierarchy and purposeful fast interactions over glossy/pillow styling.

29. **Persian variable font (2026-10-30):** Use Vazirmatn Variable as the primary font across the apps, with Persian digit glyphs everywhere in the UI. The full self-hosted official font supports weights 100–900; enable its `ss01` feature for display without rewriting numeric values in storage or APIs.

30. **Health companion reference (2026-10-30):** The owner supplied Gordool screenshots and authorized redesigning the health applet for their comfortable, everyday companion feel: light-gray canvas, white generous rounded cards, asymmetrical metric tiles, colorful line icons, short actions, visual meal detail sheets and approachable training cards. Keep the existing features functional; do not invent water/fasting/challenge data or copy another app's character. Other applets retain the shared workspace design.

## Native task recurrence (2026-10-31)

33. **Recurring tasks are native planner tasks**, including TickTick RRULE compatibility, persisted completion history, retry-safe occurrence identities, timezone-aware Today/Calendar queries, MCP CRUD/batches and existing Spartan task UI controls. Reuse the task system and preserve imported task IDs. Never insert the owner's reference schedules into production or reconcile production tasks before showing the proposed changes. Use explicit source-ID mappings and the reviewed reconciliation digest; migrations must not reset existing data. See `docs/recurring-tasks.md`.
