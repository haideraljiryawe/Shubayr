#!/usr/bin/env bash
# deploy/scripts/create-owner.sh --username owner --name "Store owner" [--email owner@example.com]
#
# The store owner's Web Admin account: every permission (super_admin), and a
# forced password change at the first sign-in. Prints a one-time password once
# (or uses OWNER_PASSWORD from the environment, which must meet the policy:
# 12+ characters with lower, upper, digit and symbol). Refuses an existing name.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

check_env
args=(node dist/src/cli/create-owner.js "$@")
if [ -n "${OWNER_PASSWORD:-}" ]; then
  dc run --rm --no-deps -e OWNER_PASSWORD api "${args[@]}"
else
  dc run --rm --no-deps api "${args[@]}"
fi
domain="$(env_value SHUBAYR_DOMAIN)"
say "sign in at https://admin.${domain} — the password must be changed there first"
