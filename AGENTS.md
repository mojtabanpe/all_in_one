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
- Translations (`@all-in-one/localization`): the message table is a lazy chunk (`loadMessages()`), kept out of the
  customer app's 1.2 MB initial budget. `provideAioLocale()` in each app config makes English and SSR wait for it;
  Persian renders at once. Server code calls `await loadMessages()` before `translateMessage`.
- Directional icons (arrows/chevrons) flip with the page: drawn for LTR → `class="rtl:-scale-x-100"`, drawn for
  RTL → `class="ltr:-scale-x-100"`.
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
- ChatGPT/Claude connection: `apps/api/src/mcp` (OAuth + personal tokens, tools from `apps/api/src/tools`,
  validated with the contracts schemas). Mounted on Express before the CSRF check. A new applet capability that
  ChatGPT should reach gets a tool there. Docs: `docs/chatgpt-mcp.md`.
- Production layout (`deploy/`, guide `deploy/README.fa.md`): one domain; `/` public SSR, `/app/` customer (PWA,
  `baseHref /app/`), `/admin/`, `/api/` + OAuth paths. Images come from `deploy/images.dockerfile` (not named
  `Dockerfile`: the `@nx/docker` plugin would infer a project from it). Servers listen on loopback (`API_HOST`, `HOST`).
  Releases are blue/green (`deploy/release.sh`): the new api/site start in the idle colour (a: 4321/4322, b: 4331/4332)
  next to the live one and the old colour stops only after the new one is healthy, so migrations run while the old
  release still serves: keep them additive (drop or rename a column the old release reads in a later release).
