# syntax=docker/dockerfile:1.7
# API image. Build from the repository root: docker build -f apps/api/Dockerfile .
# Runs `node dist/server.js`; migrations are a separate command: `node dist/scripts/migrate.js`.
# First run: `node dist/scripts/init.js --workspace … --email … --name …` (see docs/DEPLOY.md).

FROM node:22-slim AS base
ENV CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0 npm_config_store_dir=/pnpm/store
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Manifests first, so the dependency layer is reused until they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @kite/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @kite/api build
# Production dependencies only (argon2 ships glibc prebuilds, so no compiler is needed).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @kite/api deploy --prod /out

FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    UPLOADS_DIR=/data/uploads
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/drizzle ./drizzle
COPY --from=build --chown=node:node /out/dist ./dist
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
VOLUME ["/data/uploads"]
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/server.js"]
