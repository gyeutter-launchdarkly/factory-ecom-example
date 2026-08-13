#!/usr/bin/env bash
# Run the AutoFactory workflow locally via act (no GitHub queue, no cold start).
# Usage: ./demo/ci/run.sh <scenario>
#   or:  make ci SCENARIO=<scenario>
set -euo pipefail

SCENARIO="${1:-dynamic-pricing}"
BRANCH="feature/${SCENARIO}"
EVENT_FILE="demo/ci/events/${SCENARIO}.json"

if [[ ! -f "$EVENT_FILE" ]]; then
  echo "No event file for scenario: $SCENARIO"
  echo "Available: product-ratings  discount-codes  dynamic-pricing"
  echo "           tiered-pricing   express-checkout  stripe-checkout"
  exit 1
fi

# Checkout the feature branch so the workspace has the right code
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  echo "Switching to $BRANCH"
  git stash --include-untracked 2>/dev/null || true
  git checkout "$BRANCH"
fi

# Write a secrets file for act from .env.local values (removed on exit).
# It must live in the workspace: act runs inside the ci container, which mounts
# only this repo at /workspace, so a host /tmp path is invisible to it.
ACT_TMP=".autofactory/tmp"
mkdir -p "$ACT_TMP"
SECRETS_FILE=$(mktemp "$ACT_TMP/secrets.XXXXXX")
chmod 600 "$SECRETS_FILE"
trap 'rm -f "$SECRETS_FILE"' EXIT

# One project serves both the app and the factory, so a single SDK key covers
# flag evaluation and the factory's AI config lookups.
grep -E "^(LD_SDK_KEY|LD_API_KEY|ANTHROPIC_API_KEY)=" .env.local 2>/dev/null >> "$SECRETS_FILE" || true
# GITHUB_TOKEN: real token enables PR comments + check runs; dummy still runs the factory
GITHUB_TOKEN_LINE=$(grep "^GITHUB_TOKEN=" .env.local 2>/dev/null || echo "GITHUB_TOKEN=dummy-local-run")
echo "$GITHUB_TOKEN_LINE" >> "$SECRETS_FILE"

# Repository variable
LD_APP_PROJECT_KEY=$(grep "^LD_APP_PROJECT_KEY=" .env.local 2>/dev/null | cut -d= -f2- || echo "checkout-demo")

# Repo slug so the progress pane can deep-link the PR. Prefer the event payload,
# fall back to the git remote.
FACTORY_REPO=$(jq -r '.repository.full_name // empty' "$EVENT_FILE" 2>/dev/null || true)
if [[ -z "$FACTORY_REPO" ]]; then
  FACTORY_REPO=$(git remote get-url origin 2>/dev/null \
    | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##' || true)
fi
export FACTORY_REPO

echo "=== Running factory locally (scenario: $SCENARIO) ==="
echo "    branch:  $BRANCH"
echo "    event:   $EVENT_FILE"
echo ""

# Piped through the progress tap so the in-app flowchart can follow along.
# The tap echoes everything through unchanged; PIPESTATUS preserves act's exit
# code, which the pipe would otherwise mask.
set +e
docker compose run --rm ci \
  pull_request \
  --eventpath "$EVENT_FILE" \
  --secret-file "$SECRETS_FILE" \
  --var "LD_APP_PROJECT_KEY=$LD_APP_PROJECT_KEY" \
  -P "ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-22.04" \
  -W .github/workflows/auto-factory.yml 2>&1 | node demo/lib/progress-tap.mjs "$SCENARIO"
ACT_STATUS=${PIPESTATUS[0]}
set -e

echo ""
echo "=== Done. Check the branch for factory commits, and LD for new flags. ==="
exit "$ACT_STATUS"
