# Deploying Kite Tasks

How to run Kite on a single Linux server with Docker Compose. Caddy terminates HTTPS (Let's Encrypt, automatic), serves the web app and proxies the API and its WebSocket on the same origin. Postgres runs alongside, and a small container dumps it every night.

```
             :80 / :443
 browser ───────────────▶ web (Caddy) ──── /api/* ──▶ api (Fastify, :3000) ──▶ db (Postgres 16)
                          static SPA                       │                     ▲
                                                           ▼                     │
                                              volume "uploads" or S3      backup (pg_dump daily
                                                                          + uploads tarball → ./backups)
 migrate: one-shot, runs before api starts
```

| Piece | Where |
|---|---|
| Compose file | `docker-compose.prod.yml` |
| Settings | `.env` (from `.env.prod.example`) |
| API image | `apps/api/Dockerfile` (`node:22-slim`) |
| Web image | `apps/web/Dockerfile` (Caddy + the Vite build), config in `docker/caddy/Caddyfile` |
| Backups | `docker/backup/backup.sh`, written to `./backups/` |
| Volumes | `pgdata` (database), `uploads` (attachments), `caddy_data` (certificates), `caddy_config` |

The API keeps realtime connections, the login throttle and the report cache in memory, so run exactly **one** `api` container.

## 1. What you need

- A Linux VPS with a public IP: Ubuntu 24.04 LTS (or any distro with Docker), **2 GB RAM** or more (each password hash takes ~64 MiB, up to 4 at a time), 1–2 vCPUs, 20 GB+ disk (database, attachments if stored locally, and 14 days of backups).
- A domain name, e.g. `tasks.example.mn`, with an **A** record (and **AAAA** if the server has IPv6) pointing at the server. Set it up **before** the first start: Caddy needs it to get a certificate.
- Ports **80** and **443** (TCP, plus 443/UDP for HTTP/3) reachable from the internet.
- SSH access as a user with `sudo`.

## 2. Prepare the server

```sh
# Docker Engine + the compose plugin (official convenience script)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"     # log out and back in afterwards
docker compose version              # v2.20 or newer

# Firewall: SSH, HTTP, HTTPS only. (Only Caddy publishes ports; Postgres and the API stay
# on the internal Docker network.)
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

## 3. Get the code and configure

```sh
sudo mkdir -p /opt/kite && sudo chown "$USER" /opt/kite
git clone <your-repo-url> /opt/kite
cd /opt/kite
cp .env.prod.example .env
chmod 600 .env
openssl rand -hex 24                # paste as POSTGRES_PASSWORD
nano .env
```

Set at least:

| Variable | Example | Notes |
|---|---|---|
| `DOMAIN` | `tasks.example.mn` | The public host name. The app is served at `https://$DOMAIN`. |
| `ACME_EMAIL` | `ops@example.mn` | Let's Encrypt contact for expiry notices. |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` | Hex only, so it fits in the database URL unescaped. |

The rest have working defaults: `LOG_LEVEL=info`, `TZ` / `BACKUP_TIME` / `BACKUP_KEEP_DAYS` for backups, `STORAGE_DRIVER=local` (see [S3](#s3-attachment-storage-optional)). `.env` sets `COMPOSE_FILE=docker-compose.prod.yml`, so every `docker compose` command below uses the production file when run from `/opt/kite`.

The compose file sets the production API settings itself: `NODE_ENV=production`, `WEB_ORIGIN=https://$DOMAIN` (so session cookies are `Secure` and CSRF/WebSocket origin checks match), `TRUST_PROXY=1` (Caddy is the one proxy in front, so the login throttle and logs see the real client IP), and uploads at `/data/uploads` on the `uploads` volume. Swagger UI stays off unless `API_DOCS=true`.

## 4. Build and start

```sh
docker compose build                # ~2–4 minutes the first time
docker compose up -d
docker compose ps
```

Expect `db` and `api` to be **healthy**, `web` and `backup` **up**, and `migrate` **exited (0)**: it applies database migrations and stops; the API only starts once it succeeds. (`docker compose up -d --wait` reports a failure for the finished `migrate` container, so check `ps` instead.)

```sh
docker compose logs migrate         # "Migrations applied."
docker compose logs -f web          # watch Caddy obtain the certificate
curl https://$DOMAIN/api/v1/health  # {"status":"ok","db":"up",...}
```

## 5. Create the platform admin, then the workspace (first run only)

The demo seed is refused in production. Workspaces are created by the **platform admin** (role `vade`): an account that belongs to no workspace and only sees the admin console at `/admin`. Create it once:

```sh
docker compose run --rm api node dist/scripts/vade.js \
  --email admin@example.mn \
  --name "Platform admin"
```

It asks for the password twice (hidden, at least 8 characters). Options: `--locale mn|en` (default `mn`) and `--timezone` (default `Asia/Ulaanbaatar`). Without a terminal (scripts, CI), pass the password as `-e VADE_PASSWORD=…` and add `-T`. It refuses an email that already has an account. Run it again with another email for a second platform admin.

Then sign in at `https://$DOMAIN` as that account (it opens `/admin`), fill in **New workspace** (name, address used by the public feedback form `/feedback/<address>`, the owner's email) and click **Create workspace**. Copy the owner's invite link shown under the form and send it to them; it is valid for 7 days and shown once. Until the owner accepts, **New owner link** in the list makes a new one (the old link stops working). Each workspace gets the 2026 Mongolian public holidays (used for sprint working days); no spaces or projects: the owner adds them in the app.

## 6. Invite the team

The owner opens their link, creates an account (or signs in) and lands in the workspace. Then, as the owner, open **Settings → Members**, enter a teammate's email and click **Create invite**. Kite doesn't send email: copy the link shown under the form and send it yourself (chat, email). The link is valid for 7 days and shown only once; creating a new invite for the same email replaces the old link. Admins can invite too; set job titles and capacity in the same list.

## Backups

The `backup` container runs every day at `BACKUP_TIME` (default 03:00, in `TZ`):

- `backups/db/kite-YYYYMMDD-HHMMSS.dump`: `pg_dump` custom format (compressed).
- `backups/uploads/uploads-YYYYMMDD-HHMMSS.tar.gz`: the attachments volume (with `STORAGE_DRIVER=local`).
- Files older than `BACKUP_KEEP_DAYS` (default 14) are deleted. Files are readable by the owner only; they contain password hashes and every task.

```sh
docker compose exec backup backup.sh now   # a backup right away
docker compose logs backup                 # last runs, sizes, failures
ls -lh backups/db backups/uploads
```

A backup on the same disk doesn't survive losing the server. Copy `./backups` somewhere else daily, for example from another machine:

```sh
rsync -az --delete user@server:/opt/kite/backups/ ~/kite-backups/
```

or from the server with [rclone](https://rclone.org) to object storage (`rclone sync /opt/kite/backups remote:kite-backups` in a cron job after `BACKUP_TIME`). Also keep a copy of `.env`: the database password and settings live there.

Test a restore now and then (below); a backup you haven't restored is a guess.

## Updating

```sh
cd /opt/kite
docker compose exec backup backup.sh now   # 1. fresh backup
git pull                                   # 2. new code
docker compose build                       # 3. new images
docker compose up -d                       # 4. migrate runs, then api and web restart
docker compose ps
docker compose logs --tail=50 migrate api
```

There are a few seconds of downtime while the API restarts; open browsers reconnect by themselves. Migrations only move forward. To roll back, check out the previous version (`git checkout <tag-or-commit>`), build and `up -d` again; if the newer version had applied a migration, restore the backup from step 1 (below) as well.

To keep older images around for a faster rollback, set `KITE_TAG` in `.env` to the version you're building (e.g. `KITE_TAG=2026-10-12`) before `docker compose build`; switching `KITE_TAG` back and running `up -d` then needs no rebuild.

Clean up old images now and then with `docker image prune`.

## Restoring a backup

Pick the files to restore, for example:

```sh
DUMP=backups/db/kite-20261012-030000.dump
FILES=uploads-20261012-030000.tar.gz       # file name only, from backups/uploads/
```

### On the same server

```sh
# 1. Stop everything that writes (the database keeps running)
docker compose stop web api backup

# 2. Replace the database with the dump
docker compose exec -T db dropdb -U kite --force kite
docker compose exec -T db createdb -U kite kite
docker compose exec -T db pg_restore -U kite -d kite --no-owner --exit-on-error < "$DUMP"

# 3. Put the attachment files back (local storage only)
docker compose run --rm --no-deps -T -v ./backups:/backups:ro api \
  tar -xzf "/backups/uploads/$FILES" -C /data/uploads

# 4. Start again (migrate brings an older dump up to the current schema)
docker compose up -d
docker compose ps
```

Step 3 adds the files back next to whatever is on the volume. Attachments uploaded after the backup stay on disk without a database row, which is harmless.

### On a new server

Follow steps 1–3 of this guide (same `.env`, especially `POSTGRES_PASSWORD` and `DOMAIN`), copy the backup files into `/opt/kite/backups/`, then **don't start the full stack yet**: the migrate step would create an empty schema that the restore then collides with.

```sh
docker compose build
docker compose up -d --wait db             # only the database, wait until it's ready
docker compose exec -T db pg_restore -U kite -d kite --no-owner --exit-on-error < "$DUMP"
docker compose run --rm --no-deps -T -v ./backups:/backups:ro api \
  tar -xzf "/backups/uploads/$FILES" -C /data/uploads
docker compose up -d
```

Skip `vade.js` here: the platform admin and the workspaces come from the dump. Point DNS at the new server; Caddy fetches a new certificate.

## S3 attachment storage (optional)

By default attachments live on the `uploads` volume and are part of the nightly backup. To keep them in an S3-compatible bucket instead (AWS S3, Cloudflare R2, Backblaze B2, a self-hosted SeaweedFS/Garage, …), create a **private** bucket and an access key limited to it, then set in `.env`:

```sh
STORAGE_DRIVER=s3
S3_BUCKET=kite-attachments
S3_REGION=auto                                       # R2: auto; AWS: e.g. eu-central-1
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com   # leave empty for AWS
S3_FORCE_PATH_STYLE=false                            # true for most self-hosted servers
S3_PREFIX=                                           # optional, e.g. kite/ to share a bucket
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
```

and run `docker compose up -d`. The key needs `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` and `s3:AbortMultipartUpload` on the bucket. Files stream through the API (no public or signed URLs), so the bucket never needs public access.

- The nightly backup then covers only the database. Turn on **bucket versioning** (or replication) so deleted or overwritten files can be recovered.
- Switching drivers doesn't move existing files. To switch an existing install, copy the `uploads` volume's contents into the bucket under the same keys (`<workspace>/<task>/<attachment>`, after `S3_PREFIX`), e.g. with `rclone copy`, before restarting with `STORAGE_DRIVER=s3`.

## Operations

```sh
docker compose logs -f api            # JSON logs (pino); no cookies, tokens or query strings
docker compose logs -f web            # Caddy (certificates, proxy errors)
docker compose restart api
docker compose exec db psql -U kite   # SQL shell
docker stats                          # memory / CPU per container
```

- Container logs rotate at 10 MB × 5 files per service.
- `LOG_LEVEL=debug` in `.env` (then `up -d`) for more detail; `warn` for less.
- `API_DOCS=true` exposes Swagger UI at `https://$DOMAIN/api/docs`.
- Uptime monitoring: `https://$DOMAIN/api/v1/health` returns 200, or 503 when the database is down.
- Public holidays are seeded for 2026. Add later years to `workspace_holidays` before sprints run into them.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Browser shows a certificate error, `web` logs mention ACME / challenge failures | DNS doesn't point at this server yet, or port 80/443 is blocked. Fix it, then `docker compose restart web`. Let's Encrypt rate-limits repeated failures, so check DNS first (`dig +short $DOMAIN`). |
| Every save fails with 403 `CSRF_REJECTED`, realtime doesn't connect | The app was opened under another address (server IP, `www.` variant) than `https://$DOMAIN`. Use exactly that host, or change `DOMAIN`. |
| `api` restarts, logs say `Invalid environment configuration` | A setting in `.env` is wrong; the message names it (e.g. `S3_BUCKET` missing with `STORAGE_DRIVER=s3`). |
| `migrate` exited with an error, `api` never starts | `docker compose logs migrate`. Usually the database password in `.env` changed after the first start: the `pgdata` volume keeps the original one. |
| `vade.js` says "No terminal to ask for the password" | Run without `-T`, or pass `-e VADE_PASSWORD=…`. |
| Live updates don't arrive behind Cloudflare (orange cloud) | Enable WebSockets in Cloudflare, or keep the record DNS-only. With a proxy in front of Caddy, client IPs need Caddy `trusted_proxies` and a larger `TRUST_PROXY` hop count. |
| Uploads fail with 413 | Files are capped at 25 MB, and each workspace at `MAX_WORKSPACE_STORAGE_BYTES` (default 5 GiB). |
