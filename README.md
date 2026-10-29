# All in One

Nx monorepo with one NestJS api, three Angular apps and a PostgreSQL database (Prisma).

| Project          | Path                  | Stack                            | Dev URL                   |
| ---------------- | --------------------- | -------------------------------- | ------------------------- |
| `api`            | `apps/api`            | NestJS 12, Prisma 7              | http://localhost:3333/api |
| `public`         | `apps/public`         | Angular 22, SSR, no login        | http://localhost:4200     |
| `admin`          | `apps/admin`          | Angular 22                       | http://localhost:4300     |
| `customer`       | `apps/customer`       | Angular 22                       | http://localhost:4400     |
| `ui-helm`        | `libs/shared/spartan` | spartan/ui (Helm) components     | -                         |
| `web-shared`     | `libs/web/shared`     | Angular code shared by the apps  | -                         |
| `shared-schemas` | `libs/shared/schemas` | Zod schemas used by api and apps | -                         |

The Angular dev servers proxy `/api` to the api (`apps/*/proxy.conf.json`), so the apps call
relative URLs like `/api/health`.

## Requirements

- Node.js 24 (`.nvmrc`); Angular 22 needs `^22.22.3 || ^24.15.0`
- pnpm 10 (`corepack enable`)
- Docker, or any PostgreSQL 14+

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm db:up          # Postgres 17 in Docker
pnpm db:migrate     # apply migrations
pnpm db:seed        # admin@example.com / change-me-admin
pnpm dev            # api + all three apps
```

Run one project: `pnpm nx serve admin`, `pnpm nx serve api`, …

## Database (Prisma)

- Schema: `apps/api/prisma/schema.prisma`, config: `apps/api/prisma.config.ts`
- The client is generated into `apps/api/src/generated/prisma` (git-ignored). `prisma-generate`
  runs automatically before the api's build, test, lint and typecheck.
- Change the schema, then `pnpm db:migrate --name <change>` to create and apply a migration.
- Production: `pnpm db:deploy`.
- Inject `PrismaService` anywhere in the api; `PrismaModule` is global.

## Shared schemas

`libs/shared/schemas` holds Zod schemas (`@all-in-one/shared/schemas`) used on both sides:

- api: `@Body({ schema: loginSchema })`, validated by the global `StandardSchemaValidationPipe`
- Angular: `httpResource(() => '/api/health', { parse: (v) => healthSchema.parse(v) })`

It uses `zod/mini` with `import * as z from 'zod/mini'`; the full `zod` build or a named
`{ z }` import adds ~400 kB to every browser bundle.

## UI components

spartan/ui Helm components live in `libs/shared/spartan` and are imported as `@spartan-ng/helm/<name>`.
Add more with:

```bash
pnpm nx g @spartan-ng/cli:ui --name=select
```

## Common commands

```bash
pnpm build          # build everything
pnpm test           # Vitest everywhere
pnpm lint
pnpm typecheck
pnpm nx affected -t lint test build   # only what changed
pnpm nx graph                         # dependency graph
```

## Production notes

- `public` SSR server: `node dist/apps/public/server/server.mjs` (env `PORT`, default 4000).
  Add your real domains to `allowedHosts` in `apps/public/project.json` or set
  `NG_ALLOWED_HOSTS`; other hosts get a 400 (SSRF protection).
- api: `node dist/apps/api/main.js` with `DATABASE_URL` and `API_PORT`.
