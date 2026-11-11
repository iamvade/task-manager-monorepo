# syntax=docker/dockerfile:1.7
# Web image: the Vite build served by Caddy, which also reverse-proxies /api (REST + WebSocket)
# to the `api` service, so the browser sees one origin. Build from the repository root:
#   docker build -f apps/web/Dockerfile .
# Needs SITE_ADDRESS and ACME_EMAIL at runtime (see docker/caddy/Caddyfile). BASE_PATH (build arg)
# builds the app for a sub-path, e.g. /task-manager. The image also serves the Claude Desktop
# extension (apps/mcp) at /downloads/kite-tasks.mcpb, so it always matches this server.

FROM node:22-slim AS build
ENV CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0 npm_config_store_dir=/pnpm/store
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY apps/mcp/package.json apps/mcp/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @kite/web... --filter @kite/mcp...
COPY packages/shared packages/shared
COPY apps/web apps/web
COPY apps/mcp apps/mcp
# The extension: tsup bundle + manifest, validated and packed by mcpb (apps/mcp/scripts/pack-mcpb.mjs).
RUN pnpm --filter @kite/mcp pack:mcpb
# Empty = served at the domain root; e.g. /task-manager behind a proxy that serves the app there.
ARG BASE_PATH=
RUN BASE_PATH="$BASE_PATH" pnpm --filter @kite/web build

FROM caddy:2.10.2-alpine
COPY docker/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
COPY --from=build /repo/apps/mcp/dist/kite-tasks.mcpb /srv/downloads/kite-tasks.mcpb
# Fail the build on a broken Caddyfile.
RUN SITE_ADDRESS=kite.example ACME_EMAIL=ops@kite.example caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
