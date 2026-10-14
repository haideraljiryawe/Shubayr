#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"

: "${DB_PORT:=55432}"
: "${API_PORT:=8000}"
: "${ADMIN_PORT:=3200}"
: "${ADMINER_PORT:=8081}"
: "${MAILPIT_UI_PORT:=8025}"
: "${MAILPIT_SMTP_PORT:=11025}"
: "${MEILI_PORT:=7700}"
: "${MINIO_CONSOLE_PORT:=9001}"
export DB_PORT API_PORT ADMIN_PORT ADMINER_PORT MAILPIT_UI_PORT
export MAILPIT_SMTP_PORT MEILI_PORT MINIO_CONSOLE_PORT

command -v docker >/dev/null 2>&1 || {
  echo "ERROR: Docker is not installed." >&2
  exit 1
}
command -v npm >/dev/null 2>&1 || {
  echo "ERROR: npm is not installed." >&2
  exit 1
}
docker compose version >/dev/null 2>&1 || {
  echo "ERROR: Docker Compose is unavailable." >&2
  exit 1
}

if [ "${1:-}" = "--check" ]; then
  echo "Launcher prerequisites are installed."
  exit 0
fi

docker info >/dev/null 2>&1 || {
  echo "ERROR: Docker is not running. Start Docker Desktop and retry." >&2
  exit 1
}

echo "Starting PostgreSQL, Redis, search, object storage, Mailpit, API, and Admin..."
docker compose --profile full up -d --build

wait_url() {
  url=$1
  attempts=$2
  count=0
  until curl --fail --silent --show-error --max-time 3 "$url" >/dev/null 2>&1; do
    count=$((count + 1))
    if [ "$count" -ge "$attempts" ]; then
      return 1
    fi
    sleep 1
  done
}

API_URL="http://localhost:${API_PORT}/api/v1"
ADMIN_URL="http://localhost:${ADMIN_PORT}"
WEB_URL="http://localhost:3000"

echo "Waiting for the API..."
wait_url "$API_URL/ready" 240 || {
  docker compose logs --tail 100 api
  exit 1
}
echo "Waiting for Web Admin..."
wait_url "$ADMIN_URL/api/health" 180 || {
  docker compose logs --tail 100 admin
  exit 1
}

echo "Storefront: $WEB_URL"
echo "Staff Admin: $ADMIN_URL"
echo "API: $API_URL"
echo "Customer phone: +9647700000006 (development OTP 000000)"

cd "$ROOT/web"
if [ ! -x node_modules/.bin/next ]; then
  npm install
fi
export NEXT_PUBLIC_API_URL="$API_URL"
export NEXT_PUBLIC_USE_MOCKS=false
export NEXT_PUBLIC_LIVE_DOMAINS=all
export PORT=3000
exec npm run dev
