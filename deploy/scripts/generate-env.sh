#!/usr/bin/env bash
# deploy/scripts/generate-env.sh <domain> <acme-email>
#
# Writes .env.production from .env.production.example with fresh random
# secrets (database, Redis, search, storage, JWT, store preview token).
# Refuses to overwrite an existing file. The SMS gateway and, later, the FCM
# key are still yours to fill in.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

domain="${1:-}"; email="${2:-}"
[ -n "$domain" ] && [ -n "$email" ] || fail "usage: $0 <domain> <acme-email>"
[ -e "$ENV_FILE" ] && fail "${ENV_FILE} exists; not overwriting"
command -v openssl > /dev/null || fail "openssl is required"

hex() { openssl rand -hex "$1"; }
cp "${ROOT}/.env.production.example" "$ENV_FILE"
chmod 600 "$ENV_FILE"
set_env_value SHUBAYR_DOMAIN "$domain"
set_env_value ACME_EMAIL "$email"
set_env_value POSTGRES_PASSWORD "$(hex 24)"
set_env_value REDIS_PASSWORD "$(hex 24)"
set_env_value MEILI_MASTER_KEY "$(hex 24)"
set_env_value S3_ACCESS_KEY "shubayr$(hex 4)"
set_env_value S3_SECRET_KEY "$(hex 24)"
set_env_value JWT_SECRET "$(hex 32)"
set_env_value JWT_REFRESH_SECRET "$(hex 32)"
set_env_value STORE_PREVIEW_TOKEN "$(hex 24)"
say "wrote ${ENV_FILE} (mode 600). Still to fill in: SMS_GATEWAY_URL, SMS_GATEWAY_TOKEN, SHUBAYR_TAG, and the backup target."
grep -nE '=(CHANGE_ME|change_me)' "$ENV_FILE" || true