- Billing (`apps/api/src/billing`, schema `billing.prisma`): amounts are Rial (Zibal's unit), shown as Toman; plans are
  admin-managed in `/admin/billing` and nothing is seeded. Only a server-side Zibal verify of an owned order activates,
  once, under a per-account row lock (`activate`/`adjust`); manual changes always write a `billing_adjustments` row.
  `BillingService.isPaid(userId)` is the entitlement check. Customer page `/app/billing` is the gateway's return URL.
- Before pushing: `pnpm nx format:check` and `pnpm nx run-many -t lint test build typecheck`.

# User directives (binding — given by the project owner)

Every instruction the owner gives is recorded here and must be followed in every session.
When the owner gives a new instruction, add it to this list in the same change.

## One source for Claude and ChatGPT/Codex (2026-11-07)

107. **The owner works on this project with both Claude (Claude Code) and ChatGPT (Codex); keep them in sync**
     (owner: «یکاری کن که همیشه هماهنگ باشین»). - `AGENTS.md` is the only instruction file. `CLAUDE.md` just imports it (`@AGENTS.md`); never write
     instructions into `CLAUDE.md` or keep a second copy anywhere. `node tools/scripts/check-agent-docs.mjs`
     (run in CI) fails if `CLAUDE.md` holds anything else or two directives share a number. - New directive = the next number after the highest one in this file (never reuse a number). When a new
     instruction changes an older one, add a short «superseded by N» note to the old one instead of deleting it. - Roadmap state lives only in `docs/roadmaps/` (index: `docs/roadmaps/README.md`). Before working, `git pull
origin master` and read the index and the roadmap; after work, update its status and evidence in the same
     commit, and keep its summary, checkpoint table and index row consistent with the items below them. - Both agents commit to `master` (directive 16) with a Conventional Commit message, so each sees the other's
     work in `git log`. Never leave finished work only in a local branch or chat.

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

24. **Superseded by 86/87 (managed AI only; settings live in the admin panel).** _Original:_ **Each user brings their own AI.** In the profile («حساب کاربری ← هوش مصنوعی») every user sets an
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

11. Keep every owner instruction in project memory (this file, `AGENTS.md`; see 107). Do not drop or weaken existing
    ones.

## Approved custom components

- **LanguageSwitcher** (2026-11-02): shared Persian/English picker composed from the existing Spartan native-select wrapper for app headers, account settings and signed-out pages.

- **Repeated template compositions** (2026-11-02): shared field/error rendering, card and section headings, empty states, async buttons, skeleton lines/rows, metrics, navigation/catalog cards, native select fields, numeric Signal Forms fields and input-group submit actions in `libs/shared/packages/ui`, composed from existing Spartan wrappers under directive 67.

- **AppletHeader** (2026-11-02): shared title, subtitle and route navigation for all three applets, composed from Spartan button wrappers and icons in `libs/shared/packages/ui`.

- **BottomNav** (2026-10-29): floating bottom navigation for phone sizes, in `libs/shared/packages`,
  assembled from spartan pieces (`hlmBtn`, ng-icons) inside a glass container.

## Independent health coaching (2026-10-30)

26. Build our own health features, selecting useful ideas from reviewed fitness/nutrition MCPs. Do not depend on their platforms or APIs. Support home, TRX and gym routines, exercise instruction and alternatives, logged sets/progress, diet-aware meal plans and shopping lists. Exercise video links are optional and can be added later.

27. **Design review (2026-10-30):** Review and improve the current version (built by Claude and Codex) when needed; preserve its established design system and verify responsive behavior before changing visuals.

28. **Full redesign with Emil Kowalski (2026-10-30):** The owner rejected the previous UI and explicitly requested `npx skills@latest add emilkowalski/skills`. Use the installed `emil-design-eng` and relevant animation skills for a substantial app redesign. This supersedes the earlier instruction to preserve the Skeuo Next visual direction. Keep Persian RTL, Spartan wrappers, mobile bottom navigation and bottom-sheet behavior. Prefer calm surfaces, strong hierarchy and purposeful fast interactions over glossy/pillow styling.

29. **Persian variable font (2026-10-30):** Use Vazirmatn Variable as the primary font across the apps, with Persian digit glyphs everywhere in the UI. The full self-hosted official font supports weights 100–900; enable its `ss01` feature for display without rewriting numeric values in storage or APIs.

## Native WebView shells (2026-10-31)

30. Maintain an Android and macOS WebView shell for this repository in `/Users/mojtabanpe/Projects/personal/hybrid/Poshtetgarm`, following the existing shell in `/Users/mojtabanpe/Projects/personal/hybrid/Recall`. Use this project’s official Poshtetgarm logo for the native app icons; do not retain Recall branding.

## PWA installation (2026-10-31)

31. Provide the customer app as an installable PWA, following the existing Recall implementation while retaining Poshtetgarm branding.

## Overlay scrolling (2026-10-31)

32. Dialogs and bottom sheets must stay within the viewport and scroll long content while keeping their title and actions accessible. Phones always use bottom sheets, including in landscape; never open a desktop modal on a phone.

## PWA notifications (2026-10-31)

33. Provide opt-in Web Push notifications for the customer PWA: per-device subscriptions,
    account settings with test/disable controls, and server-side planner reminders.

34. Habits support one or multiple reminder times, editable per habit, delivered through PWA Web Push on the habit's scheduled weekdays.

35. All app dates, including date selection controls, must use the Persian Solar Hijri (شمسی) calendar and Persian digits. Keep Gregorian ISO date values in storage and APIs; use the shared Spartan Jalali wrapper for date inputs. (In English mode dates are Gregorian: see 68 and 101.)

36. Use the `better-ui` skill when refining UI details, including the shared Persian calendar/date controls.

37. Provide an opt-in daily language-deck review notification with a configurable Tehran time. Send only when the user has non-suspended cards due for review; expose the setting to the assistant and ChatGPT tools too.

38. Deploy through GitHub CI/CD. Never transfer local project files, local configuration files, or locally built artifacts directly to production over SSH, SCP, or rsync.

39. Provide opt-in native push notifications for the Android and macOS WebView apps, using the same task, habit and language review reminders and account controls as the PWA.

## TRX exercise references (2026-10-31)

40. Use the five owner-supplied TRX PDFs (Core, Legs & Hips, Arms & Shoulders, Stretch, Chest and Back) as references for expanding the exercise library, including their exercise images and guidance. Display only the exercise illustration cropped from each page, never the complete English page; adapt the remaining instructions, repetitions and rest times into Persian guidance.

41. Fix and refine the planner task-detail sheet for phones: controls must stay within the viewport, long content must scroll with closing actions accessible, date/time controls must fit, and recurrence settings must have a clear, compact Persian layout.

42. In the nutrition meal plan, show both “replace” and “recipe” actions as matching, clearly visible Spartan buttons. Keep the meal text and actions in separate, readable areas on phones.

43. Provide AI assistance in the nutrition meal-replacement sheet using the user's configured AI. Keep meal selection clear and give the options comfortable bottom spacing and an accessible closing action on phones.

44. When a user has an active diet, hide the diet-recommendation section by default. Show other diets only when the user explicitly asks to browse or choose another diet.

45. Supply a macOS installer without native notifications when requested; keep the notification-enabled Android and future macOS variants available separately.

46. Publish both Android APK and macOS DMG installers in GitHub Releases so users can download them there, rather than relying only on temporary Actions artifacts.

47. When a planner task is marked done, show a short success notification inside the app after the save succeeds, using the shared Spartan Sonner toast.

48. In-app notifications must use the same Vazirmatn Variable font and Persian digit shaping as the rest of the app, including notification action buttons.

49. Habit reminder delete buttons must have their own clear space beside each time input, without overlap or inset positioning on phones.

50. Remove the visible “تکرارشونده” label beside tasks and use a recurrence icon distinct from a reload symbol, with an accessible label.

51. Planner navigation order is tasks, habits, calendar, focus, countdowns (swap the former calendar and habits positions).

52. The habit week strip must show the current calendar week from Saturday through Friday, with Saturday first on the right in RTL.

53. The health overview week strip must also show the current week from Saturday on the right through Friday on the left.

54. Keep health macro cards aligned and readable on phones: separate the icon from the label/value vertically and keep each numeric value with its gram unit on one line.

55. All bottom sheets must have shared bottom breathing room in addition to the device safe-area inset, including the assistant composer and sheets without footer actions. Apply this in the shared dialog wrapper.

56. Display large dashboard and health statistics with compact proportional Persian digits, avoiding the wide spacing of tabular numerals while retaining Vazirmatn and Persian digit shaping.

57. Build and distribute separate Android APKs for ARM64, ARM32 and x86_64 to reduce download size, and push pending changes to master before starting this build.

58. **Guided workout sessions (2026-11-01):** Open training sessions as independent pages, never bottom sheets. Show the fixed prescribed set one step at a time, with only its relevant repetition/time/load information and available exercise illustrations, videos and Persian instructions. Advance after the user confirms completion; do not ask them to edit prescribed values during the session.

59. **Habit text direction (2026-11-01):** Keep habit progress, user-entered units and streak text readable in Persian RTL, including English names/units. Isolate mixed-direction values and keep progress and streak in separate groups that wrap cleanly on phones.

60. **Language shadowing (2026-11-01):** Include shadowing in language practice: sentence-by-sentence listening and repetition alongside the speaker, adjustable playback speed, optional transcript, and local voice recording for self-comparison. Use the user's AI settings and expose exercise generation to the assistant and ChatGPT tools.

61. **English immersion (2026-11-01):** The entire English tab, including cards, definitions, examples, navigation, feedback, errors, dialogs and notifications, is English-only and LTR. This overrides Persian/RTL and Persian-digit defaults within English routes. Use English definitions for starter cards and translate legacy Persian content for display without losing original data or review schedules.

62. **Shared applet header (2026-11-02):** Use one reusable component in `libs/shared/packages` for the title, subtitle and top route navigation of planner, English and health. Supply text, links and icons through inputs; keep typography, icon placement and spacing consistent, while preserving each applet’s accent and English-only LTR behavior. The owner explicitly approved this composed component.

63. **Brand spelling and logo (2026-11-02):** Use exactly `Poshtetgarm` everywhere the app name appears, including headers, PWA/native notifications, email, install metadata and MCP pages. Use the official hand-and-sun logo in both the top header and sidebar. This replaces all earlier Persian brand spellings.

64. **Assistant multiline composer (2026-11-02):** The assistant composer must wrap long text inside its bounds and support multiple lines. Enter inserts a newline; sending uses the explicit send button. Keep the composer and chat messages within the viewport on phones.

65. **Bottom-sheet motion (2026-11-02):** Give all shared bottom sheets a consistent smooth open/close animation. Keep closing faster than opening, allow interrupted transitions and swipe dismissal, and respect reduced-motion settings. Implement this in the shared wrapper/theme without changing generated Spartan Helm code.

66. **Stable loading layouts (2026-11-02):** Reduce visible layout shifts throughout the app and during main/sub-navigation. Use the shared Spartan skeletons, especially above the fold; reserve the geometry of headings, summaries and cards, avoid showing empty/default states before data resolves, and verify loading-to-content behavior with delayed responses on phones and desktop.

67. **Reusable template compositions (2026-11-02):** Whenever similar template code is used in more than two places across the apps/applets, extract it to a reusable component in `libs/shared/packages` and consume it through inputs (and projection for controls/actions). Apply this to existing templates too, including the home navigation cards. The owner explicitly authorizes shared compositions of existing Spartan wrappers for these repeated patterns; preserve native semantics, forms, RTL/LTR and stable loading geometry.

68. **Application language preference (2026-11-02):** Provide a persistent, explicit Persian/English choice for the whole application. Persian uses Persian interface copy and RTL; English uses English interface copy, Latin digits and LTR across all routes, navigation, forms, dialogs, errors and notifications. Never switch the application language based on the current applet/URL. This supersedes route-driven English-only UI in directive 61 and the global Persian-only UI default where a language has been selected. Keep user-authored data unchanged and retain English words/sentences where they are the actual subject of a language exercise. Shared locale services, translation catalogs and language controls live in `libs/shared/packages`.

69. **Populated bilingual screens and layout (2026-11-02):** Verify Persian/English with populated planner tasks, active fasting, a weight goal, a full meal plan, personal routines, exercise equipment/muscle labels and assistant suggestions. Localize complete dynamic sentences with explicit values, not isolated words in durations or program names. Synchronize Angular CDK/Spartan direction with the selected locale; keep accordion rows, mixed-direction dates/times, counters, statistics and activity labels readable and contained on phones and desktop. Use reviewed exercise terminology and preserve stored user data.

70. **Profile language and release version (2026-11-02):** Put the signed-in application's language choice in the account/profile settings, not the shared header. Show the built application's version there. Every production release gets an increased SemVer patch automatically through GitHub deployment; the displayed version must belong to the installed assets, including after rollback. Translate overdue planner tasks as “Overdue”, never “backward”.

71. **Reliable PWA language reminders (2026-11-02):** Restore the installed PWA's push registration for the authenticated account and selected language, show registration failures instead of claiming notifications are enabled, and retry after reconnecting. Language review delivery must not be blocked by errors in unrelated planner reminder queries. Verify the due-card and device delivery paths separately.

72. **Daily language reminder recovery (2026-11-02):** A missed language review reminder remains eligible after its configured Tehran time through the end of the same Tehran day, while due cards and a valid device exist. Preserve one successful reminder per device/day, disabled and suspended-card rules, and the short midnight grace for yesterday; never replay older days. This prevents a missed five-minute sweep from silently losing the whole day's review.

73. **Exercise video production library (2026-11-04):** Maintain a roadmap and an English generation prompt for every catalog exercise, covering bodyweight and all equipment. All videos use one consistent adult male animated character with approved shared reference images. Include a Google storage publication workflow with public viewer links for reviewed videos; do not assume Gemini can upload or change sharing without connected tools and authorization. Keep stable exercise slugs in filenames and the publication manifest.

74. **Bilingual fitness catalog (2026-11-04):** Show all seeded exercise names, instructions, common mistakes and workout-program titles, descriptions, exercise names and notes in the selected Persian/English application language. Preserve canonical database values, stable slugs, media URLs and user-authored content; keep reviewed display translations in the shared localization package and check coverage against the seeded catalogs.

75. **Approved exercise videos (2026-11-06):** Add jumping jack to the exercise catalog and video roadmap. The owner approves gemini_generated_video_C98E2A1A.mp4 for jumping-jack and explicitly accepts gemini_generated_video_ED7EE4D1.mp4 for roadmap exercise 02 (reverse-lunge), retaining its stable slug.

76. **Local Better skills for UI improvements (2026-11-06):** Use the accessible local Better skill collection for UI improvements, including better-layout, better-typography, better-ui, better-accessibility, better-colors and better-writing as relevant. When Better Design MCP is unavailable, continue with these local skills; do not claim MCP guidance was retrieved. Preserve Spartan wrappers, the established design system and bilingual responsive behavior.

77. **Enamad footer (2026-11-06):** Display the owner-supplied Enamad seal in the public website footer for payment readiness. Preserve the official trustseal.enamad.ir verification/image URLs (id 8559991, code fx45IyoDfirdQiX27wcCauu2mXGEzE67) and origin referrer policy.

78. **Automatic acquisition analytics (2026-11-06):** Record the limited first-party acquisition events automatically without an opt-in request. Keep payloads restricted to random visitor ID, event name, language and bounded campaign fields; never send account credentials, task content or health details. Retain the account opt-out, existing opt-outs and 90-day event retention. This supersedes the earlier roadmap opt-in approach; do not record fabricated consent.

79. **No analytics toggle (2026-11-06):** Remove the analytics on/off option from account settings too. Do not show an opt-in prompt or end-user analytics toggle. This supersedes directive 78's account-toggle requirement; retain limited payloads and 90-day data retention.

80. **Zibal payment provider (2026-11-06):** Use Zibal for payments, using the owner's Digfon project as a configuration/reference implementation. Keep the supplied merchant credential only in server secrets or ignored local environment settings; never put its value in source, documentation, logs or browser responses. The reference project is `/Users/mojtabanpe/Projects/personal/digfon-monorepo`.

81. **Server Zibal credential exception (2026-11-06):** The owner explicitly permits `ssh flashcard` to set the Zibal credential in persistent server configuration if deployments preserve that configuration. Preserve file ownership/permissions and never print the credential. This is a narrow exception to directive 38 for server-secret configuration; code, local config files and built artifacts still deploy through GitHub CI/CD.

82. **SMS template variables:** SMS provider templates must use percent-delimited variables such as `%code%`, `%name%`, `%minutes%`, `%plan%` and `%expiry_date%`; curly-brace placeholders are not recognized. Use this format for every submitted SMS template.

83. **Pending SMS template IDs (2026-11-06):** Continue independent roadmap work while SMS templates await approval. The owner will supply approved template IDs in this order: AUTH_CODE, PASSWORD_RESET, PASSWORD_CHANGED, SUBSCRIPTION_ACTIVATED, SUBSCRIPTION_EXPIRING. Do not invent IDs or mark SMS delivery operational before configuration and verification.

84. **Persian conversation (2026-11-06):** Talk to the owner in Persian in every chat and session: replies, short progress updates, questions and summaries. Only code, paths, commands and identifiers stay as written.

85. **Freemium trial and earned extensions (2026-11-07):** Give newly registered customers a seven-day free trial. Use actual product activity to decide which follow-up offers to show. Allow eligible customers to earn additional weeks through verified actions, such as joining the official Telegram or Instagram community. After trial and earned access end, keep the app usable on the free tier. AI features require active trial, earned access or a paid plan. Enforce AI access on the server and open the shared plan-selection bottom sheet when a free customer tries an AI feature. Exact offer eligibility, verification, plan prices and the AI provider model are separate decisions.

86. **Managed AI only (2026-11-07):** Customers never configure or use their own AI provider, URL, API key, model or proxy. Poshtetgarm supplies managed AI during trial, earned access and paid access. This supersedes directive 24 and any earlier per-user provider instructions. Legacy stored credentials are never read or reused as managed credentials.

87. **Admin AI configuration and presets (2026-11-07):** Move the existing AI settings experience to the admin panel only. Keep chat, TTS and STT settings, connection tests, remembered models and saved presets that administrators can apply again. Seed the managed configuration and presets once from the explicitly designated owner account; encrypted keys stay on the server and regular customers have no provider settings. This narrow import supersedes the legacy reuse prohibition in directive 86 for that account only.

88. **Faraz SMS templates (2026-11-07):** Use Faraz SMS with sender line `20002178584475` (line superseded by 117). Approved pattern IDs in directive 83 order: `AUTH_CODE=55qc3IG5ba`, `PASSWORD_RESET=N7zuaY8kHN`, `PASSWORD_CHANGED=t7D480PuMg`, `SUBSCRIPTION_ACTIVATED=K1pz92FHPc`, `SUBSCRIPTION_EXPIRING=5O4Ya9gB3f`. These are template IDs, not an API key. Keep the API key in server secrets.

## Recall data (2026-10-31)

90. **Recall's decks, cards and texts come over** (owner, overrides the "no data import" part of directive 20).
    `deploy/import-recall.sh <email>...` copies the chosen Recall accounts (`memnpe@gmail.com`, `admin@recall.com`)
    with their decks, cards (SM-2 state), reading texts, keeping ids. Accounts keep their bcrypt passwords;
    `verifyPassword` accepts them and login re-hashes to scrypt.

## Deployment (2026-10-31)

91. **Push to `master` deploys.** `.github/workflows/deploy.yml` runs after CI passes: images are built on GitHub,
    then the server's self-hosted runner (`aio-server`, label `aio`, `/opt/actions-runner-aio`) loads them and
    runs `deploy/release.sh` (health check, rollback). CI must stay green (`nx format:check` included).

## Brand (2026-10-31)

92. **The app is called «Poshtetgarm»**, not «همه در یک». The logo is a hand holding a warm sun:
    porcelain hand, orange sun (`#e88329`) on the deep-teal primary (`#18514b`). Source:
    `design-system/all-in-one/logo/poshtetgarm-1024.png`; the PWA icons and favicons are generated from it.

## Glass language and closable sidebar (2026-11-01)

97. **The language applet is glass and matches the rest of the app** (owner: "very different from the rest; make it
    glass, and very cool"). No Duolingo chunky `btn-3d` / `border-b-4` there any more: English pages sit on the
    `lx-stage` ambient light with `lx-glass` panels (`theme.css`); its accent is violet (see 99).
98. **The desktop/tablet sidebar can be closed completely** (`collapsible="offcanvas"`, header button or Ctrl/⌘+B,
    remembered in a cookie). The shell's `main` is `min-w-0` so wide content never slides under the sidebar.

99. **Health is glass too, and the accents swapped** (2026-11-01, owner): health uses the green
    (`--health: oklch(0.53 0.15 152)`), English moved to violet (`--english: oklch(0.52 0.2 293)`). Both applets sit
    on `lx-stage` with their own ambient colours (`--lx-1..4` on the applet class); health keeps the companion
    layout of directive 89, with glass cards (the `.health-calm` glass block at the end of `theme.css`).

100.  **Static text follows the language, user content is never translated** (2026-11-02, owner). In English mode every
      piece of the app's own copy is English and the layout is LTR; names, titles, units and notes the user wrote (decks,
      texts, habits, sections, tags, tasks, checklist items) are shown exactly as written: never pipe them through
      `aioTranslate`. Pass them as `{0}` values of a translated template instead of concatenating.
      `aio-dialog` shows `title`/`description` as given (callers pipe fixed copy); items the app itself creates (the
      inbox) do follow the language.

101.  **Dates follow the language** (2026-11-02, owner). Persian: Solar Hijri with Persian digits; English: Gregorian,
      English month names. Every displayed date goes through the `aioDate` pipe (`{{ iso | aioDate: { month: 'long' } }}`)
      or `AioLocale.date()` in code; never format a date with `Intl` or `faDate` directly in UI. `aio-date-input` shows a
      Solar Hijri picker in Persian and a Gregorian one in English; form/API values stay Gregorian ISO days. The health
      birth year is entered in the calendar of the active language (stored Gregorian).

102.  **Shadowing is checked and scored** (2026-11-02, owner). Every shadowing recording is transcribed by the user's
      speech-to-text and compared word by word with the sentence (`checkShadowing` in the English contracts): skipped,
      wrong and extra words are shown and listed. A finished dialogue gets a strict 0–100 session score (a missed/wrong
      word costs 1.5 words, an extra word 0.75; unrecorded sentences count 0), saved with its date in
      `english_shadowing_sessions` and shown on demand as a chart (spartan `chart` → `AioChartImports`). The check reads a
      transcript, so it judges words, not accent or intonation; say so in the UI.
      **Writing, speaking and listening are scored too** (2026-11-02, owner): writing/speaking from the mistakes in the
      AI feedback (`writingScore`: each mistake costs 1.5 words of the answer), listening by first picks on the
      comprehension questions (`listeningScore`). All four live in one table (`EnglishPracticeScore`, `kind`, mapped to
      `english_shadowing_sessions`), at `/english/practice/scores`; each mode's chart shows only its own scores.
      Tool: `list_practice_scores` (optional `kind`).
      Pass user/learning content into translated templates as `verbatim(...)` so it is never translated.

103.  **Now applies to the admin AI settings (`/admin/ai`), see 86/87; customers have no AI settings.** **AI model names are remembered** (2026-11-02, owner: "I'm afraid to change a model and forget the old one").
      Every model name saved for chat, text-to-speech (both voices) and speech-to-text is kept per service
      (`chatModels`/`ttsModels`/`sttModels`, most recent first, at most 15) and shown as chips under the field: tap to
      use it again, × to forget it (`forgetModel`). Technical fields (urls, model names, keys) carry `lang="en"` so they
      show Latin digits.
      **Saved setups** (owner, same day: "a save button per section, url and API key saved too"): «ذخیره در فهرست» stores
      the section's url, model(s) and key as a row of `user_ai_presets` (key sealed like the settings; an empty key
      field = the stored key; identical rows are not duplicated; 30 per service). Each section lists its rows in a
      spartan table (model / url, key as `…last4`, «استفاده», delete); «استفاده» makes the row current, key included,
      copied sealed. The key itself never reaches the browser.
      **No model chips, clear sections** (2026-11-03, owner): the saved setups hold the whole config, so the model-name
      chips under the fields are gone from the UI (the backend still keeps the lists). Chat, text-to-speech and
      speech-to-text each sit in their own bordered panel so the boundary between them is obvious.
      **Proxy per service** (2026-11-03, owner): each of the three sections has a «پراکسی» checkbox; when ticked, a
      proxy url (default `http://127.0.0.1:7890`, `DEFAULT_AI_PROXY`) is shown and that service's requests go through it
      (undici `ProxyAgent`, `proxyAgent()` in `net-guard.ts`). On/off and the url are stored in `user_ai_settings`
      (`<kind>ProxyOn`, `<kind>Proxy`) and in saved setups (`user_ai_presets.proxy`, null = direct).
      **ElevenLabs** (2026-11-03, owner): text-to-speech and speech-to-text have an «ElevenLabs» checkbox next to the
      proxy one; when ticked, that service calls the ElevenLabs api (not OpenAI-compatible): `xi-api-key` header,
      `/v1/text-to-speech/{voice id}` (the model fields hold voice ids, `eleven_multilingual_v2`) and
      `/v1/speech-to-text` (`model_id`, default `scribe_v1`). An empty url means `https://api.elevenlabs.io`.
      Stored as `ttsEleven`/`sttEleven` and `user_ai_presets.elevenlabs`.
      **Deepgram** (2026-11-03, owner): a «Deepgram» checkbox beside it (one provider at a time). `Authorization: Token`,
      `/v1/speak?model=<voice>` (default `aura-2-thalia-en`) and `/v1/listen?model=` (raw audio body, default `nova-3`);
      an empty url means `https://api.deepgram.com`. Stored as `ttsDeepgram`/`sttDeepgram` and
      `user_ai_presets.deepgram`. Internally `AiTarget.provider` is `openai | elevenlabs | deepgram`.

