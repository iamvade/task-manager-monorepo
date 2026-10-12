# Kite Tasks

Team task manager (spaces → projects → tasks) with List, Board and Calendar views and team Reports. Mongolian (default) and English UI. See `CLAUDE.md` for the full spec and `docs/design-notes.md` for the design reference.

## Layout

| Path              | What                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `apps/web`        | Vite + React 18 SPA (React Router, TanStack Query, Tailwind v4, i18next) |
| `apps/api`        | Fastify 5 REST API (`/api/v1`), Drizzle ORM, PostgreSQL 16, OpenAPI docs |
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
cp apps/api/.env.example apps/api/.env  # API config

# 2. Postgres 16 (creates databases `kite`, `kite_test` and `kite_e2e`)
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

## API docs

With `pnpm dev` running, open **http://localhost:5173/api/docs** for Swagger UI. The OpenAPI 3.1 spec is at `/api/docs/json`. It is generated from the routes' zod schemas (shared with the web app via `packages/shared`), so it never drifts from what the API validates.

To try requests from the UI:

1. Run `POST /auth/login` with `{ "email": "anu@kite.test", "password": "password123" }`. The browser stores the `kite_session` cookie and sends it with every later request.
2. Call anything else, e.g. `GET /auth/me` for your workspace ID, then `GET /workspaces/{workspaceId}/sidebar`.

Use the web dev server URL (`:5173`), not the API directly (`:3000`): mutations must carry `Origin: WEB_ORIGIN` (CSRF check), which the browser only sends when the docs are served from the web origin.

Docs are on by default everywhere except `NODE_ENV=production`. Set `API_DOCS=true` or `false` in `apps/api/.env` to override.

## Reports

`/reports` has four tabs. Every member of the workspace sees **Overview**, **Sprints** and **Workload**. Admins and owners also get **People**, which shows any member's report. Members get **My performance**, which shows only their own report. Opening the other role's tab redirects to the right one.

| Tab                     | What                                                                                                               | Filters                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Overview                | Completed, cycle time, on-time, overdue; 12-week throughput; where work waits; aging tasks                         | period, space, project |
| Sprints                 | One project's sprint: committed / added / completed / carried over, last 6 sprints, burndown                       | sprint, space, project |
| Workload                | Open points per person by due bucket, against each person's capacity; reassign in place                            | space, project         |
| People / My performance | One person's cards against the previous period, 12-week trends against the team median, helping others, open tasks | period                 |

- **API.** `GET /api/v1/workspaces/:id/reports/overview | sprints | workload | people/:userId`. `people/me` is an alias for the caller. Each report also has a `.csv` variant ("Export CSV" / "Export my data"), UTF-8 with a BOM and headers in the caller's language. The OpenAPI tag is "Reports".
- **People access.** Only admins and owners can open `people/:userId` for someone else. A member asking for another person gets 403.
- **Freshness.**
  - Reports are computed live in SQL.
  - Each API process caches a computed report for 5 minutes (`REPORTS_CACHE_TTL_MS`, 0 turns it off). Any task change in the workspace drops that workspace's cached reports.
  - The web page refetches every 5 minutes, on window focus, and at most every 10 seconds when teammates change tasks.
- **Empty state.** A scope with fewer than 5 completed tasks shows "Reports appear after your team completes a few tasks" instead of charts.
- **Tools.**
  - `pnpm db:waits [KEY]` prints a project's median days per status.
  - `pnpm db:perf` builds a 10k-task workspace and times every endpoint uncached.

The metric definitions are in `CLAUDE.md` under "Reports".

## Realtime

Each browser tab opens one WebSocket, `GET /api/v1/ws?client=<tab id>`. The socket is authenticated by the session cookie, and its `Origin` must be `WEB_ORIGIN`. The tab subscribes to its workspace. After every committed change the API pushes a small typed message, defined by `realtimeServerMessageSchema` in `packages/shared`. A message carries only ids, the actor and the minimal changed data, and the web app patches or refetches the affected TanStack Query caches. The tab sends the same id as `X-Kite-Client` on its requests, so it never receives its own changes back. Presence (who is online, who is viewing which task) is kept only in the API's memory.

Flow: the event bus (after commit) → `toRealtime` → `Broadcaster.publish` → `RealtimeHub` delivers to this instance's sockets (`apps/api/src/realtime/`).

