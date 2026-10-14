#!/usr/bin/env bash
# deploy/scripts/bootstrap.sh [--build]
#
# First run on a new server, after .env.production is filled in:
#   1. pull (or --build) the images for SHUBAYR_TAG
#   2. start PostgreSQL, Redis, Meilisearch and the object storage
#   3. prisma migrate deploy
#   4. reference data only: app roles, permissions, built-in presets, store
#      settings; checks governorates, chart of accounts and currencies
#      (no demo products, users or orders)
#   5. start the API, worker, admin, store, proxy and backups
# Then create the owner: deploy/scripts/create-owner.sh
set -euo pipefail
source "$(dirname "$0")/lib.sh"

check_env
if [ "${1:-}" = "--build" ]; then
  say "building images for $(env_value SHUBAYR_TAG)"
  dc --profile tools build
else
  say "pulling images for $(env_value SHUBAYR_TAG)"
  dc --profile tools pull
fi

say "starting the data services"
dc up -d db redis search storage
wait_healthy db redis search storage

say "migrating the database"
dc run --rm migrate

say "loading reference data"
dc run --rm --no-deps api node dist/src/cli/bootstrap-reference.js

say "starting the application"
dc up -d api
wait_healthy api
dc up -d worker admin web caddy backup
wait_healthy worker admin web caddy
env_value SHUBAYR_TAG > "${STATE_DIR}/current-tag"

domain="$(env_value SHUBAYR_DOMAIN)"
say "running: https://${domain}  https://admin.${domain}  https://api.${domain}"
say "next: deploy/scripts/create-owner.sh --username <name> --name \"<full name>\""
