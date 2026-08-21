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

# shellcheck source=../lib/retry.sh
source demo/lib/retry.sh
# shellcheck source=../lib/ui.sh
source demo/lib/ui.sh

# pr, trigger, run, agents, result — the whole hosted path, one line each.
ui_begin 5

# gh prefers $GH_TOKEN/$GITHUB_TOKEN over its keyring, and the demo PAT cannot
# read Actions logs or set labels. Force the keyring session. Wrapped in
# gh_retry so a transient GitHub 5xx retries instead of aborting the demo.
G() { gh_retry env -u GH_TOKEN -u GITHUB_TOKEN gh "$@"; }

# shellcheck source=../lib/gate.sh
source demo/lib/gate.sh

GITHUB_OFFLINE_FILE=".autofactory/github-offline"

# Return 0 when GitHub answers, 1 only for a transient connectivity/outage
# failure, and 2 for a real auth/configuration error. The distinction matters:
# an outage gets a visibly labelled simulation; bad credentials must not be
# disguised as a healthy demo.
github_probe() {
  local err rc worst=0
  mkdir -p .autofactory
  err=$(mktemp "${TMPDIR:-/tmp}/github-probe.XXXXXX")

  # Both APIs, because the demo needs both and they fail independently: PRs and
  # labels go through GraphQL, runs and variables through REST. During the outage
  # this was written for, REST answered normally while GraphQL 503'd — probing
  # only REST would have called GitHub healthy and then died on the first PR call.
  local -a probes=(
    "api rate_limit"
    "api graphql -f query={viewer{login}}"
  )
  for probe in "${probes[@]}"; do
    # shellcheck disable=SC2086
    if G $probe >/dev/null 2>"$err"; then
      continue
    fi
    rc=$?
    if is_transient "$(cat "$err")"; then
      cat "$err" >"$GITHUB_OFFLINE_FILE"
      worst=1
    else
      cat "$err" >&2
      rm -f "$err"
      return 2
    fi
  done

  rm -f "$err"
  (( worst == 0 )) && rm -f "$GITHUB_OFFLINE_FILE"
  return "$worst"
}

offline_fallback() {
  local reason="${1:-GitHub API is unavailable}"
  mkdir -p .autofactory
  printf '%s\n' "$reason" >"$GITHUB_OFFLINE_FILE"
  printf '  \033[31mGitHub unavailable — visual simulation only; nothing is created\033[0m\n'
  FACTORY_SIMULATION_REASON="$reason" \
    FACTORY_PROGRESS_ONLY="${FACTORY_PROGRESS_ONLY:-1}" \
    ./demo/replay-progress.sh "$SCENARIO" "${FACTORY_FALLBACK_STEP_SECS:-2}" 0
}

# Call after an operation has failed. If GitHub has gone down since preflight,
# switch modes; otherwise preserve the real failure rather than masking it.
handle_github_failure() {
  local context="$1" status
  # Trust the error the failing call actually produced before re-probing: a probe
  # may hit an endpoint that is still healthy and wrongly report a real failure.
  if gh_last_error_transient; then
    offline_fallback "GitHub outage detected while ${context}"
    exit 0
  fi
  github_probe
  status=$?
  if (( status == 1 )); then
    offline_fallback "GitHub outage detected while ${context}"
    exit 0
  fi
  echo "GitHub is reachable; ${context} failed for a non-transient reason."
  exit 1
}

if ! env -u GH_TOKEN -u GITHUB_TOKEN gh auth status &>/dev/null; then
  echo "gh is not logged in. Run: gh auth login"
  exit 1
fi

# Check before touching the branch, gate, PR, or LaunchDarkly. A GitHub outage
# should not end the presentation: clearly switch to a visual-only run. Auth or
# permissions errors still stop, because simulating those would hide setup bugs.
github_probe
PROBE_STATUS=$?
if (( PROBE_STATUS == 1 )); then
  offline_fallback "GitHub API outage detected during preflight"
  exit 0
elif (( PROBE_STATUS != 0 )); then
  echo "GitHub is reachable, but the API check failed for a non-transient reason."
  exit 1
fi

# A branch left behind main has a diff that reverts main's own commits, so check
# (and rebase) before a PR exists rather than showing the audience the wrong
# change. `make menu` did this already; running this script directly did not.
# This intentionally follows the outage probe: simulation should not mutate git.
# shellcheck source=../lib/branch.sh
source demo/lib/branch.sh
ensure_branch_ready "$SCENARIO" || exit 1

