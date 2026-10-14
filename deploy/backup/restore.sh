#!/usr/bin/env bash
# restore <dump-name|latest> --yes [--skip-media]
#
# Replaces the database with a dump from $BACKUP_TARGET/db (checked against its
# sha256), then makes the picture bucket match $BACKUP_TARGET/media/current.
# Stop the API, the worker and the web servers first (deploy/scripts/restore.sh
# does). Nothing happens without --yes.
set -euo pipefail

which="${1:-}"
shift || true
confirmed=false
media=true
for arg in "$@"; do
  case "$arg" in
    --yes) confirmed=true ;;
    --skip-media) media=false ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done
[ -n "$which" ] || { echo "usage: restore <dump-name|latest> --yes [--skip-media]" >&2; exit 2; }
: "${BACKUP_TARGET:?BACKUP_TARGET is not set}"
: "${S3_BUCKET:?S3_BUCKET is not set}"
log() { echo "restore [$(date '+%F %T')] $*"; }

if [ "$which" = latest ]; then
  which="$(rclone lsf "${BACKUP_TARGET}/db" --files-only --include 'shubayr-*.dump' | sort | tail -n 1)"
  [ -n "$which" ] || { echo "no dumps on ${BACKUP_TARGET}/db" >&2; exit 1; }
fi
log "dump: ${which} (database ${PGDATABASE} on ${PGHOST})"
if [ "$confirmed" != true ]; then
  what="the database"; [ "$media" = true ] && what="the database and the pictures"
  echo "This REPLACES ${what}. Re-run with --yes." >&2
  exit 3
fi

work=/backups/restore
rm -rf "$work"; mkdir -p "$work"
rclone copy "${BACKUP_TARGET}/db" "$work" --include "${which}" --include "${which}.sha256"
[ -s "${work}/${which}" ] || { echo "dump ${which} not found" >&2; exit 1; }
if [ -s "${work}/${which}.sha256" ]; then
  (cd "$work" && sha256sum -c "${which}.sha256")
else
  log "warning: no checksum stored for ${which}"
fi

log "restoring the database (the current schema is dropped first)"
psql -v ON_ERROR_STOP=1 -qc 'DROP SCHEMA IF EXISTS public CASCADE' -c 'CREATE SCHEMA public'
pg_restore --no-owner --no-privileges --single-transaction --exit-on-error \
  --dbname "$PGDATABASE" "${work}/${which}"
log "database restored: $(psql -Atc 'SELECT count(*) FROM _prisma_migrations') migrations recorded"

if [ "$media" = true ]; then
  log "restoring pictures ${BACKUP_TARGET}/media/current → media:${S3_BUCKET}"
  rclone mkdir "media:${S3_BUCKET}"
  rclone sync "${BACKUP_TARGET}/media/current" "media:${S3_BUCKET}" --fast-list
  log "pictures: $(rclone size "media:${S3_BUCKET}" --json | tr -d '\n')"
fi
rm -rf "$work"
log "done"
