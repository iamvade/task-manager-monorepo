# syntax=docker/dockerfile:1.7
# The remote Claude connector: the MCP HTTP server (apps/mcp, `dist/http.js`). The web container
# (Caddy) proxies <web address>/mcp to it; it calls the API inside the deployment. Build from the
# repository root: docker build -f apps/mcp/Dockerfile .
# Runtime: KITE_PUBLIC_URL (the web address incl. any sub-path), KITE_API_URL (http://api:3000),
# optional MCP_ALLOWED_ORIGINS. See apps/mcp/README.md and docs/DEPLOY.md.

FROM node:22-slim AS build
ENV CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0 npm_config_store_dir=/pnpm/store
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/mcp/package.json apps/mcp/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @kite/mcp...
COPY packages/shared packages/shared
COPY apps/mcp apps/mcp
# Default status names come from the web app's locale files (src/resolve.ts).
COPY apps/web/src/i18n/locales apps/web/src/i18n/locales
RUN pnpm --filter @kite/mcp build

# tsup bundles every dependency into dist/http.js, so the runtime is Node and that one file.
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/mcp/dist/http.js /repo/apps/mcp/dist/http.js.map ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--enable-source-maps", "http.js"]
