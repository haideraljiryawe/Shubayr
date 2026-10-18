#!/usr/bin/env bash
# Best-effort backup monitor ping. The URL is a secret: never print it.
set -u

outcome="${1:-success}"
url="${BACKUP_HEARTBEAT_URL:-}"
[ -n "$url" ] || exit 0

if [[ "$url" != https://* ]] && [ "${BACKUP_HEARTBEAT_ALLOW_HTTP:-false}" != "true" ]; then
  echo "backup heartbeat failed"
  exit 0
fi

if [ "$outcome" = "failure" ]; then
  suffix="${BACKUP_HEARTBEAT_FAIL_SUFFIX:-}"
  if [ -z "$suffix" ]; then
    echo "backup heartbeat failed"
    exit 0
  fi
  url="${url%/}${suffix}"
fi

if curl --fail --silent --show-error --output /dev/null \
  --request POST --connect-timeout 3 --max-time 8 \
  --retry 2 --retry-delay 1 --retry-all-errors "$url"; then
  echo "backup heartbeat sent"
else
  echo "backup heartbeat failed"
fi

# Monitoring must never change the backup result.
exit 0
