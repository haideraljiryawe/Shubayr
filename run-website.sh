#!/usr/bin/env sh
set -eu

# Local storefront only: reuse the existing Docker API/data without compose,
# migrations, seeds, permission changes or starting/restarting other services.
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
command -v node >/dev/null 2>&1 || {
  echo "ERROR: Node.js 22.12+ (Node 22) is required." >&2
  exit 1
}
exec node "$ROOT/mobile/tool/run_web_store.mjs" "$@"
