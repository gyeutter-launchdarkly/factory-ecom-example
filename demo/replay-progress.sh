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
SIMULATION_REASON="${FACTORY_SIMULATION_REASON:-}"

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
# Titles match the pane: Plan · Flag · Metrics · Release · Tests · Review.
NODES=(
  "autofactory-research-planner:Plan:claude-opus-4-5-20251101:{}"
  "autofactory-flag-implementer:Flag:claude-sonnet-4-5-20250929:{\"flag_key\":\"SCENARIO\",\"flag_ready\":\"true\"}"
  "autofactory-metrics-author:Metrics:claude-sonnet-4-5-20250929:{\"metric_keys\":\"SCENARIO-conversion,SCENARIO-error-rate\",\"metric_event_keys\":\"checkout-completed\"}"
  "autofactory-manifest-steward:Release:claude-haiku-4-5-20251001:{\"manifest_path\":\".release-flags/SCENARIO.yaml\"}"
  "autofactory-flag-testing:Tests:claude-sonnet-4-5-20250929:{\"tests_last_run\":\"green\"}"
  "autofactory-code-reviewer:Review:claude-opus-4-5-20251101:{\"risk_level\":\"low\",\"review_approved\":\"true\"}"
)

if [[ -n "$SIMULATION_REASON" ]]; then
  printf '  \033[31mvisual simulation only — no PR or LaunchDarkly resources\033[0m · pane http://localhost:3000\n'
else
  echo "  replay  ${SCENARIO} · PR #${PR_NUMBER} · ${STEP_SECS}s/step · pane http://localhost:3000"
fi

{
  # `»` marks runner narration: the tap always echoes those lines and the pane's
  # console highlights them, so a rehearsal shows the same framing a real run does.
  if [[ -n "$SIMULATION_REASON" ]]; then
    echo "::error::GitHub unavailable — visual simulation only; no PR or resources were created"
    echo "» OFFLINE DEMO: ${SCENARIO} → simulated graph progress"
  else
    echo "» Phase 1: PR #${PR_NUMBER} → graph 'gha-auto-factory' [provider: anthropic]"
  fi
  i=0
  for entry in "${NODES[@]}"; do
    IFS=':' read -r key title model tags <<< "$entry"
    tags="${tags//SCENARIO/$SCENARIO}"
    # Do not let the detail boxes imply a flag, metric, test, manifest, or
    # approval actually happened during outage mode.
    [[ -n "$SIMULATION_REASON" ]] && tags='{"simulated":"true"}'
    i=$((i + 1))
    echo "▶ step $i: $title ($key)"
    echo "[node] $key anthropic model → '$model'"
    # Same shape as the hosted watcher's bar, so a rehearsal looks like the run.
    if [[ "${FACTORY_PROGRESS_ONLY:-}" == "1" && -t 2 ]]; then
      done_width=$(( (i - 1) * 24 / ${#NODES[@]} ))
      printf -v filled '%*s' "$done_width" ''
      printf -v empty '%*s' "$((24 - done_width))" ''
      track="${filled// /#}${empty// /.}"
      printf '\r  [%s] %3d%%  %-28s' "$track" \
        "$(( (i - 1) * 100 / ${#NODES[@]} ))" "step $i/${#NODES[@]} $title" >&2
    fi
    sleep "$STEP_SECS"
    echo "■ step $i done: $title ($key) [ok] tags: $tags"

    # Emit the resource links at the points the real chain reports them.
    # Same URL shapes demo/lib/watch-hosted.mjs emits, so a rehearsal exercises
    # the links the real run will produce.
    if [[ -z "$SIMULATION_REASON" && "$key" = "autofactory-flag-implementer" ]]; then
      echo "Flag: ${SCENARIO} → https://app.launchdarkly.com/projects/${PROJECT}/flags/${SCENARIO}/targeting?env=${LD_ENV}"
    fi
    if [[ -z "$SIMULATION_REASON" && "$key" = "autofactory-metrics-author" ]]; then
      # One line per metric, matching phase1-cli which loops over metric_keys.
      for mk in "${SCENARIO}-conversion" "${SCENARIO}-error-rate"; do
        echo "Metric: ${mk} → https://app.launchdarkly.com/projects/${PROJECT}/metrics/${mk}?env=${LD_ENV}"
      done
    fi
  done

  printf 'Ran %d node(s): ' "${#NODES[@]}"
  ( IFS=' '; first=1; for e in "${NODES[@]}"; do [ $first -eq 1 ] || printf ' → '; printf '%s' "${e%%:*}"; first=0; done )
  printf '\n'
  if [[ -z "$SIMULATION_REASON" ]]; then
    echo '{"review_approved":true,"risk_level":"low"}'
  else
    echo "::error::Visual simulation complete — rerun when GitHub connectivity is restored"
  fi
} | node demo/lib/progress-tap.mjs "$SCENARIO"

if [[ "${FACTORY_PROGRESS_ONLY:-}" == "1" && -t 2 ]]; then
  printf '\r  [########################] 100%%  step %d/%d done%*s\n' \
    "${#NODES[@]}" "${#NODES[@]}" 14 '' >&2
fi
if [[ -n "$SIMULATION_REASON" ]]; then
  printf '  \033[31mreplay  simulation complete — no GitHub work was performed\033[0m\n'
else
  echo "  replay  complete"
fi
