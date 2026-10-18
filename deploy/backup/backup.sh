#!/usr/bin/env bash
# One backup:
#   1. pg_dump (custom format) of the whole database, checked readable, with its sha256;
#   2. the dump copied to   $BACKUP_TARGET/db/
#   3. the picture bucket mirrored to $BACKUP_TARGET/media/current/ — files deleted or
#      replaced since the last run are kept in media/deleted/<stamp>/
#   4. retention: dumps and deleted-picture sets older than BACKUP_RETENTION_DAYS go,
#      here and on the target (by the date in their name, not file times).
# Any failure stops the run with a non-zero exit and leaves last-success untouched.
set -euo pipefail

backup_finished=false
heartbeat_on_exit() {
  status=$?
  trap - EXIT
  if [ "$backup_finished" = true ] && [ "$status" -eq 0 ]; then
    /usr/local/bin/heartbeat.sh success
  else
    /usr/local/bin/heartbeat.sh failure
  fi
  exit "$status"
}
trap heartbeat_on_exit EXIT

label="${1:-manual}"
label="${label//[^a-zA-Z0-9._-]/-}"
: "${BACKUP_TARGET:?BACKUP_TARGET is not set}"
: "${S3_BUCKET:?S3_BUCKET is not set}"
retention="${BACKUP_RETENTION_DAYS:-14}"
stamp="$(date +%Y%m%d-%H%M%S)"
name="shubayr-${stamp}-${label}.dump"
local_dir=/backups/db
mkdir -p "$local_dir"

log() { echo "backup [$(date '+%F %T')] $*"; }

log "dumping ${PGDATABASE} → ${name}"
pg_dump --format=custom --compress=6 --no-owner --no-privileges --file "${local_dir}/${name}.partial"
pg_restore --list "${local_dir}/${name}.partial" > /dev/null
mv "${local_dir}/${name}.partial" "${local_dir}/${name}"
(cd "$local_dir" && sha256sum "$name" > "${name}.sha256")
log "dump ready: $(du -h "${local_dir}/${name}" | cut -f1)"

log "copying the dump to ${BACKUP_TARGET}/db/"
rclone copy "$local_dir" "${BACKUP_TARGET}/db" --include "${name}" --include "${name}.sha256"

log "mirroring pictures media:${S3_BUCKET} → ${BACKUP_TARGET}/media/current/"
rclone sync "media:${S3_BUCKET}" "${BACKUP_TARGET}/media/current" \
  --backup-dir "${BACKUP_TARGET}/media/deleted/${stamp}" --fast-list
log "pictures: $(rclone size "${BACKUP_TARGET}/media/current" --json | tr -d '\n')"

cutoff="$(date -d "-${retention} days" +%Y%m%d-%H%M%S)"
log "retention: removing sets older than ${cutoff} (${retention} days)"
older() { [[ "$1" < "$cutoff" ]]; }
for file in "$local_dir"/shubayr-*.dump*; do
  [ -e "$file" ] || continue
  base="$(basename "$file")"; when="${base:8:15}"
  if older "$when"; then rm -f "$file"; log "  removed local ${base}"; fi
done
while read -r base; do
  [ -n "$base" ] || continue
  when="${base:8:15}"
  if older "$when"; then rclone deletefile "${BACKUP_TARGET}/db/${base}"; log "  removed ${base}"; fi
done < <(rclone lsf "${BACKUP_TARGET}/db" --files-only --include 'shubayr-*')
while read -r dir; do
  dir="${dir%/}"
  [ -n "$dir" ] || continue
  if older "$dir"; then rclone purge "${BACKUP_TARGET}/media/deleted/${dir}"; log "  removed media/deleted/${dir}"; fi
done < <(rclone lsf "${BACKUP_TARGET}/media/deleted" --dirs-only 2>/dev/null || true)

/usr/local/bin/target-size.sh --record
date +%s > /backups/last-success
echo "${name}" > /backups/last-dump
log "done: ${name}"
backup_finished=true
