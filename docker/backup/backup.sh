#!/bin/sh
# Postgres dump (+ an uploads tarball when attachments are on local disk) into /backups.
#   backup.sh         run forever: one backup a day at BACKUP_TIME (TZ), keep BACKUP_KEEP_DAYS days
#   backup.sh now     one backup right away (exits non-zero on failure)
# Connection comes from the libpq env vars (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).
set -eu

BACKUP_TIME="${BACKUP_TIME:-03:00}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
# Dumps hold password hashes and every task: readable by the owner only.
umask 077

backup() {
  stamp="$(date +%Y%m%d-%H%M%S)"
  mkdir -p /backups/db /backups/uploads

  db="/backups/db/kite-$stamp.dump"
  pg_dump --format=custom --file="$db.tmp"
  mv "$db.tmp" "$db"
  echo "$(date -Iseconds) database -> $db ($(du -h "$db" | cut -f1))"

  if [ -d /uploads ] && [ -n "$(ls -A /uploads 2>/dev/null)" ]; then
    files="/backups/uploads/uploads-$stamp.tar.gz"
    tar -czf "$files.tmp" -C /uploads .
    mv "$files.tmp" "$files"
    echo "$(date -Iseconds) uploads -> $files ($(du -h "$files" | cut -f1))"
  fi

  find /backups/db /backups/uploads -type f -name '*.tmp' -mmin +60 -delete
  find /backups/db /backups/uploads -type f -mtime "+$BACKUP_KEEP_DAYS" -delete
}

seconds_until_next_run() {
  now="$(date +%s)"
  next="$(date -d "$BACKUP_TIME" +%s)"
  [ "$next" -le "$now" ] && next=$((next + 86400))
  echo $((next - now))
}

case "${1:-daemon}" in
  now)
    backup
    ;;
  daemon)
    echo "$(date -Iseconds) daily backups at $BACKUP_TIME (${TZ:-UTC}), keeping $BACKUP_KEEP_DAYS days"
    while true; do
      sleep "$(seconds_until_next_run)"
      backup || echo "$(date -Iseconds) BACKUP FAILED" >&2
    done
    ;;
  *)
    echo "usage: backup.sh [now]" >&2
    exit 2
    ;;
esac
