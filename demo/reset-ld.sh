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

# ── Flags ────────────────────────────────────────────────────────────────────
echo "Flags tagged 'auto-factory'…"
flags=$(ld_get "/flags/$LD_APP_PROJECT_KEY?filter=tags%3Aauto-factory&limit=200" \
  | python3 -c "import sys,json; [print(f['key']) for f in json.load(sys.stdin).get('items',[])]" 2>/dev/null || echo "")

n=0
for key in $flags; do
  if [[ "$key" == "$SEED" ]]; then
    echo "  skip     $key  (seed — managed by Terraform)"
    continue
  fi
  code=$(ld_delete "/flags/$LD_APP_PROJECT_KEY/$key")
  [[ "$code" == "204" || "$code" == "200" ]] \
    && echo "  deleted  $key" && (( n++ )) || true \
    || echo "  warn     $key  (HTTP $code)"
done
echo "  → $n flag(s) deleted"
echo ""

# ── Metrics ──────────────────────────────────────────────────────────────────
echo "Metrics tagged 'auto-factory'…"
metrics=$(ld_get "/metrics/$LD_APP_PROJECT_KEY?filter=tags%3Aauto-factory&limit=200" \
  | python3 -c "import sys,json; [print(m['key']) for m in json.load(sys.stdin).get('items',[])]" 2>/dev/null || echo "")

m=0
for key in $metrics; do
  code=$(ld_delete "/metrics/$LD_APP_PROJECT_KEY/$key")
  [[ "$code" == "204" || "$code" == "200" ]] \
    && echo "  deleted  $key" && (( m++ )) || true \
    || echo "  warn     $key  (HTTP $code)"
done
echo "  → $m metric(s) deleted"
echo ""

echo "=== LD reset complete ==="
