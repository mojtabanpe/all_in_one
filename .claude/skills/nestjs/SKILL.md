---
name: nestjs
description: Up-to-date NestJS v12 knowledge (latest 12.3.x, Oct 2026). Use whenever creating, editing, upgrading or reviewing a NestJS backend — new project setup, controllers, validation, cookies, CSRF, security headers, observability, microservices, or migrating from v11. Overrides older NestJS habits (cookie-parser, helmet, csurf, webpack, Jest-by-default, class-validator-only).
---

# NestJS v12 (current: 12.3.2, released 2026-10-27)

Verified against npm and the published `.d.ts` files of `@nestjs/common` / `@nestjs/core` 12.3.2.
v11 is now the `legacy` dist-tag (11.2.x, maintenance only). Always start new work on v12.

## Versions to use

| Package | Version |
|---|---|
| `@nestjs/common`, `core`, `platform-express`, `platform-fastify`, `platform-node`, `microservices`, `websockets`, `testing` | 12.3.x |
| `@nestjs/cli` | 12.0.x |
| `@nestjs/schematics` | 12.0.x (peer: TypeScript 6) |
| `@nestjs/config` | 12.0.x |
| `@nestjs/swagger` | 12.0.x |
| `@nestjs/typeorm` / `mongoose` / `jwt` / `passport` | 12.0.x |
| `@nestjs/terminus` | 12.1.x |
| `@nestjs/graphql` | 14.1.x |
| `@nestjs/observe` | 0.3.x |
| `typescript` | ^6 |

Re-check with `npm view @nestjs/core version` before pinning; Nest ships patch releases weekly.

**Node.js:** apps run on 20.19+ or 22.12+ (not 21). The CLI/schematics/`nest upgrade` need 22.22.3+, 24.15+ or 26+. Prefer the latest active LTS.

## Big picture: what changed in v12

1. **Core packages are ESM-only** (`"type": "module"`). CommonJS apps still work via Node's `require(esm)`.
2. **`nest new` asks CJS or ESM.** ESM projects default to **Vitest + oxlint**; CJS projects keep Jest + ESLint.
3. **Rspack replaces webpack** (`--builder rspack`; default for monorepos). `--webpack`/`--webpackPath` are deprecated. `tsc` is still the default compiler.
4. **Standard Schema validation** (Zod, Valibot, ArkType) is built in, next to `class-validator`.
5. **Built-in cookies, CSRF protection and security headers** (12.1+): no `cookie-parser`, `csurf`/`csrf-csrf` or `helmet` needed.
6. **Native Node HTTP adapter** `@nestjs/platform-node` (12.3+), with no Express or Fastify underneath.
7. **Official observability SDK** `@nestjs/observe`, wired through the new `instrument` app option.
8. New CLI commands: `nest upgrade`, `nest deploy` (Mau). `bun` is a supported package manager.

## New project

```bash
npm i -g @nestjs/cli@latest
nest new my-api            # answer the CJS / ESM prompt; prefer ESM for greenfield
```

ESM project rules:
- Relative imports need the `.js` extension: `import { CatsService } from './cats.service.js';`
- `__dirname` becomes `import.meta.dirname`.
- `require` needs `createRequire(import.meta.url)` from `node:module`.
- tsconfig: `module`/`moduleResolution: "nodenext"`, `resolvePackageJsonExports: true`, `target: "ES2023"`.
- Jest can load ESM-only v12 packages only on Node 24.9+ (otherwise `ERR_REQUIRE_ASYNC_MODULE`). Use Vitest.

## Validation: Standard Schema (preferred for new code)

```ts
// main.ts
import { StandardSchemaValidationPipe } from '@nestjs/common';
app.useGlobalPipes(new StandardSchemaValidationPipe()); // only validates params that declare a schema
```

```ts
// cats.schema.ts
import { z } from 'zod';
export const createCatSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().nonnegative(),
});
export type CreateCatDto = z.infer<typeof createCatSchema>;
```

```ts
@Post()
create(@Body({ schema: createCatSchema }) dto: CreateCatDto) {}

@Get(':id')
findOne(@Param('id', { schema: z.coerce.number().int().positive() }) id: number) {}

@Get()
findAll(@Query({ schema: listCatsQuerySchema }) query: ListCatsQuery) {}
```

