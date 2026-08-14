#!/usr/bin/env bash
# One action, whole demo: open (or reuse) a real PR, start the factory on GitHub
# Actions, and stream its progress into the store's flowchart while it runs.
#
# Usage: ./demo/ci/run-hosted.sh <scenario>
#   or:  make hosted SCENARIO=<scenario>
#
# Why this exists rather than act: under act the action's bundle exits in ~190ms
# with no output and act reports success, so no agents run. The hosted runner
# executes the chain correctly. The cost used to be no local visibility, which
# this fixes by polling the job-logs API and feeding the same progress tap the
# act path uses.
set -uo pipefail

cd "$(dirname "$0")/../.."

SCENARIO="${1:-}"
EVENTS_DIR="demo/ci/events"

if [[ -z "$SCENARIO" || ! -f "$EVENTS_DIR/$SCENARIO.json" ]]; then
  echo "Usage: make hosted SCENARIO=<scenario>"
  for f in "$EVENTS_DIR"/*.json; do printf '  %s\n' "$(basename "$f" .json)"; done
  exit 1
fi

BRANCH="feature/${SCENARIO}"
SLUG=$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')

# gh prefers $GH_TOKEN/$GITHUB_TOKEN over its keyring, and the demo PAT cannot
# read Actions logs or set labels. Force the keyring session.
G() { env -u GH_TOKEN -u GITHUB_TOKEN gh "$@"; }

if ! G auth status &>/dev/null; then
  echo "gh is not logged in. Run: gh auth login"
  exit 1
fi

# 1. A PR to run against.
PR=$(G pr list --repo "$SLUG" --head "$BRANCH" --state open --json number --jq '.[0].number // empty')
if [[ -z "$PR" ]]; then
  echo "Opening a PR for $BRANCH"
  ./demo/run.sh "$SCENARIO" >/dev/null || { echo "could not open the PR"; exit 1; }
  PR=$(G pr list --repo "$SLUG" --head "$BRANCH" --state open --json number --jq '.[0].number // empty')
  [[ -z "$PR" ]] && { echo "PR did not appear"; exit 1; }
else
  echo "Reusing open PR #$PR"
fi
PR_URL="https://github.com/${SLUG}/pull/${PR}"

# 2. Start the run. With the label gate on, adding the label is the trigger; the
# label is also how a re-run is requested, so remove then re-add.
BEFORE=$(G run list --repo "$SLUG" --limit 1 --json databaseId --jq '.[0].databaseId // 0')
if [[ "$(G variable list --repo "$SLUG" --json name,value --jq '.[] | select(.name=="AUTOFACTORY_REQUIRE_LABEL") | .value')" == "true" ]]; then
  G pr edit "$PR" --repo "$SLUG" --remove-label autofactory &>/dev/null || true
  G label create autofactory --repo "$SLUG" --description "Approve AutoFactory run" &>/dev/null || true
  echo "Starting the factory (adding the 'autofactory' label)"
  G pr edit "$PR" --repo "$SLUG" --add-label autofactory &>/dev/null \
    || { echo "could not add the label"; exit 1; }
else
  echo "Label gate is off; pushing an empty commit to trigger the workflow"
  git commit -q --allow-empty -m "trigger factory run" && git push -q origin "$BRANCH"
fi

# 3. Wait for the new run to appear.
printf 'Waiting for the run to start'
RUN=""
for _ in $(seq 1 40); do
  RUN=$(G run list --repo "$SLUG" --branch "$BRANCH" --limit 1 \
    --json databaseId,status --jq '.[0] | select(.status=="queued" or .status=="in_progress") | .databaseId // empty')
  [[ -n "$RUN" && "$RUN" != "$BEFORE" ]] && break
  printf '.'; sleep 3
done
echo ""
if [[ -z "$RUN" ]]; then
  echo "No run started. Check ${PR_URL} (the label gate may not be set)."
  exit 1
fi

JOB=""
for _ in $(seq 1 20); do
  JOB=$(G api "repos/${SLUG}/actions/runs/${RUN}/jobs" --jq '.jobs[0].id // empty' 2>/dev/null)
  [[ -n "$JOB" ]] && break
  sleep 3
done

echo ""
echo "  PR:   ${PR_URL}"
echo "  Run:  https://github.com/${SLUG}/actions/runs/${RUN}"
echo "  Pane: http://localhost:3000  (steps light up as each agent starts)"
echo ""

# 4. Stream the job log into the progress tap. GitHub serves partial logs for a
# running job, so re-fetch and emit only what is new. The tap turns the
# "[node] <key> ... model → ..." lines into live step events for the flowchart.
export FACTORY_REPO="$SLUG"
TOKEN=$(G auth token)
LOG=$(mktemp)
trap 'rm -f "$LOG"' EXIT

{
  # Give the pane the PR number immediately, before any agent output exists.
  echo "Phase 1: PR #${PR} → graph 'gha-auto-factory' [provider: anthropic]"
  seen=0
  while true; do
    if [[ -n "$JOB" ]]; then
      curl -sL -o "$LOG" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${SLUG}/actions/jobs/${JOB}/logs" 2>/dev/null || true
      total=$(wc -l < "$LOG" 2>/dev/null || echo 0)
      if (( total > seen )); then
        tail -n +$((seen + 1)) "$LOG"
        seen=$total
      fi
    fi
    status=$(G run view "$RUN" --repo "$SLUG" --json status --jq .status 2>/dev/null || echo "")
    [[ "$status" == "completed" ]] && break
    sleep 6
  done
} | node demo/lib/progress-tap.mjs "$SCENARIO"

CONCLUSION=$(G run view "$RUN" --repo "$SLUG" --json conclusion --jq .conclusion 2>/dev/null)
echo ""
echo "=== Factory run ${CONCLUSION:-finished} ==="
echo "  ${PR_URL}"
[[ "$CONCLUSION" == "success" ]] || echo "  Logs: https://github.com/${SLUG}/actions/runs/${RUN}"
