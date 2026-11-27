# syntax=docker/dockerfile:1.7
# One build, three runtime images (targets): api, public (SSR) and web (nginx + static apps).
#   docker build -f deploy/images.dockerfile --target api    -t all-in-one-api:$RELEASE .
#   docker build -f deploy/images.dockerfile --target public -t all-in-one-public:$RELEASE .
#   docker build -f deploy/images.dockerfile --target web    -t all-in-one-web:$RELEASE .

# Dependencies alone, so the api's node_modules layer stays byte-identical until the lockfile changes:
# the registry and the server then reuse it and a release only transfers the small app layers.
FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Independently built and deployed VPN controller. It only carries the pruned Nest runtime.
FROM deps AS vpn-build
ENV NX_DAEMON=false NX_NO_CLOUD=true
COPY . .
RUN pnpm nx run vpn:prune
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --dir dist/apps/vpn install --prod --frozen-lockfile

FROM node:24-bookworm-slim AS vpn
WORKDIR /app
ENV NODE_ENV=production
COPY --from=vpn-build /app/dist/apps/vpn/main.js ./main.js
COPY --from=vpn-build /app/dist/apps/vpn/node_modules ./node_modules
USER node
HEALTHCHECK --interval=10s --timeout=5s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:4390/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "main.js"]

FROM deps AS api-deps
# Prune frontend packages, build-only devDependencies (keeping prisma CLI for startup migrations and tslib)
# and non-linux-x64 native binaries before `COPY . .`, so the api's runtime node_modules layer (~145 MiB
# compressed instead of ~481 MiB) still stays byte-identical until package.json or pnpm-lock.yaml changes.
RUN node -e 'const fs = require("fs"); \
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")); \
  for (const name of Object.keys(pkg.dependencies)) { \
    if (/^(@angular|@fontsource-variable|@ng-icons|@spartan-ng|@tanstack|class-variance-authority|clsx|ngx-scrollbar|tailwind-merge|zone\.js)(\/|$)/.test(name)) { \
      delete pkg.dependencies[name]; \
    } \
  } \
  pkg.dependencies.prisma = pkg.devDependencies.prisma; \
  pkg.dependencies.tslib = pkg.devDependencies.tslib; \
  delete pkg.devDependencies; \
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));' \
 && pnpm prune --prod \
 && rm -rf \
  node_modules/.pnpm/onnxruntime-node*/node_modules/onnxruntime-node/bin/napi-v6/darwin \
  node_modules/.pnpm/onnxruntime-node*/node_modules/onnxruntime-node/bin/napi-v6/win32 \
  node_modules/.pnpm/onnxruntime-node*/node_modules/onnxruntime-node/bin/napi-v6/linux/arm64 \
  node_modules/.pnpm/onnxruntime-web*/node_modules/onnxruntime-web/dist \
  node_modules/.pnpm/@img+sharp-libvips-linuxmusl* \
  node_modules/.pnpm/@electric-sql+pglite*/node_modules/@electric-sql/pglite/dist

# The AI scope check's local model, baked in before `COPY . .`: the server never downloads it at runtime
# (Hugging Face may be unreachable), and code changes do not rebuild or change the digest of this ~70 MiB layer.
FROM deps AS scope-model
COPY tools/scripts/fetch-scope-model.mjs ./tools/scripts/fetch-scope-model.mjs
RUN node tools/scripts/fetch-scope-model.mjs /app/models

FROM deps AS build
ENV NX_DAEMON=false NX_NO_CLOUD=true
COPY . .
RUN pnpm nx run api-db:prisma-generate \
 && pnpm nx run-many -t build -p api public customer admin --configuration=production

# ---- api: NestJS + Prisma migrations on start
FROM node:24-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd -g 10001 app && useradd -u 10001 -g app -s /usr/sbin/nologin app \
 && mkdir -p /app/data/exercise-videos \
 && chown -R app:app /app/data
COPY --from=api-deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=scope-model /app/models ./models
ENV AI_SCOPE_MODEL_DIR=/app/models
COPY --from=build /app/dist/apps/api ./dist/apps/api
COPY --from=build /app/libs/api/db/prisma ./libs/api/db/prisma
COPY --from=build /app/libs/api/db/prisma.config.ts ./libs/api/db/prisma.config.ts
USER app
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3333)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy --config libs/api/db/prisma.config.ts && exec node dist/apps/api/main.js"]

# ---- public: Angular SSR site (landing pages)
FROM node:24-bookworm-slim AS public
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd -g 10001 app && useradd -u 10001 -g app -s /usr/sbin/nologin app
COPY --from=build /app/dist/apps/public ./dist/apps/public
USER app
CMD ["node", "dist/apps/public/server/server.mjs"]

# ---- web: nginx routing /app, /admin, /api, OAuth and the SSR site
FROM nginx:1.29-alpine AS web
COPY deploy/nginx.app.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/apps/customer/browser /srv/customer
COPY --from=build /app/dist/apps/admin/browser /srv/admin
