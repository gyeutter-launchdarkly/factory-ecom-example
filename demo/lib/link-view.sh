#!/usr/bin/env bash
# Create the AutoFactory view if absent, then link every auto-factory-tagged flag
# to it. LD views organise resources by explicit links, not by a tag filter, so
# the flags the factory creates have to be linked after each run.
#
# Sourced or run directly; safe to repeat. Never fails a caller.
set -uo pipefail

VIEW_KEY="autofactory"

ld_view_sync() {
  local key api project
  project="${LD_APP_PROJECT_KEY:-}"
  api="${LD_API_KEY:-}"
  [[ -z "$project" || -z "$api" ]] && return 0

  local base="https://app.launchdarkly.com/api/v2/projects/${project}"
  local H=(-H "Authorization: ${api}" -H "LD-API-Version: beta" -H "Content-Type: application/json")

  # Create on first use; 409 means it already exists.
  local code
  code=$(/usr/bin/curl -s -o /dev/null -w "%{http_code}" -X POST "${H[@]}" \
    -d "{\"key\":\"${VIEW_KEY}\",\"name\":\"AutoFactory\",\"description\":\"Flags and metrics created by the LaunchDarkly AutoFactory\",\"tags\":[\"auto-factory\"]}" \
    "${base}/views" 2>/dev/null || echo "000")
  case "$code" in
    200 | 201) echo "  created the AutoFactory view" ;;
    409) : ;;
    *) echo "  note: could not create the AutoFactory view (HTTP ${code})" ;;
  esac

  # Link everything the factory has tagged. Metrics as well as flags: the view
  # is meant to be the one place a run's output collects, and the metrics drive
  # the guarded rollout that the rest of the demo talks about.
  _link_kind() {
    local kind="$1" keys
    keys=$(/usr/bin/curl -s -H "Authorization: ${api}" \
      "https://app.launchdarkly.com/api/v2/${kind}/${project}?filter=tags:auto-factory&limit=100" 2>/dev/null \
      | jq -c '[.items[]?.key]' 2>/dev/null || echo "[]")
    [[ "$keys" == "[]" || -z "$keys" ]] && return 0

    local c
    c=$(/usr/bin/curl -s -o /dev/null -w "%{http_code}" -X POST "${H[@]}" \
      -d "{\"keys\":${keys}}" "${base}/views/${VIEW_KEY}/link/${kind}" 2>/dev/null || echo "000")
    if [[ "$c" == "200" || "$c" == "201" ]]; then
      echo "  linked $(echo "$keys" | jq 'length') ${kind%s}(s) into the AutoFactory view"
    elif [[ "$kind" == "flags" ]]; then
      echo "  note: could not link flags to the view (HTTP ${c})"
    fi
    # Metric linking failures stay quiet: the endpoint is beta and the view is a
    # convenience, so a 404 here must not look like the run went wrong.
  }

  _link_kind flags
  _link_kind metrics
}

# Allow running as a script as well as sourcing.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  [[ -f .env.local ]] && set -a && . ./.env.local && set +a
  ld_view_sync
fi
