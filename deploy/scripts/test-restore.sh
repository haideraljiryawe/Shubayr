#!/usr/bin/env bash
# deploy/scripts/test-restore.sh [--keep]
#
# Proves the backups restore. With the production stack running:
#   1. takes a "restore-test" backup of it (database + pictures, off-server);
#   2. records row counts of the main tables, the picture bucket's size and
#      file count, and the sha256 of one product picture served by the API;
#   3. starts a FRESH, empty stack beside it (project shubayr-restoretest, own
#      volumes and network, nothing published), restores the backup into it
#      from the off-server target, and starts its API;
#   4. compares everything; exits non-zero on any difference;
#   5. deletes the fresh stack and its volumes (unless --keep).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

keep=false; [ "${1:-}" = "--keep" ] && keep=true
check_env
source_project="$(env_value COMPOSE_PROJECT_NAME)"; source_project="${source_project:-shubayr}"
bucket="$(env_value S3_BUCKET)"; bucket="${bucket:-shubayr-media}"

COUNTS_SQL="SELECT string_agg(t || '=' || n, ' ' ORDER BY t) FROM (
  SELECT 'users' t, count(*) n FROM users UNION ALL
  SELECT 'products', count(*) FROM products UNION ALL
  SELECT 'product_variants', count(*) FROM product_variants UNION ALL
  SELECT 'product_images', count(*) FROM product_images UNION ALL
  SELECT 'categories', count(*) FROM categories UNION ALL
  SELECT 'governorates', count(*) FROM governorates UNION ALL
  SELECT 'ledger_accounts', count(*) FROM ledger_accounts UNION ALL
  SELECT 'journal_entries', count(*) FROM journal_entries UNION ALL
  SELECT 'orders', count(*) FROM orders UNION ALL
  SELECT 'audit_logs', count(*) FROM audit_logs UNION ALL
  SELECT '_prisma_migrations', count(*) FROM _prisma_migrations) c"

snapshot() { # prints: counts | media size | picture sha
  local counts media path sha
  counts="$(dc exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"$COUNTS_SQL\"")"
  media="$(dc exec -T backup rclone size "media:${bucket}" --json | tr -d ' \n')"
  path="$(dc exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"SELECT url FROM product_images ORDER BY id LIMIT 1\"" | sed -E 's#^https?://[^/]+##')"
  sha="none"
  if [ -n "$path" ]; then
    sha="$(dc exec -T api node -e "fetch('http://127.0.0.1:8000${path}').then(async (r) => { if (!r.ok) throw new Error(r.status); console.log(require('crypto').createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex')); }).catch((e) => { console.log('fetch-failed-' + e.message); })")"
  fi
  echo "${counts} | media ${media} | picture ${path:-none} ${sha}"
}

say "1. backup of the running stack (${source_project})"
backup_output="$(dc exec -T backup /usr/local/bin/backup.sh restore-test)"
echo "$backup_output"
echo "$backup_output" | grep -q 'backup target size: [0-9][0-9]* bytes'
target_bytes="$(dc exec -T backup cat /backups/target-bytes)"
[[ "$target_bytes" =~ ^[0-9]+$ ]]
list_output="$(dc exec -T backup /usr/local/bin/entrypoint.sh list)"
echo "$list_output"
echo "$list_output" | grep -q "backup target size: ${target_bytes} bytes"
warning_output="$(dc exec -T -e BACKUP_TARGET_WARN_GB=0 backup /usr/local/bin/target-size.sh)"
echo "$warning_output"
echo "$warning_output" | grep -q '^WARNING: backup target size '
dump="$(dc exec -T backup cat /backups/last-dump)"
before="$(snapshot)"
echo "   ${before}"

say "2. a fresh, empty stack: shubayr-restoretest"
export COMPOSE_PROJECT_NAME=shubayr-restoretest
export EDGE_SUBNET="${RESTORE_TEST_SUBNET:-172.30.99.0/24}"
cleanup() {
  if [ "$keep" = true ]; then say "kept shubayr-restoretest (docker compose -p shubayr-restoretest down -v to remove)"
  else dc down -v --remove-orphans > /dev/null 2>&1 || true; fi
}
trap cleanup EXIT
dc down -v --remove-orphans > /dev/null 2>&1 || true
dc up -d db redis search storage
wait_healthy db redis search storage
[ "$(dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname = '"'"'public'"'"'"')" = 0 ] \
  || fail "the fresh database is not empty"

say "3. restoring ${dump} from the off-server target"
dc run --rm --no-deps backup restore "$dump" --yes
dc up -d --no-deps api
wait_healthy api
dc up -d --no-deps backup
after="$(snapshot)"
echo "   ${after}"

say "4. comparing"
if [ "$before" = "$after" ]; then
  say "RESTORE TEST PASSED: identical row counts, pictures and served picture bytes"
else
  echo "before: ${before}"; echo "after:  ${after}"
  fail "RESTORE TEST FAILED"
fi
