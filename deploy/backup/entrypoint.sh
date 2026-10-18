#!/usr/bin/env bash
# schedule            run backup.sh on BACKUP_SCHEDULE (cron syntax, TZ time) — the default
# backup [label]      one backup now
# restore <dump|latest> --yes [--skip-media]
# list                the dumps on the off-server target
set -euo pipefail

case "${1:-schedule}" in
  schedule)
    echo "${BACKUP_SCHEDULE} /usr/local/bin/backup.sh daily > /proc/1/fd/1 2>&1" > /etc/crontabs/root
    echo "backup: scheduled '${BACKUP_SCHEDULE}' (${TZ}), target ${BACKUP_TARGET}, keeping ${BACKUP_RETENTION_DAYS} days"
    exec crond -f -l 8
    ;;
  backup) shift; exec /usr/local/bin/backup.sh "$@" ;;
  restore) shift; exec /usr/local/bin/restore.sh "$@" ;;
  list)
    rclone lsl "${BACKUP_TARGET}/db" --include '*.dump'
    exec /usr/local/bin/target-size.sh
    ;;
  *) exec "$@" ;;
esac
