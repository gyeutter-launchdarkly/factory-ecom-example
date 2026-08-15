#!/usr/bin/env bash
# Delete all LaunchDarkly resources tagged 'auto-factory' from an existing project.
# Safe to run against a shared project — only removes demo-created resources.
# The seed flag (show-product-reviews) is preserved.
#
# Usage: ./demo/reset-ld.sh
#   (reads LD_API_KEY and LD_APP_PROJECT_KEY from .env.local)
set -euo pipefail

# Load .env.local
if [[ -f .env.local ]]; then
  while IFS='=' read -r key val; do
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${key// }" ]] && continue
    case "$key" in
      LD_API_KEY|LD_APP_PROJECT_KEY) export "$key=$val" ;;
    esac
  done < .env.local
fi

: "${LD_API_KEY:?LD_API_KEY is required (set in .env.local)}"
: "${LD_APP_PROJECT_KEY:?LD_APP_PROJECT_KEY is required (set in .env.local)}"

BASE="https://app.launchdarkly.com/api/v2"
AUTH="Authorization: $LD_API_KEY"
SEED="show-product-reviews"

ld_get()    { /usr/bin/curl -sf -H "$AUTH" "$BASE$1"; }
ld_delete() { /usr/bin/curl -sf -X DELETE -H "$AUTH" "$BASE$1" -o /dev/null -w "%{http_code}"; }

echo "=== Resetting LaunchDarkly  (project: $LD_APP_PROJECT_KEY) ==="
echo ""

# jq, not python3: jq is already a hard prerequisite the setup wizard checks
# for, and on a machine without python3 this script used to report deleting
# nothing at all rather than failing.
keys_of() { jq -r '.items[]?.key // empty' 2>/dev/null || true; }

# ── Flags ────────────────────────────────────────────────────────────────────
echo "Flags tagged 'auto-factory'…"
# `|| true`: curl -sf fails on a non-200, and pipefail would abort the reset
# before it reaches the metrics or the branches.
flags=$(ld_get "/flags/$LD_APP_PROJECT_KEY?filter=tags%3Aauto-factory&limit=200" | keys_of || true)

n=0
for key in $flags; do
  if [[ "$key" == "$SEED" ]]; then
    echo "  skip     $key  (seed — managed by Terraform)"
    continue
  fi
  code=$(ld_delete "/flags/$LD_APP_PROJECT_KEY/$key")
  if [[ "$code" == "204" || "$code" == "200" ]]; then
    echo "  deleted  $key"
    n=$((n + 1))
  else
    echo "  warn     $key  (HTTP $code)"
  fi
done
echo "  → $n flag(s) deleted"
echo ""

# ── Metrics ──────────────────────────────────────────────────────────────────
echo "Metrics tagged 'auto-factory'…"
metrics=$(ld_get "/metrics/$LD_APP_PROJECT_KEY?filter=tags%3Aauto-factory&limit=200" | keys_of || true)

m=0
for key in $metrics; do
  code=$(ld_delete "/metrics/$LD_APP_PROJECT_KEY/$key")
  if [[ "$code" == "204" || "$code" == "200" ]]; then
    echo "  deleted  $key"
    m=$((m + 1))
  else
    echo "  warn     $key  (HTTP $code)"
  fi
done
echo "  → $m metric(s) deleted"
echo ""

echo "=== LD reset complete ==="
