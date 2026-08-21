#!/usr/bin/env bash
# Run the real AutoFactory graph directly against a disposable local clone.
# No PR, no GitHub queue, and no risk of agents dirtying the presenter checkout.
set -euo pipefail

cd "$(dirname "$0")/../.."

SCENARIO="${1:-}"
[[ "$SCENARIO" =~ ^[a-z0-9-]{1,64}$ ]] || {
  echo "usage: demo/ci/run-local.sh <scenario>"
  exit 2
}
# shellcheck source=../lib/pack.sh
source demo/lib/pack.sh

EVENT_FILE=$(pack_event_file "$SCENARIO" 2>/dev/null || true)
[[ -n "$EVENT_FILE" ]] || {
  echo "Unknown scenario '$SCENARIO' in demo pack '$DEMO_PACK'."
  exit 2
}

BRANCH=$(jq -r '.pull_request.head.ref // empty' "$EVENT_FILE")
BASE=$(jq -r '.pull_request.base.ref // "main"' "$EVENT_FILE")
[[ -n "$BRANCH" ]] || { echo "Scenario has no pull_request.head.ref."; exit 2; }
git show-ref --verify --quiet "refs/heads/$BRANCH" || {
  echo "Local mode needs branch '$BRANCH' in this checkout."
  exit 2
}

FACTORY_DIR="${AUTOFACTORY_DIR:-}"
if [[ -z "$FACTORY_DIR" ]]; then
  for candidate in ../launchdarkly-auto-factory "$HOME/Documents/launchdarkly-auto-factory"; do
    [[ -f "$candidate/packages/phase1-cli/dist/cli.js" ]] && { FACTORY_DIR="$candidate"; break; }
  done
fi
[[ -f "$FACTORY_DIR/packages/phase1-cli/dist/cli.js" ]] || {
  echo "The AutoFactory phase1 CLI is not built."
  echo "Set AUTOFACTORY_DIR, then run npm install && npm run build there."
  exit 2
}

# Export the existing demo credentials without copying them into the disposable
# clone. The current setup uses one LD project for control plane and app flags.
set -a
# shellcheck disable=SC1091
[[ -f .env.local ]] && source .env.local
set +a
export LD_PROJECT_KEY="${LD_PROJECT_KEY:-${LD_APP_PROJECT_KEY:-}}"

RUN_ID="${SCENARIO}-local-$(date +%s)000"
ROOT=".autofactory/local-runs/$RUN_ID"
mkdir -p "$(dirname "$ROOT")"
rm -rf "$ROOT"

echo "  local   cloning $BRANCH into $ROOT"
git clone -q --no-hardlinks . "$ROOT"
git -C "$ROOT" checkout -q -B "$BRANCH" "origin/$BRANCH"
if ! git -C "$ROOT" show-ref --verify --quiet "refs/heads/$BASE"; then
  git -C "$ROOT" branch "$BASE" "origin/$BASE" >/dev/null
fi

if [[ "${FACTORY_LOCAL_PREP_ONLY:-0}" == "1" ]]; then
  echo "  local   prepared $BRANCH against $BASE"
  exit 0
fi

export FACTORY_RUN_ID="$RUN_ID"
export FACTORY_REPO="local"

# The pane clips long lines and the terminal shows a summary, so the unedited
# agent output — including a reviewer's full rejection rationale — is kept here.
# A hosted run has the Actions log for this; a local run has nothing else.
LOG="$ROOT/factory-run.log"

set +e
{
  echo "» Resource: local-run ${RUN_ID} @ext-ci → /api/factory-runs/${RUN_ID}/log"
  if [[ -n "${LD_PROJECT_KEY:-}" ]]; then
    for agent in \
      autofactory-research-planner \
      autofactory-flag-implementer \
      autofactory-metrics-author \
      autofactory-manifest-steward \
      autofactory-flag-testing \
      autofactory-code-reviewer; do
      echo "» Resource: agent-config ${agent} @${agent} → https://app.launchdarkly.com/projects/${LD_PROJECT_KEY}/ai-configs/${agent}/monitoring?env=${LD_ENVIRONMENT_KEY:-production}"
    done
  fi
  node "$FACTORY_DIR/packages/phase1-cli/dist/cli.js" run \
    --root "$ROOT" \
    --base "$BASE"
} 2>&1 | tee "$LOG" | node demo/lib/progress-tap.mjs "$SCENARIO"
status=${PIPESTATUS[0]}
set -e

if (( status == 0 )); then
  echo "  local   complete; generated diff kept at $ROOT"
else
  echo "  local   failed (exit $status); inspect $ROOT"
fi
echo "  local   full agent output: $LOG"
exit "$status"