# demo/run.sh ungates the hosted workflow by default (its own path wants GitHub
# to fire on PR open). Here the label IS the trigger, so claim the gate and set
# it on before anything opens a PR.
export FACTORY_GATE_MANAGED=1
# Quiet: the trigger step below says the label went on, which is the part that
# matters. The gate only needs a line when it could not be set.
gate_set true quiet

# The pane opens now, not when GitHub finally hands back a run id: creating the
# PR, setting the label and waiting for Actions to pick it up is up to a minute
# of nothing on screen otherwise. progress-tap.mjs inherits this id, so these
# early events and the streamed ones are a single run rather than two entries.
export FACTORY_RUN_ID="${SCENARIO}-$(date +%s)000"
PROGRESS_FILE="${FACTORY_PROGRESS_FILE:-.autofactory/runs.ndjson}"
factory_emit() {
  mkdir -p "$(dirname "$PROGRESS_FILE")" 2>/dev/null || true
  printf '{"run":"%s","scenario":"%s","seq":0,"at":%s,%s}\n' \
    "$FACTORY_RUN_ID" "$SCENARIO" "$(( $(date +%s) * 1000 ))" "$1" >>"$PROGRESS_FILE" 2>/dev/null || true
}
factory_emit '"t":"run-start"'
factory_emit "\"t\":\"repo\",\"repo\":\"${SLUG}\""
factory_emit '"t":"log","text":"» opening the pull request"'

# 1. A PR to run against. Only open ones count: the branch keeps its closed PRs
# from earlier demos, and a closed one cannot carry a run.
open_pr_number() {
  G pr list --repo "$SLUG" --head "$BRANCH" --state open --json number --jq '.[0].number // empty'
}

if ! PR=$(open_pr_number); then
  handle_github_failure "looking for an existing PR"
fi
if [[ -z "$PR" ]]; then
  ui_start "pr" "opening a PR for $BRANCH"
  ./demo/run.sh "$SCENARIO" >/dev/null || handle_github_failure "opening the PR"
  # GitHub's list endpoint lags the create by a beat, so give it a few tries
  # rather than calling a PR that does exist missing.
  for _ in 1 2 3 4 5; do
    if ! PR=$(open_pr_number); then
      handle_github_failure "confirming the new PR"
    fi
    [[ -n "$PR" ]] && break
    sleep 2
  done
  if [[ -z "$PR" ]]; then
    ui_fail "no open PR for $BRANCH, even after creating one"
    ui_note "https://github.com/${SLUG}/pulls?q=is:pr+head:${BRANCH} — reopen a closed one, or 'make reset'"
    exit 1
  fi
else
  ui_start "pr" "reusing open PR"
fi
PR_URL="https://github.com/${SLUG}/pull/${PR}"
ui_done "#${PR}  ${PR_URL}"
# Known now, so the pane can offer the PR link during the wait for Actions.
factory_emit "\"t\":\"pr\",\"number\":${PR}"
factory_emit "\"t\":\"log\",\"text\":\"» PR #${PR} → ${PR_URL}\""

# 2. Start the run. With the label gate on, adding the label is the trigger; the
# label is also how a re-run is requested, so remove then re-add.
if ! GATE=$(G variable list --repo "$SLUG" --json name,value \
  --jq '.[] | select(.name=="AUTOFACTORY_REQUIRE_LABEL") | .value'); then
  handle_github_failure "checking the workflow gate"
fi
if [[ "$GATE" != "true" ]]; then
  ui_start "trigger" ""
  ui_fail "AUTOFACTORY_REQUIRE_LABEL is '${GATE:-unset}'; the label cannot trigger a run"
  ui_note "fix: gh variable set AUTOFACTORY_REQUIRE_LABEL --body true"
  exit 1
fi

# Adding a label that is already there is a no-op and fires no event, so a re-run
# needs the label gone first. Removing it fires `unlabeled`, which the gate turns
# into its own skipped run — so the baseline is taken after the removal settles,
# or that skipped run looks like the one we asked for.
G pr edit "$PR" --repo "$SLUG" --remove-label autofactory &>/dev/null || true
G label create autofactory --repo "$SLUG" --description "Approve AutoFactory run" &>/dev/null || true
sleep 2

# Branch-scoped: a repo-wide baseline is a different branch's run, and comparing
# against it is how a stale, already-finished run got adopted and re-watched as
# if it were new.
if ! BEFORE=$(G run list --repo "$SLUG" --branch "$BRANCH" --limit 1 \
  --json databaseId --jq '.[0].databaseId // 0'); then
  handle_github_failure "checking the prior Actions run"
