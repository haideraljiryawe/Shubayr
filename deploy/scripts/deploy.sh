#!/usr/bin/env bash
# deploy/scripts/deploy.sh <tag> [--build]
#
# Updates the running stack to the images tagged <tag>, without losing data:
#   1. pull (or --build) the new images — nothing changes yet
#   2. a "pre-deploy-<tag>" backup (database + pictures) to the off-server target
#   3. SHUBAYR_TAG=<tag> in .env.production (the previous tag is kept for rollback)
#   4. prisma migrate deploy (forward only), then the reference data
#   5. restart the API, then the worker, admin, store and backups; wait for health
# Volumes are never touched. If a step fails, the running containers keep the
# old images; see deploy/scripts/rollback.sh and docs/deploy/production.md.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

tag="${1:-}"; mode="${2:-}"
[ -n "$tag" ] || fail "usage: $0 <tag> [--build]"
check_env
current="$(env_value SHUBAYR_TAG)"
say "deploying ${tag} (running: ${current})"

if [ "$mode" = "--build" ]; then
  SHUBAYR_TAG="$tag" dc --profile tools build
else
  SHUBAYR_TAG="$tag" dc --profile tools pull
fi

say "pre-deploy backup"
dc exec -T backup /usr/local/bin/backup.sh "pre-deploy-${tag}"
dc exec -T backup cat /backups/last-dump > "${STATE_DIR}/pre-deploy-${tag}.dump"
say "backup: $(cat "${STATE_DIR}/pre-deploy-${tag}.dump")"

echo "$current" > "${STATE_DIR}/previous-tag"
set_env_value SHUBAYR_TAG "$tag"

say "migrating"
if ! dc run --rm migrate; then
  set_env_value SHUBAYR_TAG "$current"
  fail "migration failed — still running ${current}. The pre-deploy backup is $(cat "${STATE_DIR}/pre-deploy-${tag}.dump"); see 'Rollback' in docs/deploy/production.md"
fi
dc run --rm --no-deps api node dist/src/cli/bootstrap-reference.js

say "restarting on ${tag}"
dc up -d --no-deps api
wait_healthy api
dc up -d --no-deps worker admin web backup
wait_healthy worker admin web
dc up -d caddy
wait_healthy caddy
echo "$tag" > "${STATE_DIR}/current-tag"
say "deployed ${tag}. Roll back with: deploy/scripts/rollback.sh ${current}"
