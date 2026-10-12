# syntax=docker/dockerfile:1.7
# Web image: the Vite build served by Caddy, which also reverse-proxies /api (REST + WebSocket)
# to the `api` service, so the browser sees one origin. Build from the repository root:
#   docker build -f apps/web/Dockerfile .
# Needs DOMAIN and ACME_EMAIL at runtime (see docker/caddy/Caddyfile).

FROM node:22-slim AS build
ENV CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0 npm_config_store_dir=/pnpm/store
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @kite/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @kite/web build

FROM caddy:2.10.2-alpine
COPY docker/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
# Fail the build on a broken Caddyfile.
RUN DOMAIN=kite.example ACME_EMAIL=ops@kite.example caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
