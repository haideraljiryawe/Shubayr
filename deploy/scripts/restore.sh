#!/usr/bin/env bash
# deploy/scripts/restore.sh <dump-name|latest> [--skip-media] [--yes]
#
# Puts the database (and, unless --skip-media, the pictures) back from the
# off-server target: stops the API, worker, admin and store, restores, applies
# any newer migrations for the running release, then starts them again.
# Everything written after that backup is lost — it asks first.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

dump="${1:-}"; shift || true
[ -n "$dump" ] || fail "usage: $0 <dump-name|latest> [--skip-media] [--yes]"
options=(); confirmed=false
for arg in "$@"; do
  case "$arg" in
    --yes) confirmed=true ;;
    --skip-media) options+=(--skip-media) ;;
    *) fail "unknown option ${arg}" ;;
  esac
done
check_env
if [ "$confirmed" != true ]; then
  read -r -p "Replace the live data with backup '${dump}'? Type RESTORE: " answer
  [ "$answer" = RESTORE ] || fail "cancelled"
fi

say "stopping the application"
dc stop api worker admin web
dc up -d db storage
wait_healthy db storage
dc run --rm --no-deps backup restore "$dump" --yes ${options[@]+"${options[@]}"}
say "applying migrations for $(env_value SHUBAYR_TAG)"
dc run --rm migrate
dc up -d api
wait_healthy api
dc up -d worker admin web
wait_healthy worker admin web
say "restored ${dump}"
