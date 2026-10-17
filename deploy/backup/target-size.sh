#!/usr/bin/env bash
# Prints the current off-site target size. A successful backup passes --record
# to persist the byte count in the backup volume for monitoring.
set -euo pipefail

: "${BACKUP_TARGET:?BACKUP_TARGET is not set}"
warn_gb="${BACKUP_TARGET_WARN_GB:-8}"

compact="$(rclone size "${BACKUP_TARGET}" --json | tr -d '[:space:]')"
bytes="$(printf '%s' "$compact" | sed -n 's/.*"bytes":\([0-9][0-9]*\).*/\1/p')"
if ! [[ "$bytes" =~ ^[0-9]+$ ]]; then
  echo "backup target size could not be read from rclone output: ${compact}" >&2
  exit 1
fi

if ! warn_bytes="$(
  awk -v gb="$warn_gb" '
    BEGIN {
      if (gb !~ /^[0-9]+([.][0-9]+)?$/) exit 2
      printf "%.0f\n", gb * 1000000000
    }
  '
)"; then
  echo "BACKUP_TARGET_WARN_GB must be a non-negative number" >&2
  exit 1
fi

if [ "${1:-}" = "--record" ]; then
  printf '%s\n' "$bytes" > /backups/target-bytes.tmp
  mv /backups/target-bytes.tmp /backups/target-bytes
fi

echo "backup target size: ${bytes} bytes"
if [ "$bytes" -gt "$warn_bytes" ]; then
  echo "WARNING: backup target size ${bytes} bytes exceeds BACKUP_TARGET_WARN_GB=${warn_gb} (${warn_bytes} bytes)"
fi
