#!/usr/bin/env bash
# Replay a synthetic factory run into the progress stream so you can rehearse
# the in-app flowchart (or check it after a UI change) without spending an
# Anthropic call or waiting on act.
#
# Usage: ./demo/replay-progress.sh [scenario] [seconds-per-step] [pr-number]
#
# Run it twice with different scenarios and PR numbers to rehearse the pane's
# PR dropdown with several flows in flight:
#   ./demo/replay-progress.sh express-checkout 2 7 &
#   ./demo/replay-progress.sh stripe-checkout  3 9 &
set -euo pipefail

SCENARIO="${1:-express-checkout}"
STEP_SECS="${2:-2}"
PR_NUMBER="${3:-1}"

cd "$(dirname "$0")/.."

# `make demo-progress` inherits these from the Makefile, but the menu runs this
# script directly, where they are unset — and the replayed links then pointed at
# a project nobody has.
if [[ -f .env.local ]]; then
  while IFS='=' read -r key val; do
    [[ "$key" =~ ^[[:space:]]*# || -z "${key// }" ]] && continue
    case "$key" in
      LD_APP_PROJECT_KEY | LD_ENVIRONMENT_KEY) printf -v "$key" '%s' "$val" ;;
    esac
  done < .env.local
fi

PROJECT="${LD_APP_PROJECT_KEY:-checkout-demo}"
LD_ENV="${LD_ENVIRONMENT_KEY:-production}"
# Repo slug so the replayed run gets a working PR link, same as the real runners.
: "${FACTORY_REPO:=$(git remote get-url origin 2>/dev/null \
    | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##' || true)}"
export FACTORY_REPO

# key : title : model : tags-json
# Mirrors the real output shape: a "[node] ... model -> '...'" line per node,
# and the routing tags each node emits on completion.
NODES=(
  "autofactory-research-planner:Research & plan:claude-opus-4-5-20251101:{}"
  "autofactory-flag-implementer:Flag implementation:claude-sonnet-4-5-20250929:{\"flag_key\":\"SCENARIO\",\"flag_ready\":\"true\"}"
  "autofactory-metrics-author:Metrics & instrumentation:claude-sonnet-4-5-20250929:{\"metric_keys\":\"SCENARIO-conversion,SCENARIO-error-rate\",\"metric_event_keys\":\"checkout-completed\"}"
  "autofactory-manifest-steward:Release manifest:claude-haiku-4-5-20251001:{\"manifest_path\":\".release-flags/SCENARIO.yaml\"}"
  "autofactory-flag-testing:Flag tests:claude-sonnet-4-5-20250929:{\"tests_last_run\":\"green\"}"
  "autofactory-code-reviewer:Code review:claude-opus-4-5-20251101:{\"risk_level\":\"low\",\"review_approved\":\"true\"}"
)

echo "Replaying '$SCENARIO' as PR #${PR_NUMBER} at ${STEP_SECS}s/step."
echo "Watch the Factory pane at http://localhost:3000"

{
  echo "Phase 1: PR #${PR_NUMBER} → graph 'gha-auto-factory' [provider: anthropic]"
  i=0
  for entry in "${NODES[@]}"; do
    IFS=':' read -r key title model tags <<< "$entry"
    tags="${tags//SCENARIO/$SCENARIO}"
    i=$((i + 1))
    echo "▶ step $i: $title ($key)"
    echo "[node] $key anthropic model → '$model'"
    sleep "$STEP_SECS"
    echo "■ step $i done: $title ($key) [ok] tags: $tags"

    # Emit the resource links at the points the real chain reports them.
    # Same URL shapes demo/lib/watch-hosted.mjs emits, so a rehearsal exercises
    # the links the real run will produce.
    if [ "$key" = "autofactory-flag-implementer" ]; then
      echo "Flag: ${SCENARIO} → https://app.launchdarkly.com/projects/${PROJECT}/flags/${SCENARIO}/targeting?env=${LD_ENV}"
    fi
    if [ "$key" = "autofactory-metrics-author" ]; then
      # One line per metric, matching phase1-cli which loops over metric_keys.
      for mk in "${SCENARIO}-conversion" "${SCENARIO}-error-rate"; do
        echo "Metric: ${mk} → https://app.launchdarkly.com/projects/${PROJECT}/metrics/${mk}?env=${LD_ENV}"
      done
    fi
  done

  printf 'Ran %d node(s): ' "${#NODES[@]}"
  ( IFS=' '; first=1; for e in "${NODES[@]}"; do [ $first -eq 1 ] || printf ' → '; printf '%s' "${e%%:*}"; first=0; done )
  printf '\n'
  echo '{"review_approved":true,"risk_level":"low"}'
} | node demo/lib/progress-tap.mjs "$SCENARIO"

echo "Replay complete."
