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

# Write a secrets file for act from .env.local values (keep off disk after run)
SECRETS_FILE=$(mktemp /tmp/act-secrets.XXXXXX)
trap "rm -f $SECRETS_FILE" EXIT

# The workflow's LD_SDK_KEY is the FACTORY project's key — it resolves the agent
# AI configs. The app project's key (also called LD_SDK_KEY, in .env.local, used
# by the app container) would make the factory fail to find its agent graph, so
# map the factory key onto the secret name the workflow reads.
FACTORY_SDK_KEY=$(grep "^LD_FACTORY_SDK_KEY=" .env.local 2>/dev/null | cut -d= -f2- || true)
if [[ -z "$FACTORY_SDK_KEY" || "$FACTORY_SDK_KEY" == "placeholder" ]]; then
  echo "LD_FACTORY_SDK_KEY is not set in .env.local."
  echo "The factory needs the FACTORY project's SDK key to read its agent AI configs."
  echo "Re-run 'bash demo/setup.sh' to add it."
  exit 1
fi
echo "LD_SDK_KEY=$FACTORY_SDK_KEY" >> "$SECRETS_FILE"

grep -E "^(LD_API_KEY|ANTHROPIC_API_KEY)=" .env.local 2>/dev/null >> "$SECRETS_FILE" || true
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
