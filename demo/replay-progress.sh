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
PROJECT="${LD_APP_PROJECT_KEY:-checkout-demo}"

cd "$(dirname "$0")/.."

NODES=(
  "autofactory-research-planner:Research & plan"
  "autofactory-flag-implementer:Flag implementation"
  "autofactory-metrics-author:Metrics & instrumentation"
  "autofactory-manifest-steward:Release manifest"
  "autofactory-flag-testing:Flag tests"
  "autofactory-code-reviewer:Code review"
)

echo "Replaying '$SCENARIO' as PR #${PR_NUMBER} at ${STEP_SECS}s/step."
echo "Watch the Factory pane at http://localhost:3000"

{
  echo "Phase 1: PR #${PR_NUMBER} → graph 'gha-auto-factory' [provider: anthropic]"
  i=0
  for entry in "${NODES[@]}"; do
    key="${entry%%:*}"; title="${entry#*:}"
    i=$((i + 1))
    echo "▶ step $i: $title ($key)"
    sleep "$STEP_SECS"
    echo "■ step $i done: $title ($key) [ok] tags: {}"

    # Emit the resource links at the points the real chain reports them.
    if [ "$key" = "autofactory-flag-implementer" ]; then
      echo "Flag: ${SCENARIO} → https://app.launchdarkly.com/${PROJECT}/flags/${SCENARIO}"
    fi
    if [ "$key" = "autofactory-metrics-author" ]; then
      echo "Metric: ${SCENARIO}-conversion → https://app.launchdarkly.com/${PROJECT}/metrics/${SCENARIO}-conversion/details"
    fi
  done

  printf 'Ran %d node(s): ' "${#NODES[@]}"
  ( IFS=' '; first=1; for e in "${NODES[@]}"; do [ $first -eq 1 ] || printf ' → '; printf '%s' "${e%%:*}"; first=0; done )
  printf '\n'
  echo '{"review_approved":true,"risk_level":"low"}'
} | node demo/lib/progress-tap.mjs "$SCENARIO"

echo "Replay complete."