- Also works on `@RawBody()`, `@MessageBody()` (gateways) and `@Payload()` (microservices).
- The handler gets the schema's **output** (coercions/defaults applied). With `transform: false`, type the param as the input type (`z.input<typeof schema>`).
- Annotate the parameter type yourself; decorators cannot infer it.
- Response shaping: `StandardSchemaSerializerInterceptor`.
- `class-validator` + `ValidationPipe` is still supported and still the documented default. New `ValidationPipe` options: `errorFormat: 'list' | 'grouped'`, `maxErrorMessagesLength` (12.2).
- 12.2 behaviour changes for `ValidationPipe`: `validationError.target` defaults to `false`; arrays or primitives sent to a class DTO now return 400.

## Cookies (12.1+, adapter-agnostic, no cookie-parser)

```ts
const app = await NestFactory.create(AppModule, {
  cookies: { secret: process.env.COOKIE_SECRET }, // array = key rotation (first signs, all verify)
});
```

```ts
import { Cookies, SignedCookies } from '@nestjs/common';

@Get('prefs')
prefs(@Cookies('theme') theme?: string) {}              // @Cookies() = all cookies

@Get('profile')
profile(@SignedCookies('uid') userId?: string) {}       // undefined if missing or tampered

@Post('login')
login(@Res({ passthrough: true }) res) {
  this.adapterHost.httpAdapter.setCookie(res, 'uid', id, {
    signed: true, httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24, // SECONDS
  });
}
// clear: this.adapterHost.httpAdapter.clearCookie(res, 'uid')  (same path/domain)
```

Gotchas: `maxAge` is in **seconds** (Express used ms). Values must be strings. `httpOnly` is false unless you set it. Use `@SignedCookies()` for anything you trust.

## CSRF + security headers (12.1+, replaces csurf/helmet)

```ts
const app = await NestFactory.create(AppModule);
app.useSecurityHeaders();          // Helmet-8-equivalent defaults, removes X-Powered-By
app.enableCsrfProtection({         // Sec-Fetch-Site / Origin based, no tokens
  trustedOrigins: ['https://admin.example.com'],
  exclude: [{ path: 'webhooks/stripe', method: RequestMethod.POST }],
});
await app.listen(process.env.PORT ?? 3000);
```

- Call both right after `NestFactory.create()` and before `init()`/`listen()`. Calling either twice or late throws.
- `useSecurityHeaders({...})` options use Helmet's names (`contentSecurityPolicy`, `strictTransportSecurity`, `referrerPolicy`, `xFrameOptions`, …). Pass `false` to drop a header. Legacy names like `hsts` throw. CSP directives can't be functions, so there are no per-request nonces.
- Swagger UI and GraphiQL need extra CSP sources.
- CSRF rejects cross-origin POST/PUT/PATCH/DELETE with a 403.

## Platform adapters

- Express (`@nestjs/platform-express`): default. Drains in-flight requests on shutdown.
- Fastify (`@nestjs/platform-fastify`): now has file upload interceptors backed by `@fastify/multipart` (12.1).
- **Native Node** (`@nestjs/platform-node`, 12.3+):

```ts
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter());
```

  It uses radix-tree routing with Express path syntax and supports connect-style middleware that sticks to Node req/res APIs. It also has `useStaticAssets`, `setViewEngine`, CORS and multer. It is the newest adapter, so prefer Express or Fastify unless dropping the dependency matters.

- Global prefix can be an array (12.1): `app.setGlobalPrefix(['api', 'v1'])`.
- Express/Fastify `fieldNestingDepth`/`fieldArrayIndexLimit` default to 32/1000 (12.2).

## Other new APIs

