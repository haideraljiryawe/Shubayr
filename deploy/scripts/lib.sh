#!/usr/bin/env bash
# Shared by the deploy scripts. Source it; don't run it.
set -euo pipefail
# Git Bash on Windows would rewrite container paths such as /backups/…
export MSYS_NO_PATHCONV=1
# Failures inside $(…) stop the script too.
shopt -s inherit_errexit

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# (Git Bash only: the Docker CLI there wants C:/… paths.)
command -v cygpath > /dev/null && ROOT="$(cygpath -m "$ROOT")"
ENV_FILE="${SHUBAYR_ENV_FILE:-${ROOT}/.env.production}"
COMPOSE_FILE="${ROOT}/docker-compose.prod.yml"
STATE_DIR="${ROOT}/deploy/state"
mkdir -p "$STATE_DIR"

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# docker compose with the production file and env file (extra -f files via SHUBAYR_COMPOSE_EXTRA).
dc() {
  local extra=()
  for file in ${SHUBAYR_COMPOSE_EXTRA:-}; do
    case "$file" in /*|[A-Za-z]:/*) ;; *) file="${ROOT}/${file}" ;; esac
    extra+=(-f "$file")
  done
  docker compose -f "$COMPOSE_FILE" "${extra[@]}" --env-file "$ENV_FILE" "$@"
}

env_value() { # the value of a key in the env file ('' when absent)
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

set_env_value() { # replace (or append) KEY=value in the env file
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

# Refuses to go on with placeholders or weak values in the env file.
check_env() {
  [ -f "$ENV_FILE" ] || fail "missing ${ENV_FILE} — copy .env.production.example and fill it in"
  if grep -nE '=(CHANGE_ME|change_me|replace-me)' "$ENV_FILE"; then
    fail "${ENV_FILE} still has placeholders (above)"
  fi
  local key
  for key in SHUBAYR_DOMAIN ACME_EMAIL SHUBAYR_TAG POSTGRES_PASSWORD REDIS_PASSWORD MEILI_MASTER_KEY \
             JWT_SECRET JWT_REFRESH_SECRET S3_ACCESS_KEY S3_SECRET_KEY; do
    [ -n "$(env_value "$key")" ] || fail "${key} is empty in ${ENV_FILE}"
  done
  if [ "$(env_value SMS_PROVIDER)" = "otpiq" ]; then
    [ -n "$(env_value OTPIQ_API_KEY)" ] || fail "OTPIQ_API_KEY is empty in ${ENV_FILE}"
  else
    [ -n "$(env_value SMS_GATEWAY_URL)" ] || fail "SMS_GATEWAY_URL is empty in ${ENV_FILE}"
    if [ "$(env_value SMS_GATEWAY_URL)" != "disabled" ]; then
      [ -n "$(env_value SMS_GATEWAY_TOKEN)" ] || fail "SMS_GATEWAY_TOKEN is empty in ${ENV_FILE}"
    fi
  fi
  for key in JWT_SECRET JWT_REFRESH_SECRET; do
    [ "$(env_value "$key" | wc -c)" -gt 32 ] || fail "${key} must be at least 32 characters"
  done
  [ "$(env_value MEILI_MASTER_KEY | wc -c)" -gt 16 ] || fail "MEILI_MASTER_KEY must be at least 16 characters"
  if [ "$(env_value STORE_PUBLIC)" = "false" ]; then
    [ "$(env_value STORE_PREVIEW_TOKEN | wc -c)" -gt 16 ] || say "note: STORE_PUBLIC=false without STORE_PREVIEW_TOKEN — no preview link"
  fi
  [ -f "$(backup_conf)" ] || fail "missing $(backup_conf) — the off-server backup target (see docs/deploy/production.md)"
}

backup_conf() {
  local value; value="$(env_value BACKUP_RCLONE_CONF)"
  value="${value:-./deploy/secrets/rclone.conf}"
  case "$value" in /*|[A-Za-z]:/*) echo "$value" ;; *) echo "${ROOT}/${value#./}" ;; esac
}

# Waits until every listed service reports healthy (or fails after ~3 minutes).
wait_healthy() {
  local service id status tries
  for service in "$@"; do
    for tries in $(seq 1 90); do
      id="$(dc ps -q "$service" | head -n 1)"
      status="$( [ -n "$id" ] && docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" || echo missing)"
      [ "$status" = healthy ] && break
      [ "$tries" = 90 ] && { dc logs --tail 80 "$service" || true; fail "${service} is ${status}"; }
      sleep 2
    done
    say "${service}: healthy"
  done
}
