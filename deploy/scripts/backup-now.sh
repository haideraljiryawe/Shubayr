#!/usr/bin/env bash
# deploy/scripts/backup-now.sh [label]   — one backup now, besides the daily one.
# deploy/scripts/backup-now.sh --list    — the dumps on the off-server target.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

if [ "${1:-}" = "--list" ]; then
  dc exec -T backup /usr/local/bin/entrypoint.sh list
else
  dc exec -T backup /usr/local/bin/backup.sh "${1:-manual}"
fi
