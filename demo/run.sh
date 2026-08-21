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
# shellcheck source=lib/pack.sh
source demo/lib/pack.sh

list_scenarios() {
  echo "Available scenarios:"
  local scenario file
  while IFS= read -r scenario; do
    file=$(pack_event_file "$scenario")
    printf '  %-18s %s\n' "$scenario" "$(jq -r '.pull_request.title' "$file")"
  done < <(pack_scenarios)
}

if [[ -z "$SCENARIO" ]]; then
  echo "Usage: make run SCENARIO=<scenario>"
  list_scenarios
  exit 1
fi

EVENT_FILE=$(pack_event_file "$SCENARIO" 2>/dev/null || true)
if [[ -z "$EVENT_FILE" ]]; then
  echo "Unknown scenario: $SCENARIO"
  list_scenarios
  exit 1
fi

pack_assert_repo_policy || exit 1

# shellcheck source=lib/gate.sh
source demo/lib/gate.sh
# shellcheck source=lib/retry.sh
source demo/lib/retry.sh

# Opening a PR here means the hosted workflow should run, so make sure it is not
# gated. Skipped when run-pr.sh is driving: it wants the hosted run gated so only
# its local act run proceeds.
if [[ -z "${FACTORY_GATE_MANAGED:-}" ]]; then
  gate_set false
fi

BRANCH=$(jq -r '.pull_request.head.ref // empty' "$EVENT_FILE")

# Existence, "already merged", and "behind main" all produce a PR that misleads
# rather than one that fails, so they are checked before anything is pushed.
# A no-op when run-hosted.sh already did it.
# shellcheck source=lib/branch.sh
source demo/lib/branch.sh
ensure_branch_ready "$SCENARIO" || exit 1

TITLE=$(jq -r '.pull_request.title' "$EVENT_FILE")
BODY=$(jq -r '.pull_request.body' "$EVENT_FILE")
BASE=$(jq -r '.pull_request.base.ref // "main"' "$EVENT_FILE")

# Push the branch so GitHub can see it. A rewind by `make reset`, or a rebase by
# ensure_branch_ready, needs the force; --force-with-lease so a push that would
# clobber commits we have not seen still fails.
git push -u origin "$BRANCH" 2>/dev/null \
  || git push -u origin "$BRANCH" --force-with-lease \
  || { echo "Could not push $BRANCH. Fetch and retry, or 'make reset' to rewind it."; exit 1; }

echo "Opening PR: $TITLE"

if command -v gh &>/dev/null; then
  # Only an OPEN PR can be reused, and the state filter is the whole point:
  # `gh pr view <branch>` answers with the branch's most recent PR whatever its
  # state, and every reset closes one. Reusing a closed PR made this script
  # report success while the hosted path then found nothing open to run against.
  open_pr_url() {
    gh pr list --head "$BRANCH" --state open --json url --jq '.[0].url // empty' 2>/dev/null || true
  }

  URL=$(open_pr_url)
  if [[ -z "$URL" ]]; then
    # Retried: a GitHub 5xx on create is transient and used to abort the run.
    if ! gh_retry gh pr create --head "$BRANCH" --base "$BASE" --title "$TITLE" --body "$BODY"; then
      echo ""
      echo "Could not open the PR (GitHub's error is above)."
      echo "If it mentions a 5xx / 'no server available', that is transient — re-run in a moment."
      exit 1
    fi
    # The list endpoint can lag a moment behind the create.
    for _ in 1 2 3 4 5; do
      URL=$(open_pr_url)
      [[ -n "$URL" ]] && break
      sleep 2
    done
  fi
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

  # A few attempts, so a transient 5xx does not read as a real failure.
  URL="" ; response=""
  for attempt in 1 2 3 4; do
    response=$(curl -s -X POST \
      -H "Authorization: Bearer $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      -d "$payload" \
      "https://api.github.com/repos/${SLUG}/pulls")
    URL=$(printf '%s' "$response" | jq -r '.html_url // empty')
    [[ -n "$URL" ]] && break
    # "already exists" is not a failure: fetch the existing PR's URL and stop.
    if grep -qi "already exist" <<<"$response"; then
      URL=$(curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${SLUG}/pulls?head=${SLUG%%/*}:${BRANCH}&state=open" \
        | jq -r '.[0].html_url // empty')
      break
    fi
    is_transient "$response" && (( attempt < 4 )) || break
    echo "  GitHub returned a transient error (attempt $attempt/4); retrying…"
    sleep $(( attempt * attempt ))
  done

  if [[ -z "$URL" ]]; then
    echo "Could not open the PR:"
    printf '%s\n' "$response" | jq -r '.message // .errors[0].message // .' 2>/dev/null || printf '%s\n' "$response"
    exit 1
  fi
fi

echo ""
echo "PR open: ${URL:-check GitHub}"

# Useful context at the shell; noise inside the presentation-oriented menu.
if [[ "${FACTORY_PROGRESS_ONLY:-}" != "1" ]]; then
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
fi