## Claude connection (2026-11-04)

106. **The MCP server serves Claude too** (owner: "write the ChatGPT MCP for Claude as well, and let the token page
     make tokens for Claude"). Same server, tools and personal tokens; OAuth always accepts the ChatGPT and Claude
     callback hosts (`DEFAULT_REDIRECT_HOSTS`: chatgpt.com, chat.openai.com, claude.ai, claude.com; `MCP_REDIRECT_HOSTS`
     adds more) and loopback http callbacks (Claude Code). The account card «اتصال به ChatGPT و Claude»
     (`web-ai-connection`) has ChatGPT / Claude / Claude Code tabs with each app's steps; the Claude Code tab builds the
     `claude mcp add … --header "Authorization: Bearer …"` command with the new token.

## Health companion reference (2026-10-30)

89. **Health companion reference (2026-10-30):** The owner supplied Gordool screenshots and authorized redesigning the health applet for their comfortable, everyday companion feel: light-gray canvas, white generous rounded cards, asymmetrical metric tiles, colorful line icons, short actions, visual meal detail sheets and approachable training cards. Keep the existing features functional; do not invent water/fasting/challenge data or copy another app's character. Other applets retain the shared workspace design.

## Fasting and weight goal (2026-10-31)

94. **Health has real fasting and a dated weight goal** (owner: "I don't see a fasting card… I can't set my goal, e.g.
    reach 85 kg in 2 months, and my current weight"). This replaces the "do not invent fasting data" part of
    directive 89: fasting is tracked from the user's own start/end times, never made up. The overview shows a fasting
    card (elapsed time, target protocol, end time, history) and a weight card (current weight, target by a date,
    weekly pace with a too-fast warning). A dated goal drives the daily calorie target (deficit ≤ 1,000 kcal,
    surplus ≤ 500, safe floors kept). Weigh-ins are one per Tehran day; the latest is the profile weight.
    Backend: `BodyService` (health api); tools in `apps/api/src/tools/health-body-tools.ts`.

## Native task recurrence (2026-10-31)

93. **Recurring tasks are native planner tasks**, including TickTick RRULE compatibility, persisted completion history, retry-safe occurrence identities, timezone-aware Today/Calendar queries, MCP CRUD/batches and existing Spartan task UI controls. Reuse the task system and preserve imported task IDs. Never insert the owner's reference schedules into production or reconcile production tasks before showing the proposed changes. Use explicit source-ID mappings and the reviewed reconciliation digest; migrations must not reset existing data. See `docs/recurring-tasks.md`.

## Won't Do and assistant memory (2026-11-01)

95. **Tasks can be closed as "won't do"** (owner: a task I won't do stays not done, is recorded, and no longer shows
    as overdue). Status `WONT_DO`: `done=true, wontDo=true` in the API (closed), kept in the completed history, reopened
    with `wontDo=false`. Exposed as `wont_do_task` / `update_task wont_do` on the ChatGPT MCP and the assistant.
96. **The assistant must remember what it did and speak Persian dates.** Each reply carries a tool log the client sends
    back; the system prompt has a Gregorian↔Solar Hijri table around today. It never completes a task the user asked to
    move, and uses `list_overdue_tasks` for «عقب‌افتاده».

## Floating assistant button (2026-11-03)

104. **The AI assistant opens from a floating round button** (owner) in the customer app, not the header: spartan
     `aioBtn size="icon"` (no new component), `web-assistant floating`, bottom-end corner above the phone bottom nav
     (`bottom-[calc(5.5rem+safe-area)]`), `md:bottom-6` on larger screens.

## Task links (2026-11-03)

105. **Tasks have links** (owner): `PlannerTask.links String[] @default([])`, http(s) only (`taskLink`, at most
     `TASK_LINKS_LIMIT` = 20; an update replaces the list). The task detail lists them with an open button (a plain
     `<a target="_blank">`, so a YouTube link opens the YouTube app on phones) and a remove button, plus a field to
     add more (a link without a scheme gets `https://`). MCP/assistant: `links` on create_task, update_task and the
     batch tools; series pass them to their occurrences.

## Trial for everyone and social weeks (2026-11-07)

108. **Every customer gets the week, each join adds a week** (owner, after seeing the AI paywall on a new account:
     «قرار بود کاربری که تازه ثبت‌نام می‌کنه یک هفته بتونه از پلن استفاده کنه و اگه توی تلگرام و اینستا هم جوین شد
     هر کدوم یه هفته به سابسکریپشنش اضافه کنه»). The trial runs 7 days from email confirmation, but never starts
     before the launch day (`TRIAL_LAUNCH`, 2026-11-07 Tehran), so accounts confirmed earlier also get a week.
     The Telegram and Instagram offers are open to every confirmed customer from signup (no wait for the trial to end,
     no activity requirement); each verified join adds one week once, queued after the trial, paid time and earlier
     rewards. Membership is still verified by support before the week is granted, and the offers stay off
     (`BILLING_TELEGRAM_OFFER_ENABLED`, `BILLING_INSTAGRAM_OFFER_ENABLED`) until the official pages exist. Admin
     accounts always have AI (`tier: 'staff'`). This refines directive 85.

## Sheet close button (2026-11-07)

109. **Bottom sheets close with a × icon** (owner: «هرجای اپ که می‌خوای باتم‌شیت ببینید به‌جای دکمه close آیکون ضربدر
     بذار»). The shared `aio-dialog` header has a 44px round × (`lucideX`, labelled «بستن»/«Close» for screen readers)
     beside the start-aligned title; never add a text «بستن»/«Close» button to a sheet's actions. Actions keep real
     choices only (save, cancel a form, clear a date).

## AI scope check (2026-11-07)

110. **A decision model keeps the AI inside the app's domain** (owner: «یک مدل تصمیم‌گیر می‌خوام که آیا سؤالی که از AI
     پرسیده می‌شه در حوزهٔ کاری این اپ هست یا نه، که کسی سوءاستفاده نکنه»). `AiScopeGuard` (`libs/api/ai`) asks a
     short classification call (temperature 0, JSON verdict) before free-text AI work: every assistant message (with
     the previous reply as context) and English card answers. In scope: planning/productivity, learning English,
     health/fitness/nutrition, the app itself and small talk; everything else (code, other homework, general
     knowledge, politics, legal/financial/medical diagnosis, prompt tricks) is refused with a friendly message
     (assistant reply, or 422 `AI_OUT_OF_SCOPE`). Admins switch it and pick its model in `/admin/ai` («بررسی حوزهٔ
     درخواست»; stored as `scopeOn`/`scopeModel` in the managed configuration, empty = the chat model). An unreadable
     verdict lets the request through (logged). A new free-text AI entry point must call it too.
     **A real decision model, not an LLM** (owner, same day: «منظورم چیزی مثل Jev بود… این‌جوری که الان هست هزینهٔ
     الکی داره»): the preferred provider is TypeSafe's **Jev** (non-generative; one `noul` yes/no question
     `in_scope`, `POST https://api.typesafe.ai/v1/systemone`, Bearer key, billed per input token only). A probability
     below `JEV_REFUSE_BELOW` (0.35) is refused. Its key is sealed in the managed configuration (`scopeKey`), with an
     optional url and proxy; it becomes the default once a key is saved. The LLM judge stays as the «chat» fallback.
     If Jev has no key, times out or errors, the request passes (logged) so an outage never blocks users. `/admin/ai`
     has a box to test a sentence against the current decision model.
     **Jev is filtered; the default is a local model** (owner, same day: «به نظر میاد که Jev فیلتره، یک جایگزین پیدا
     کن»). Provider `local` (default): `LocalScopeClassifier` runs `Xenova/paraphrase-multilingual-MiniLM-L12-v2`
     (int8, ~120 MB, a few ms) on the api server through `@huggingface/transformers` and votes by the 7 nearest
     labelled examples in `libs/api/ai/src/lib/scope-anchors.ts`; below `LOCAL_REFUSE_BELOW` (0.3) is refused. No
     request leaves the server and nothing is paid per call. The model is downloaded at image build on GitHub
     (`tools/scripts/fetch-scope-model.mjs`) into `/app/models` (`AI_SCOPE_MODEL_DIR`); the server never fetches it.
     To fix a misjudged kind of request, add Persian and English examples to `scope-anchors.ts` and check with
     `node tools/scripts/eval-scope-model.mjs` (held-out set `tools/scripts/scope-eval-set.json`, never copied into
     the examples; 41/44 right, no false refusal at 0.3 on 2026-11-07). The assistant's system prompt also tells it
     to decline off-topic requests. `chat` and `jev` (proxy only) stay selectable in `/admin/ai`.
     **The local model is opt-in** (2026-11-07): the first deploy that loaded it at api startup took the server's
     deploy runner down (job died mid-release, runner offline; cause unconfirmed, memory suspected). It now loads
     only when `AI_SCOPE_LOCAL_MODEL=on` is set in the server's env, lazily on the first checked request, with one
     ONNX thread; otherwise requests pass unchecked (logged once) and only the assistant prompt declines off-topic.
     Turn it on only after checking the server's free memory (~400 MB needed).

