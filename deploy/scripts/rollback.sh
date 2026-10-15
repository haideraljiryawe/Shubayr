#!/usr/bin/env bash
# deploy/scripts/rollback.sh [tag] [--restore-db]
#
# Goes back to <tag> (default: the tag before the last deploy).
#
# Migrations only go forward. If the database already has migrations the
# older release doesn't know, running the old code on it is unsafe and this
# refuses — unless --restore-db, which restores the "pre-deploy" backup taken
# by deploy.sh for the release being rolled back (orders, stock and every
# other change made since that backup are LOST; pictures uploaded since stay).
# Usually the better answer is a fixed release (fix forward).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

target=""; restore=false
for arg in "$@"; do
  case "$arg" in
    --restore-db) restore=true ;;
    -*) fail "unknown option ${arg}" ;;
    *) target="$arg" ;;
  esac
done
check_env
current="$(env_value SHUBAYR_TAG)"
target="${target:-$(cat "${STATE_DIR}/previous-tag" 2>/dev/null || true)}"
[ -n "$target" ] || fail "no previous tag recorded; give one: $0 <tag>"
[ "$target" != "$current" ] || fail "already on ${target}"
say "rolling back ${current} → ${target}"

SHUBAYR_TAG="$target" dc --profile tools pull || say "pull failed; using local images for ${target}"
registry="$(env_value SHUBAYR_REGISTRY)"; registry="${registry:-ghcr.io/haideraljiryawe}"
known="$(docker run --rm --entrypoint ls "${registry}/shubayr-api-migrate:${target}" /app/prisma/migrations | grep -v migration_lock || true)"
applied="$(dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY 1"')"
newer="$(comm -13 <(echo "$known" | sort) <(echo "$applied" | sort) | sed '/^$/d')"

if [ -n "$newer" ]; then
  echo "The database has migrations ${target} does not know:"
  echo "$newer" | sed 's/^/  /'
  [ "$restore" = true ] || fail "refusing to run old code on a newer schema. Fix forward, or re-run with --restore-db (loses data written since the pre-deploy backup)"
  dump_file="${STATE_DIR}/pre-deploy-${current}.dump"
  [ -s "$dump_file" ] || fail "no pre-deploy backup recorded for ${current} (${dump_file})"
  dump="$(cat "$dump_file")"
  say "restoring ${dump} (pictures kept)"
  dc stop api worker admin web
  dc run --rm --no-deps backup restore "$dump" --yes --skip-media
fi

set_env_value SHUBAYR_TAG "$target"
dc up -d --no-deps api
wait_healthy api
dc up -d --no-deps worker admin web backup
wait_healthy worker admin web
echo "$target" > "${STATE_DIR}/current-tag"
echo "$current" > "${STATE_DIR}/previous-tag"
say "now running ${target}"