fi
# Interpolated into a jq query below (gh has no --argjson), so keep it digits.
BEFORE="${BEFORE//[^0-9]/}"
BEFORE="${BEFORE:-0}"

ui_start "trigger" "adding the 'autofactory' label"
G pr edit "$PR" --repo "$SLUG" --add-label autofactory &>/dev/null \
  || handle_github_failure "starting the factory"
ui_done "'autofactory' label added"

# 3. Wait for the run our label actually started: newer than the baseline, and
# not the gate's skipped run. Completed runs count — a run that fails in seconds
# (a rejected API key does that) would otherwise never be seen at all.
# A growing ### track while GitHub picks the run up.
RUN=""
WAIT_START=$(date +%s)
ui_start "run" "waiting for GitHub to start it"
for _ in $(seq 1 40); do
  if ! RUN=$(G run list --repo "$SLUG" --branch "$BRANCH" --limit 10 \
    --json databaseId,conclusion \
    --jq "[.[] | select(.databaseId > ${BEFORE} and .conclusion != \"skipped\")] | .[0].databaseId // empty"); then
    handle_github_failure "waiting for the Actions run"
  fi
  [[ -n "$RUN" ]] && break
  ui_tick "waiting for GitHub to start it  $(ui_elapsed "$WAIT_START")"
  sleep 3
done
if [[ -z "$RUN" ]]; then
  ui_fail "no run started within two minutes"
  ui_note "the 'autofactory' label is the trigger; check it is on ${PR_URL}"
  exit 1
fi

# Same shape the tap parses from the narration below; the pane de-duplicates by
# key, so offering it early costs nothing and saves the wait.
factory_emit "\"t\":\"resource\",\"kind\":\"run\",\"key\":\"${RUN}\",\"url\":\"https://github.com/${SLUG}/actions/runs/${RUN}\""

JOB=""
for _ in $(seq 1 20); do
  JOB=$(G api "repos/${SLUG}/actions/runs/${RUN}/jobs" --jq '.jobs[0].id // empty' 2>/dev/null)
  [[ -n "$JOB" ]] && break
  sleep 3
done

ui_done "${RUN}  https://github.com/${SLUG}/actions/runs/${RUN}"
ui_start "agents" "pane http://localhost:3000 · ctrl-c stops watching, the run continues"
ui_done

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

# The narration goes through the tap rather than straight to the terminal, so
# the pane's console shows the same story the operator is reading — and so the
# pane learns the PR number, which nothing in the hosted path used to tell it.
# `»` marks a line as narration: the tap always echoes those, even in the menu's
# progress-only mode.
{
  echo "» Phase 1: PR #${PR} — ${BRANCH}"
  echo "» Run: ${RUN} → https://github.com/${SLUG}/actions/runs/${RUN}"
  node demo/lib/watch-hosted.mjs "$SCENARIO" "$PR" "$RUN" "$SLUG" "$LD_PROJECT" "${LD_ENV:-production}"
} | node demo/lib/progress-tap.mjs "$SCENARIO"

# The watcher can discover an outage after the real run has begun. It completes
# the remaining boxes visually and writes this marker; do not then call GitHub
# again or print the ordinary "factory run finished" footer.
if [[ -f "$GITHUB_OFFLINE_FILE" ]]; then
  ui_start "result" ""
  ui_fail "visual simulation — GitHub connection lost mid-run"
  ui_note "observed steps were real, the rest were simulated; rerun when GitHub is back"
  exit 0
fi

# Whatever the factory just created should show up in the AutoFactory view.
# shellcheck source=../lib/link-view.sh
source demo/lib/link-view.sh
if [[ "${FACTORY_PROGRESS_ONLY:-}" == "1" ]]; then
  ld_view_sync >/dev/null
else
  ld_view_sync
fi

CONCLUSION=$(G run view "$RUN" --repo "$SLUG" --json conclusion --jq .conclusion 2>/dev/null)
ui_start "result" ""
if [[ "$CONCLUSION" == "success" ]]; then
  ui_done "success  ${PR_URL}"
else
  ui_fail "${CONCLUSION:-finished}  ${PR_URL}"
  ui_note "logs: https://github.com/${SLUG}/actions/runs/${RUN}"
  # shellcheck source=../lib/explain-failure.sh
  source demo/lib/explain-failure.sh
  explain_run_failure "$SLUG" "$RUN" || true
fi
