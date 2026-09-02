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
set -uo pipefail

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
  G pr create --repo "$SLUG" --base "$(target_base_branch)" --head "$BRANCH" \
    --title "${TITLE:-feat: $SCENARIO}" --body "${BODY:-Scenario: $SCENARIO}" >/dev/null 2>&1 \
    || { ui_fail "could not open the PR"; exit 1; }
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

# Watch the PR rather than a workflow run: with an App there is no run of ours to
# poll. New commits, checks and comments on the PR are the App working.
ui_start "factory" "waiting for Factory to act on the PR"
DEADLINE=$(( $(date +%s) + ${FACTORY_WATCH_SECS:-900} ))
SEEN_COMMITS=$(G pr view "$PR" --repo "$SLUG" --json commits --jq '.commits | length' 2>/dev/null || echo 0)
SEEN_COMMENTS=$(G pr view "$PR" --repo "$SLUG" --json comments --jq '.comments | length' 2>/dev/null || echo 0)
ACTED=0
while (( $(date +%s) < DEADLINE )); do
  sleep 10
  NOW_COMMITS=$(G pr view "$PR" --repo "$SLUG" --json commits --jq '.commits | length' 2>/dev/null || echo "$SEEN_COMMITS")
  NOW_COMMENTS=$(G pr view "$PR" --repo "$SLUG" --json comments --jq '.comments | length' 2>/dev/null || echo "$SEEN_COMMENTS")
  CHECKS=$(G pr checks "$PR" --repo "$SLUG" 2>/dev/null | wc -l | tr -d ' ')

  if (( NOW_COMMITS > SEEN_COMMITS )); then
    echo "  + $(( NOW_COMMITS - SEEN_COMMITS )) commit(s) pushed by Factory"
    SEEN_COMMITS=$NOW_COMMITS; ACTED=1
  fi
  if (( NOW_COMMENTS > SEEN_COMMENTS )); then
    echo "  + $(( NOW_COMMENTS - SEEN_COMMENTS )) comment(s) on the PR"
    SEEN_COMMENTS=$NOW_COMMENTS; ACTED=1
  fi
  if (( CHECKS > 0 )); then
    G pr checks "$PR" --repo "$SLUG" 2>/dev/null | sed 's/^/    /'
    ACTED=1
    break
  fi
done

if (( ACTED == 1 )); then
  ui_done "factory"
else
  ui_fail "no Factory activity seen on the PR yet"
  ui_note "the App may not be installed on ${SLUG}, or it may still be queued"
fi

echo ""
echo "  ${PR_URL}"
