#!/usr/bin/env bash
# Run a scenario against the Factory GitHub App target.
#
# Usage: ./demo/ci/run-factory.sh <scenario>
#   or:  make factory SCENARIO=<scenario>
#
# How this differs from the AutoFactory path, and why it is a separate script:
#
#   AutoFactory  a workflow checked into this repo, which we trigger with the
#                `autofactory` label and then watch as a run we own.
#   Factory      a GitHub App on another repo. Opening the PR is the entire
#                trigger. There is no workflow, no run id, and no gate to set, so
#                there is nothing of ours to poll: progress is whatever the App
#                does to the PR.
#
# The scenario's change is taken from this repo's feature branch and applied to
# the target, so both products demo the same six scenarios.
set -euo pipefail

cd "$(dirname "$0")/../.."

SCENARIO="${1:-}"
# shellcheck source=../lib/pack.sh
source demo/lib/pack.sh
EVENT_FILE=$(pack_event_file "$SCENARIO" 2>/dev/null || true)

if [[ -z "$SCENARIO" || -z "$EVENT_FILE" ]]; then
  echo "Usage: make factory SCENARIO=<scenario>"
  pack_scenarios | sed 's/^/  /'
  exit 1
fi

export FACTORY_TARGET=factory
# shellcheck source=../lib/target.sh
source demo/lib/target.sh
# shellcheck source=../lib/ui.sh
source demo/lib/ui.sh

G() { env -u GH_TOKEN -u GITHUB_TOKEN gh "$@"; }

if ! G auth status &>/dev/null; then
  echo "gh is not logged in. Run: gh auth login"
  exit 1
fi

SLUG=$(target_slug)
DIR=$(target_dir)
if [[ "$(pack_visibility)" == "private" ]]; then
  [[ "$(G repo view "$SLUG" --json isPrivate --jq .isPrivate)" == "true" ]] || { echo "Private packs require a verified private target repository." >&2; exit 1; }
fi

ui_begin 4

ui_start "repo" "syncing ${SLUG}"
target_ensure_repo || { ui_fail "could not sync ${SLUG}"; exit 1; }

# Without the storefront there is nothing for a scenario to change. On a fresh
# target that is a pending PR, not a broken setup, so name it.
if ! target_has_app; then
  ui_fail "no storefront on $(target_base_branch) in ${SLUG}"
  ui_note "merge the storefront PR first: https://github.com/${SLUG}/pulls"
  exit 1
fi
ui_done "repo"

ui_start "change" "building the ${SCENARIO} change"
BRANCH=$(target_prepare_scenario "$SCENARIO") || { ui_fail "could not prepare ${SCENARIO}"; exit 1; }
ui_done "change"

ui_start "pr" "opening the pull request"
PR=$(G pr list --repo "$SLUG" --head "$BRANCH" --state open --json number --jq '.[0].number // empty')
if [[ -z "$PR" ]]; then
  TITLE=$(jq -r '.pull_request.title // empty' "$EVENT_FILE")
  BODY=$(jq -r '.pull_request.body // empty' "$EVENT_FILE")
  body_file=$(mktemp)
  printf '%s\n' "${BODY:-Scenario: $SCENARIO}" >"$body_file"
  if ! G pr create --repo "$SLUG" --base "$(target_base_branch)" --head "$BRANCH" \
    --title "${TITLE:-feat: $SCENARIO}" --body-file "$body_file"; then
    rm -f "$body_file"; ui_fail "could not open the PR"; exit 1
  fi
  rm -f "$body_file"
  PR=$(G pr list --repo "$SLUG" --head "$BRANCH" --state open --json number --jq '.[0].number // empty')
fi
[[ -n "$PR" ]] || { ui_fail "no open PR for $BRANCH"; exit 1; }
PR_URL="https://github.com/${SLUG}/pull/${PR}"
ui_done "pr"

echo ""
echo "  PR:  ${PR_URL}"
echo ""
echo "  Factory runs as a GitHub App: the PR is the trigger, so watch the PR"
echo "  itself for its commits, checks and comment. ctrl-c to stop watching."
echo ""

# Emit the same structured progress consumed by the browser, and wait for
# terminal checks on the latest PR head. A commit/comment is activity, not success.
export FACTORY_RUN_ID="${SCENARIO}-factory-$(date +%s)000"
node demo/lib/watch-factory.mjs "$SCENARIO" "$SLUG" "$PR"