**Several API instances.** Today `LocalBroadcaster` delivers in-process, which is only correct for a single instance. To scale out, implement the `Broadcaster` interface (`publish`, `subscribe`, `close`) over a shared channel and pass it to the hub in `realtime/plugin.ts`. Nothing else changes:

- **Postgres `LISTEN/NOTIFY`** needs no new infrastructure. `publish` runs `SELECT pg_notify('kite_realtime', <envelope JSON>)`. Each instance holds one dedicated `pg.Client` (not a pool connection) that runs `LISTEN kite_realtime` and hands every notification to its subscribers. Payloads must stay under 8000 bytes, which is fine because messages are ids only. Reconnect the listener and refetch-on-reconnect covers the gap.
- **Redis pub/sub** (`ioredis`): `publish` sends to a `kite:realtime` channel, and a separate subscriber connection feeds the hub. Pick this if Redis is already around or the message volume grows.
- **Presence** has to become shared too. One option is to publish presence deltas over the same channel and have each instance merge them. The other is to keep per-user connection counts in Redis (`HINCRBY` plus TTL heartbeats, so a crashed instance's users expire) and build the `ready` snapshot from there.
- The load balancer must allow WebSocket upgrades and an idle timeout above the 25 s heartbeat. Sticky sessions are not required.

## Production

Docker Compose on one server: Caddy (automatic HTTPS, serves the SPA and proxies `/api` and the WebSocket), the API, Postgres 16 and a nightly `pg_dump` backup. Attachments on a volume or in an S3-compatible bucket (`STORAGE_DRIVER=s3`). The first workspace and owner come from `init.js` instead of the demo seed. Step-by-step setup, updates and restores: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Scripts (run from the repo root)

| Script             | Does                                                         |
| ------------------ | ------------------------------------------------------------ |
| `pnpm dev`         | API (tsx watch) + web (Vite) in parallel                     |
| `pnpm build`       | Production builds of all packages                            |
| `pnpm typecheck`   | `tsc` in every package                                       |
| `pnpm lint`        | ESLint over the repo                                         |
| `pnpm format`      | Prettier write                                               |
| `pnpm test`        | Vitest in every package (API tests need `docker compose up`) |
| `pnpm e2e`         | Playwright end-to-end tests (see below)                      |
| `pnpm db:generate` | Generate a migration from `apps/api/src/db/schema`           |
| `pnpm db:migrate`  | Apply migrations                                             |
| `pnpm db:init`     | Create the first workspace + owner on an empty database      |
| `pnpm db:seed`     | Insert the sample data from the designs                      |
| `pnpm db:reset`    | Drop everything, migrate, seed (refuses in production)       |
| `pnpm db:print`    | Print a project's tasks by status (`pnpm db:print CHK`)      |

### Sample data

`db:seed` / `db:reset` recreate the workspace from the designs: **Kite Studio**, eight people (log in as `anu@kite.test`, everyone's password is `password123`), the Product / Engineering / Design spaces with their projects, App Redesign's tasks (APP-142 is the task from the detail drawer), Anu's My Tasks and the October calendar. Design dates are shifted so that Oct 8 2026 is today.

- `SEED_LANG=mn|en` (default `mn`): language of task, project, space, tag and people names that the designs have in both languages.
- `SEED_TODAY=2026-10-08`: pin "today" for an exact match with the mockups (weekday-based views such as My Tasks' _This Week_ only match on a Thursday).

API tests run against `TEST_DATABASE_URL` (the `kite_test` database); migrations are applied to it automatically before the suite.

### End-to-end tests

`pnpm e2e` runs Playwright (`apps/web/e2e/`, config `apps/web/playwright.config.ts`) against its own servers, so a running `pnpm dev` is left alone:

- The API runs on port 3100. Before it starts, `pnpm --filter @kite/api db:e2e` creates the `kite_e2e` database if it is missing, then resets it and seeds it with the English sample data.
- The web app runs on port 5273 and proxies `/api` to that API.
- The database URL is `E2E_DATABASE_URL`, or else the `DATABASE_URL` from `apps/api/.env` with the database name changed to `kite_e2e`. `db:e2e` refuses to touch any database whose name doesn't end in `_e2e`.

Install the browser once with `pnpm --filter @kite/web exec playwright install chromium`. The specs sign in through the login form as Anu (owner) and Dorj (member). They cover:

- Reassigning a Heavy person's task on Workload, then checking both bars.
- A member's access to Workload and the People → My performance redirect.
- The People person picker.
- Partner Portal's not-enough-history state.
