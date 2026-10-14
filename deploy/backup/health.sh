#!/usr/bin/env bash
# Unhealthy when the last successful backup is more than 26 hours old
# (healthy before the first scheduled run).
set -euo pipefail
[ -f /backups/last-success ] || exit 0
age=$(( $(date +%s) - $(cat /backups/last-success) ))
[ "$age" -lt $(( 26 * 3600 )) ]
