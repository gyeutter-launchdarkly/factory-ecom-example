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

# shellcheck source=../lib/gate.sh
source demo/lib/gate.sh

# A branch left behind main has a diff that reverts main's own commits, so check
# (and rebase) before a PR exists rather than showing the audience the wrong
# change. `make menu` did this already; running this script directly did not.
# shellcheck source=../lib/branch.sh
source demo/lib/branch.sh
ensure_branch_ready "$SCENARIO" || exit 1

# demo/run.sh ungates the hosted workflow by default (its own path wants GitHub
# to fire on PR open). Here the label IS the trigger, so claim the gate and set
# it on before anything opens a PR.
export FACTORY_GATE_MANAGED=1
gate_set true

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
GATE=$(G variable list --repo "$SLUG" --json name,value \
  --jq '.[] | select(.name=="AUTOFACTORY_REQUIRE_LABEL") | .value')
if [[ "$GATE" != "true" ]]; then
  echo "AUTOFACTORY_REQUIRE_LABEL is '${GATE:-unset}' and could not be set to true."
  echo "The label is how this path triggers a run, so stopping rather than pushing"
  echo "an empty commit to your feature branch. Fix with:"
  echo "  gh variable set AUTOFACTORY_REQUIRE_LABEL --body true"
  exit 1
fi

# Re-adding the label is also how a re-run is requested, so clear it first.
G pr edit "$PR" --repo "$SLUG" --remove-label autofactory &>/dev/null || true
G label create autofactory --repo "$SLUG" --description "Approve AutoFactory run" &>/dev/null || true
echo "Starting the factory (adding the 'autofactory' label)"
G pr edit "$PR" --repo "$SLUG" --add-label autofactory &>/dev/null \
  || { echo "could not add the label"; exit 1; }

# 3. Wait for the new run to appear.
# A growing ### track while GitHub picks the run up.
RUN=""
for i in $(seq 1 40); do
  RUN=$(G run list --repo "$SLUG" --branch "$BRANCH" --limit 1 \
    --json databaseId,status --jq '.[0] | select(.status=="queued" or .status=="in_progress") | .databaseId // empty')
  [[ -n "$RUN" && "$RUN" != "$BEFORE" ]] && break
  [ -t 1 ] && printf '\r  waiting for GitHub to start the run  [%-24s]' "$(printf '#%.0s' $(seq 1 $(( i % 25 ))))"
  sleep 3
done
[ -t 1 ] && printf '\r%-70s\r' " "
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
echo "  ctrl-c to stop watching (the run keeps going on GitHub)"
echo ""

# 4. Stream live progress into the pane. GitHub will not serve a job's log until
# the job finishes (404 BlobNotFound while running), so progress is derived from
# the artifacts each agent produces: the flag and metrics appearing in
# LaunchDarkly, and the commits pushed to the PR branch. watch-hosted.mjs emits
# lines in the tap's format so there is a single parser for both paths.
export FACTORY_REPO="$SLUG"
export GH_WATCH_TOKEN="$(G auth token)"
export LD_API_KEY="$(grep '^LD_API_KEY=' .env.local 2>/dev/null | cut -d= -f2-)"
LD_PROJECT=$(grep '^LD_APP_PROJECT_KEY=' .env.local 2>/dev/null | cut -d= -f2- || echo "checkout-demo")
# The pane's deep links have to point at the environment the demo actually uses.
LD_ENV=$(grep '^LD_ENVIRONMENT_KEY=' .env.local 2>/dev/null | cut -d= -f2-)
# ld_view_sync below reads these from the environment, and returns quietly when
# they are unset — which is why the view stopped collecting the factory's flags.
export LD_APP_PROJECT_KEY="$LD_PROJECT"
export LD_ENVIRONMENT_KEY="${LD_ENV:-production}"

node demo/lib/watch-hosted.mjs "$SCENARIO" "$PR" "$RUN" "$SLUG" "$LD_PROJECT" "${LD_ENV:-production}" \
  | node demo/lib/progress-tap.mjs "$SCENARIO"

# Whatever the factory just created should show up in the AutoFactory view.
# shellcheck source=../lib/link-view.sh
source demo/lib/link-view.sh
ld_view_sync

CONCLUSION=$(G run view "$RUN" --repo "$SLUG" --json conclusion --jq .conclusion 2>/dev/null)
echo ""
echo "=== Factory run ${CONCLUSION:-finished} ==="
echo "  ${PR_URL}"
[[ "$CONCLUSION" == "success" ]] || echo "  Logs: https://github.com/${SLUG}/actions/runs/${RUN}"