## PWA updates (2026-11-07)

111. **Preserve the current customer PWA behavior.** The owner confirmed that installation and updates work
     as expected with `index.html` in the service-worker asset list. Keep that entry and the current
     network-first navigation policy. Offline startup is outside the growth roadmap.

## Parallel work split (2026-11-07)

112. **Claude, ChatGPT/Codex and the owner work on the marketing roadmap at the same time** (owner: «میخوام کارهارو
     تقسیم کنی بین خودت و چت جی پی تی و من همزمان با جفتتون کار کنم»). The lanes, task IDs and claim protocol are in
     the «Work split» section of `docs/roadmaps/aio-growth-v1.md`: each agent takes items only from its own lane,
     claims an item (commit + push of the status line) before starting, and writes requests for the other lane there
     instead of editing that lane's files. Owner-only items (decisions, logins, devices, Iranian network) are listed
     there too.

113. **Check formatting before every push.** Run `pnpm nx format:check` before sending any commits.
     In a master-only checkout, use `NX_BASE=origin/master` so Nx compares against the remote branch.

## Ambient light everywhere (2026-11-08)

114. **Every customer page has the ambient background light** (owner: «in english and health tab i had an shadow color
     on whole page but in the others have not» → chose «به همه اضافه شود»). This extends directives 97/99: the planner
     shell is an `lx-stage` with blue `--lx-1..4` on `.applet-planner`, and the layout gives the pages outside the
     applets (home, account, subscription) `lx-stage lx-brand` (teal and the logo's sun). Keep the pastels light
     (L ≥ 0.86, as English) so text contrast does not change, and never stack two stages on one page.

## Faraz SMS API (2026-11-08)

115. **Faraz SMS goes through Faraz's own API** (owner sent https://docs.iranpayamak.com/ and the key with «خودت
     بذار»). `SmsService` posts patterns to `https://api.iranpayamak.com/ws/v1/sms/pattern` with the key in the
     `Api-Key` header (`code`, `attributes`, local `recipient` `09…`, `line_number`, `number_format: english`); IPPanel
     Edge refuses Faraz keys. The owner allowed Claude to write `FARAZ_SMS_API_KEY` into the server's
     `/opt/all-in-one/shared/.env` over `ssh flashcard`, like directive 81 for Zibal: back up the file, keep its owner
     and mode, never print the key. Check a key read-only with `GET /ws/v1/account/balance`, which sends nothing.