- `new HttpException(body, status, { errorCode: 'CAT_NOT_FOUND' })`: machine-readable error codes.
- `NestFactory.create(AppModule, { routeConflictPolicy, routeResolutionStrategy })`: route conflict diagnostics and specificity ordering (both opt-in).
- `ConsoleLogger` treats objects after the message as structured params (`structuredParams: false` restores the old behaviour).
- Custom decorators: `Reflector.createDecorator<T>()` (what the `decorator` schematic now generates).
- `@Sse()` `maxPendingDataLength`; WS adapters `maxConcurrentMessages` (12.2).
- Microservices: NATS v3 (`@nats-io/transport-node`), Kafka `RegExp` patterns, `GrpcExceptionFilter`, pre-request hooks, TCP `drainTimeout`. Replying to `ClientProxy#send()` from an *event* handler is deprecated (12.2).
- WebSockets: request-scoped gateways; `handleDisconnect(client, reason)`.

## Observability (`@nestjs/observe`)

```ts
// observe.ts
import { createObserveModule } from '@nestjs/observe';
export const { ObserveModule, ObserveInstrument } = createObserveModule();

// app.module.ts: import FIRST, before other global modules
imports: [ObserveModule.forRoot({ serviceId: 'my-api', enabled: process.env.NODE_ENV === 'production' })]

// main.ts
const app = await NestFactory.create(AppModule, { instrument: ObserveInstrument });
app.enableShutdownHooks();
```

Reads `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` (`npx @nestjs/observe link` writes them to `.env`). This is the hosted SaaS at observe.nestjs.com (free tier 300k events/month). It is **not** OpenTelemetry. For vendor-neutral tracing, use OpenTelemetry instead and say so to the user.

## Migrating v11 → v12

```bash
npm i -g @nestjs/cli@latest @nestjs/schematics@latest
npm i -D typescript@^6          # if peer conflict: npm update ts-jest typescript-eslint
nest upgrade --dry-run && nest upgrade
```

`nest upgrade` bumps every `@nestjs/*` package plus TS 6 and Jest 30, and fixes `nest-cli.json` webpack options, GraphQL config, NATS and `@nestjs/config` options. It does **not** convert CJS to ESM. Breaking changes to check by hand:

- **Lifecycle hooks** (`onModuleInit`, `onApplicationBootstrap`, shutdown) now run by component hierarchy level. Recheck any ordering assumptions.
- **`@Optional()`** isn't inherited by a subclass that declares its own constructor. Redeclare it, or the app throws `UnknownDependenciesException`.
- **Terminus:** the `HealthIndicator` class and `HealthCheckError` are removed. Use `HealthIndicatorService.check(key)` → `up()` / `down()`, or `.attempt(fn).withTimeout(ms)`.
- **Config:** `validationSchema` accepts any Standard Schema. Joi needs v18+. Library options move to `validationOptions.libraryOptions`.
- **GraphQL:** GraphiQL replaces Playground (`graphiql: {...}`). `subscriptions-transport-ws` is removed, so use `graphql-ws`.
- **NATS:** swap `nats` for `@nats-io/transport-node` (+ `@nats-io/nats-core`). Codecs are gone; custom deserializers receive the message (`msg.json()`).
- **Pipes:** `PipeTransform` and `ArgumentMetadata` typings are stricter or generic.
- **`FileTypeValidator`:** string match is exact (`font/woff` ≠ `font/woff2`). Use a RegExp for families.
- **AWS Lambda (CJS):** set `NODE_OPTIONS=--experimental-require-module`.
- Remove any deep or private imports of Nest internals.

## Defaults when writing NestJS code for this user

- New project: v12, ESM, Vitest, Express adapter (Fastify if perf matters), TypeScript 6.
- Validation: Zod 4 + `StandardSchemaValidationPipe`, with types from `z.infer`. Fall back to class-validator only if the codebase already uses it.
- Security in `main.ts`: `useSecurityHeaders()`, `enableCsrfProtection()` for cookie-auth apps, `enableCors({...})` explicitly, `enableShutdownHooks()`.
- Built-in cookies, not cookie-parser.
- Config: `@nestjs/config` with a Zod `validationSchema`.

## Sources

- npm registry (`npm view @nestjs/core time`), checked 2026-10-29
- https://docs.nestjs.com/migration-guide
- https://docs.nestjs.com/techniques/validation · /techniques/cookies · /security/csrf · /security/helmet
- https://github.com/nestjs/nest/releases (v12.0.0 → v12.3.2)
- https://www.infoq.com/news/2026/10/nestjs-12-observability/
- https://trilon.io/blog/nestjs-12-is-coming
