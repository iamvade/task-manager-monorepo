# Kite Tasks

Team task manager (spaces → projects → tasks) with List, Board and Calendar views. Mongolian (default) and English UI. See `CLAUDE.md` for the full spec and `docs/design-notes.md` for the design reference.

## Layout

| Path              | What                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `apps/web`        | Vite + React 18 SPA (React Router, TanStack Query, Tailwind v4, i18next) |
| `apps/api`        | Fastify 5 REST API (`/api/v1`), Drizzle ORM, PostgreSQL 16               |
| `packages/shared` | zod schemas, DTO types and enums used by both apps                       |
| `design/`         | Design exports (read as source; they don't render standalone)            |

## Requirements

- Node.js 22.12+
- pnpm 12 (`corepack enable` picks up the version pinned in `package.json`)
- Docker (for Postgres)

## Setup

```sh
# 1. Environment files
cp .env.example .env                    # docker compose: POSTGRES_PORT
cp apps/api/.env.example apps/api/.env  # API config; set a real COOKIE_SECRET

# 2. Postgres 16 (creates databases `kite` and `kite_test`)
docker compose up -d

# 3. Dependencies
pnpm install

# 4. Database schema + sample data
pnpm db:reset

# 5. Run API (http://127.0.0.1:3000) and web (http://localhost:5173) together
pnpm dev
```

The web dev server proxies `/api` to the API, so the browser sees one origin and session cookies just work.

**Port 5432 already taken** (e.g. a local Postgres)? Set `POSTGRES_PORT=5433` in `.env` and use port `5433` in both URLs in `apps/api/.env`.

## Scripts (run from the repo root)

| Script             | Does                                                         |
| ------------------ | ------------------------------------------------------------ |
| `pnpm dev`         | API (tsx watch) + web (Vite) in parallel                     |
| `pnpm build`       | Production builds of all packages                            |
| `pnpm typecheck`   | `tsc` in every package                                       |
| `pnpm lint`        | ESLint over the repo                                         |
| `pnpm format`      | Prettier write                                               |
| `pnpm test`        | Vitest in every package (API tests need `docker compose up`) |
| `pnpm db:generate` | Generate a migration from `apps/api/src/db/schema`           |
| `pnpm db:migrate`  | Apply migrations                                             |
| `pnpm db:seed`     | Insert sample data                                           |
| `pnpm db:reset`    | Drop everything, migrate, seed (refuses in production)       |

API tests run against `TEST_DATABASE_URL` (the `kite_test` database); migrations are applied to it automatically before the suite.
