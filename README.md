# All in One

Nx monorepo: a NestJS api, three Angular apps and self-contained **applets** (planner,
English learning, health), on PostgreSQL with Prisma. Persian (RTL) UI with a glassmorphism
design built only from spartan/ui (through the project's own wrappers).

## Layout

```
apps/
  api/        NestJS 12 — composes auth + applet modules              → localhost:3333/api
  public/     Angular 22 SSR, no login (landing, applets, about)      → localhost:4200
  customer/   Angular 22 — signed-in users, hosts the applets         → localhost:4400
  admin/      Angular 22 — admins only (dashboard, users, content)    → localhost:4300
libs/
  applets/<name>/{contracts,api,web}   planner · english-learning · health
  api/db           Prisma schema (one file per applet), client, PrismaService
  api/auth         cookie/JWT auth, guards (@Public, @Roles, @CurrentUser)
  shared/spartan   spartan/ui Helm code (Nx project `ui-helm`)
  shared/packages/ui   @all-in-one/ui — wrappers over spartan + theme (the only UI apps may use)
  shared/schemas   Zod (zod/mini) schemas and shared types
  web/shared       API_BASE_URL, auth store/guards, login page, Persian formatting
design-system/all-in-one/MASTER.md       design decisions (ui-ux-pro-max)
tools/scripts/generate-ui-wrappers.mjs   regenerates the spartan wrappers
```

### Applets

Each applet is independent and can be mounted in any app:

- `contracts`: Zod schemas, types and pure logic shared by both sides (Leitner scheduling,
  meal scoring, calorie target, meal planning).
- `api`: a Nest module (`PlannerApiModule`, `EnglishApiModule`, `HealthApiModule`) plus seed data.
- `web`: Angular routes (`plannerRoutes`, `englishLearningRoutes`, `healthRoutes`).

| Applet           | What it does                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| planner          | Week strip (Solar Hijri), tasks with time, priority and area, done toggle                                                                                                                          |
| english-learning | CEFR decks, Leitner spaced repetition, pronunciation, own words, streaks                                                                                                                           |
| health           | Fitness (TRX, gym, walking, running, sports, home workouts, yoga; programs; weekly WHO goal) and nutrition (diet question, 8 diets, diet-aware meal scoring, 7-day meal plans, 21 Persian recipes) |

## UI rules

- Only spartan/ui components, used through `@all-in-one/ui` (`aioBtn`, `aioCard`, `aio-dialog`, …).
  ESLint blocks `@spartan-ng/*` imports elsewhere. Custom components need the owner's approval
  (see CLAUDE.md); approved so far: the floating bottom nav.
- Phones: floating bottom nav; dialogs and confirmations open as bottom sheets.
- Add a spartan component: `pnpm nx g @spartan-ng/cli:ui --name=<name>`, then
  `node tools/scripts/generate-ui-wrappers.mjs`.

## Requirements

- Node.js 24 (`.nvmrc`); Angular 22 needs `^22.22.3 || ^24.15.0`
- pnpm 10 (`corepack enable`)
- Docker, or any PostgreSQL 14+

## Getting started

```bash
pnpm install
cp .env.example .env      # set JWT_SECRET
pnpm db:up                # Postgres 17 in Docker
pnpm db:migrate           # apply migrations
pnpm db:seed              # admin@example.com / change-me-admin + applet catalogs
pnpm dev                  # api + all apps
```

## Database

- Schema folder: `libs/api/db/prisma/schema/` (`base.prisma` + one file per applet).
- After a change: `pnpm db:migrate --name=<change>`. Production: `pnpm db:deploy`.
- The client is generated into `libs/api/db/src/generated` (git-ignored) before every api build/test.

## Common commands

```bash
pnpm build | pnpm test | pnpm lint | pnpm typecheck
pnpm nx affected -t lint test build typecheck
pnpm nx graph
```

## Production notes

- `public` SSR server: `node dist/apps/public/server/server.mjs` (`PORT`, default 4000). Add real
  domains to `allowedHosts` in `apps/public/project.json` or set `NG_ALLOWED_HOSTS`.
  "Start" buttons point at `CUSTOMER_APP_URL` (`/app` in production).
- api: `node dist/apps/api/main.js` with `DATABASE_URL`, `JWT_SECRET`, `API_PORT`.
  Serve the apps and the api on the same site so the session cookie (`SameSite=Lax`) and
  CSRF protection work.
- Health suggestions are general guidance, not medical advice (stated in the UI).

## PWA installation

The customer app at `/app/` uses Recall's Angular service-worker, install event, update notice and connectivity flow, with Poshtetgarm branding. Installation is available on the login page as well as after signing in. Chrome/Edge use the browser install prompt; Safari shows Add to Dock guidance on macOS and Add to Home Screen guidance on iPhone/iPad. Installed standalone windows hide the install offer.

Build with `pnpm nx build customer` and deploy the complete `dist/apps/customer/browser` directory under `/app/` over HTTPS. Development builds do not register the service worker. The manifest, icons, `ngsw-worker.js` and `ngsw.json` must be served as files; the deployment nginx config supplies their content types and cache headers. The service worker caches the app shell, not API responses or offline edits.
