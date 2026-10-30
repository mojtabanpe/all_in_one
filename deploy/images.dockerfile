# syntax=docker/dockerfile:1.7
# One build, three runtime images (targets): api, public (SSR) and web (nginx + static apps).
#   docker build -f deploy/images.dockerfile --target api    -t all-in-one-api:$RELEASE .
#   docker build -f deploy/images.dockerfile --target public -t all-in-one-public:$RELEASE .
#   docker build -f deploy/images.dockerfile --target web    -t all-in-one-web:$RELEASE .

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NX_DAEMON=false NX_NO_CLOUD=true CI=true
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm nx run api-db:prisma-generate \
 && pnpm nx run-many -t build -p api public customer admin --configuration=production

# ---- api: NestJS + Prisma migrations on start
FROM node:24-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd -g 10001 app && useradd -u 10001 -g app -s /usr/sbin/nologin app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
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