## Plan prices, AI limits and shared speech cache (2026-11-08)

116. **Plans, prices and AI limits are decided** (owner: «قیمت ها تایید، سقف هارو خودت بذار، کش رو هم پیاده کن»).
     Plans in Toman: monthly 249,000; three months 649,000; yearly 1,990,000; no automatic renewal; planner, flashcards
     and health stay free forever, AI is the paid part (with trial and earned weeks, directive 108). Plans are entered
     in `/admin/billing` (directive: plans are admin-managed, nothing seeded). Daily AI limits (`DEFAULT_AI_QUOTAS`):
     trial and earned 200k chat tokens, 5,000 speech characters, 30 recordings; paid 600k, 15,000, 60. Speech audio is
     cached for all accounts (`speechCacheKey` without the user), so a text is paid for once; access is still checked
     before the cache. Watch the cost per paid user in `/admin/ai` and revisit prices or limits if it passes about
     100,000 Toman a month.

## Faraz service line (2026-11-08)

117. **SMS go out from Faraz's public service line `3000505`** (owner: «از 3000505 استفاده کن»). Faraz accepted every
     code sent from the account's line `20002178584475` (`sent`, no blacklist, no error) but none was delivered: that
     line is dedicated, not a service line (`service: false`). `FARAZ_SENDER` in `sms.service.ts` is `3000505`;
     `FARAZ_SMS_SENDER` can still replace it. Delivery is read from Faraz's `GET /ws/v1/send_request` counters
     (`sent_count`, `delivered_count`, `blacklist_count`), never assumed from a 2xx.

## No early renewal (2026-11-08)

118. **While a plan is active, no buy buttons** (owner, after paying and then pressing «پرداخت و تمدید» again: «فک میکنم
     نیازی به وجودش نیست وقتی پلن دارم»). `/app/billing` hides the plan buttons while paid access has more than three
     days left and says renewal opens in the last three days (`canBuyPlan`, `BILLING_RENEW_WINDOW_MS` in the billing
     contracts, the same window as the SUBSCRIPTION_EXPIRING SMS). `BillingService.checkout` refuses earlier purchases
     with 409 `BILLING_STILL_ACTIVE`, so an old tab cannot charge twice. A renewal still starts at the current end.
