#!/usr/bin/env bash
# Open a GitHub PR for a named demo scenario, so the AutoFactory action runs in
# GitHub Actions rather than locally.
#
# Usage: ./demo/run.sh <scenario>
#   or:  make run SCENARIO=<scenario>
#
# Title and body come from demo/ci/events/<scenario>.json — the same payload
# `make ci` feeds act — so the two paths present the factory with identical text.
set -euo pipefail

cd "$(dirname "$0")/.."

SCENARIO="${1:-}"
EVENTS_DIR="demo/ci/events"

list_scenarios() {
  echo "Available scenarios:"
  for f in "$EVENTS_DIR"/*.json; do
    printf '  %-18s %s\n' "$(basename "$f" .json)" "$(jq -r '.pull_request.title' "$f")"
  done
}

if [[ -z "$SCENARIO" ]]; then
  echo "Usage: make run SCENARIO=<scenario>"
  list_scenarios
  exit 1
fi

EVENT_FILE="${EVENTS_DIR}/${SCENARIO}.json"
if [[ ! -f "$EVENT_FILE" ]]; then
  echo "Unknown scenario: $SCENARIO"
  list_scenarios
  exit 1
fi

# shellcheck source=lib/gate.sh
source demo/lib/gate.sh

# Opening a PR here means the hosted workflow should run, so make sure it is not
# gated. Skipped when run-pr.sh is driving: it wants the hosted run gated so only
# its local act run proceeds.
if [[ -z "${FACTORY_GATE_MANAGED:-}" ]]; then
  gate_set false
fi

BRANCH="feature/${SCENARIO}"
if ! git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Error: branch $BRANCH not found locally."
  echo "Run 'make reset' to recreate it from its seed tag."
  exit 1
fi

TITLE=$(jq -r '.pull_request.title' "$EVENT_FILE")
BODY=$(jq -r '.pull_request.body' "$EVENT_FILE")
BASE=$(jq -r '.pull_request.base.ref // "main"' "$EVENT_FILE")

# Push the branch so GitHub can see it.
git push -u origin "$BRANCH" 2>/dev/null || git push -u origin "$BRANCH" --force-with-lease

echo "Opening PR: $TITLE"

if command -v gh &>/dev/null; then
  gh pr create --head "$BRANCH" --base "$BASE" --title "$TITLE" --body "$BODY"
  URL=$(gh pr view "$BRANCH" --json url -q .url 2>/dev/null || true)
else
  # No gh: creating a PR is a plain POST, so the PAT in .env.local is enough.
  TOKEN=$(grep "^GITHUB_TOKEN=" .env.local 2>/dev/null | cut -d= -f2- || true)
  if [[ -z "$TOKEN" || "$TOKEN" == "dummy-local-run" ]]; then
    echo "Need either the gh CLI or a real GITHUB_TOKEN in .env.local."
    echo "Run 'bash demo/setup.sh' to set the token, or use 'make ci' to run locally."
    exit 1
  fi
  SLUG=$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')

  payload=$(jq -n --arg t "$TITLE" --arg b "$BODY" --arg h "$BRANCH" --arg base "$BASE" \
    '{title: $t, body: $b, head: $h, base: $base}')
  response=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -d "$payload" \
    "https://api.github.com/repos/${SLUG}/pulls")

  URL=$(printf '%s' "$response" | jq -r '.html_url // empty')
  if [[ -z "$URL" ]]; then
    echo "Could not open the PR:"
    printf '%s\n' "$response" | jq -r '.message // .errors[0].message // .' 2>/dev/null || printf '%s\n' "$response"
    exit 1
  fi
fi

echo ""
echo "PR open: ${URL:-check GitHub}"
echo ""
echo "What happens next on GitHub:"
echo "  1. The 'pull_request: opened' event fires .github/workflows/auto-factory.yml"
echo "  2. The action checks out the PR head and runs the six-agent chain"
echo "  3. It creates the flag + metrics in LaunchDarkly (tagged auto-factory)"
echo "  4. It commits flag wiring, metrics, tests, and the release manifest to the branch"
echo "  5. It posts a summary comment and a check run on the PR"
echo ""
echo "If AUTOFACTORY_REQUIRE_LABEL is 'true' in repo variables, add the"
echo "'autofactory' label to the PR to start the run."
