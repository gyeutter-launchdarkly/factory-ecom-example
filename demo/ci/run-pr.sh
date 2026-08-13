#!/usr/bin/env bash
# Hybrid run: a REAL pull request on GitHub, with the factory executed LOCALLY by
# act. Best of both for a live demo — the audience sees an actual PR gaining
# comments, a check run, and commits, but you do not wait on the Actions queue.
#
# Usage: ./demo/ci/run-pr.sh <scenario>
#   or:  make pr SCENARIO=<scenario>
#
# How it differs from the two plain paths:
#   make ci   canned event payload, dummy token. Nothing touches GitHub.
#   make run  real PR, and GitHub Actions runs the factory. Queue wait.
#   make pr   real PR, and act runs the factory here. Writes to the real PR.
#
# The event payload is built from the live PR (number, title, body, head ref AND
# head sha, base ref, labels), so the action's check run attaches to the PR's own
# commit rather than an invented one.
#
# Avoiding a double run: set the repo variable AUTOFACTORY_REQUIRE_LABEL=true so
# the hosted workflow stays gated behind a label you never add, while this script
# passes AUTOFACTORY_REQUIRE_LABEL=false to act so the local run proceeds.
set -euo pipefail

cd "$(dirname "$0")/../.."

SCENARIO="${1:-}"
EVENTS_DIR="demo/ci/events"

if [[ -z "$SCENARIO" || ! -f "$EVENTS_DIR/$SCENARIO.json" ]]; then
  echo "Usage: make pr SCENARIO=<scenario>"
  echo "Available:"
  for f in "$EVENTS_DIR"/*.json; do printf '  %s\n' "$(basename "$f" .json)"; done
  exit 1
fi

BRANCH="feature/${SCENARIO}"

TOKEN=$(grep "^GITHUB_TOKEN=" .env.local 2>/dev/null | cut -d= -f2- || true)
if [[ -z "$TOKEN" || "$TOKEN" == "dummy-local-run" ]]; then
  echo "This path needs a real GITHUB_TOKEN in .env.local (it writes to a real PR)."
  echo "Run 'bash demo/setup.sh', or use 'make ci' for a fully local run."
  exit 1
fi

SLUG=$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')

# shellcheck source=../lib/gate.sh
source demo/lib/gate.sh

# Gate the hosted workflow BEFORE the PR exists, so GitHub never picks it up and
# duplicates this run. Set here rather than asked of you.
gate_set true
export FACTORY_GATE_MANAGED=1

api() {
  curl -s -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" "$@"
}

# Reuse an open PR for this branch, or open one.
PR_JSON=$(api "https://api.github.com/repos/${SLUG}/pulls?state=open&head=${SLUG%%/*}:${BRANCH}&per_page=1")
PR_NUMBER=$(printf '%s' "$PR_JSON" | jq -r '.[0].number // empty')

if [[ -z "$PR_NUMBER" ]]; then
  echo "No open PR for $BRANCH; opening one."
  ./demo/run.sh "$SCENARIO"
  PR_JSON=$(api "https://api.github.com/repos/${SLUG}/pulls?state=open&head=${SLUG%%/*}:${BRANCH}&per_page=1")
  PR_NUMBER=$(printf '%s' "$PR_JSON" | jq -r '.[0].number // empty')
  [[ -z "$PR_NUMBER" ]] && { echo "Could not find the PR after opening it."; exit 1; }
else
  echo "Reusing open PR #${PR_NUMBER} for $BRANCH."
fi

# Build the event from the live PR. head.sha matters: on pull_request events the
# action attaches its check run to the PR head, not the merge commit.
PR=$(api "https://api.github.com/repos/${SLUG}/pulls/${PR_NUMBER}")
# act runs inside the ci container, which mounts only this repo at /workspace.
# Host /tmp is invisible there, so the event and secret files have to live in the
# workspace and be referenced by repo-relative path. .autofactory/tmp is
# gitignored. Note mktemp only substitutes when the Xs end the template.
ACT_TMP=".autofactory/tmp"
mkdir -p "$ACT_TMP"
EVENT_FILE=$(mktemp "$ACT_TMP/pr-event.XXXXXX")
SECRETS_FILE=$(mktemp "$ACT_TMP/secrets.XXXXXX")
chmod 600 "$SECRETS_FILE"
trap 'rm -f "$EVENT_FILE" "$SECRETS_FILE"; restore_branch' EXIT

printf '%s' "$PR" | jq \
  --arg repo_name "${SLUG##*/}" \
  --arg full_name "$SLUG" \
  '{
    action: "opened",
    number: .number,
    pull_request: {
      number: .number,
      title: .title,
      body: (.body // ""),
      head: { ref: .head.ref, sha: .head.sha },
      base: { ref: .base.ref },
      labels: [.labels[]? | {name: .name}]
    },
    repository: {
      name: $repo_name,
      full_name: $full_name,
      default_branch: .base.repo.default_branch
    },
    sender: { login: .user.login }
  }' > "$EVENT_FILE"

HEAD_SHA=$(jq -r '.pull_request.head.sha' "$EVENT_FILE")
echo "    PR:      #${PR_NUMBER}  https://github.com/${SLUG}/pull/${PR_NUMBER}"
echo "    branch:  ${BRANCH}"
echo "    head:    ${HEAD_SHA:0:12}"

# The factory needs the branch checked out locally; act mounts this workspace.
# Return to where you started on exit: leaving you parked on a feature branch
# means later commits land there instead of main, and `make reset` then rewinds
# the branch and orphans them.
STARTING_BRANCH=$(git branch --show-current)
restore_branch() {
  local now
  now=$(git branch --show-current 2>/dev/null || true)
  if [[ -n "$STARTING_BRANCH" && "$now" != "$STARTING_BRANCH" ]]; then
    git checkout -q "$STARTING_BRANCH" 2>/dev/null \
      && echo "  back on $STARTING_BRANCH"
  fi
}

if [[ "$STARTING_BRANCH" != "$BRANCH" ]]; then
  echo "Switching to $BRANCH"
  git stash --include-untracked 2>/dev/null || true
  git checkout "$BRANCH"
fi

grep -E "^(LD_SDK_KEY|LD_API_KEY|ANTHROPIC_API_KEY)=" .env.local 2>/dev/null >> "$SECRETS_FILE" || true
echo "GITHUB_TOKEN=$TOKEN" >> "$SECRETS_FILE"

LD_APP_PROJECT_KEY=$(grep "^LD_APP_PROJECT_KEY=" .env.local 2>/dev/null | cut -d= -f2- || echo "checkout-demo")

echo ""
echo "=== Running the factory locally against PR #${PR_NUMBER} ==="
echo ""

export FACTORY_REPO="$SLUG"

set +e
docker compose run --rm ci \
  pull_request \
  --eventpath "$EVENT_FILE" \
  --secret-file "$SECRETS_FILE" \
  --var "LD_APP_PROJECT_KEY=$LD_APP_PROJECT_KEY" \
  --var "AUTOFACTORY_REQUIRE_LABEL=false" \
  --env "GITHUB_REPOSITORY=$SLUG" \
  -P "ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-22.04" \
  -W .github/workflows/auto-factory.yml 2>&1 | node demo/lib/progress-tap.mjs "$SCENARIO"
ACT_STATUS=${PIPESTATUS[0]}
set -e

echo ""
echo "=== Done. The PR should now carry the factory's comment, check run, and commits. ==="
echo "    https://github.com/${SLUG}/pull/${PR_NUMBER}"
exit "$ACT_STATUS"
