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

grep -E "^(LD_SDK_KEY|LD_API_KEY|ANTHROPIC_API_KEY)=" .env.local 2>/dev/null >> "$SECRETS_FILE" || true
# GITHUB_TOKEN: real token enables PR comments + check runs; dummy still runs the factory
GITHUB_TOKEN_LINE=$(grep "^GITHUB_TOKEN=" .env.local 2>/dev/null || echo "GITHUB_TOKEN=dummy-local-run")
echo "$GITHUB_TOKEN_LINE" >> "$SECRETS_FILE"

# Repository variable
LD_APP_PROJECT_KEY=$(grep "^LD_APP_PROJECT_KEY=" .env.local 2>/dev/null | cut -d= -f2- || echo "checkout-demo")

echo "=== Running factory locally (scenario: $SCENARIO) ==="
echo "    branch:  $BRANCH"
echo "    event:   $EVENT_FILE"
echo ""

docker compose run --rm ci \
  pull_request \
  --eventpath "$EVENT_FILE" \
  --secret-file "$SECRETS_FILE" \
  --var "LD_APP_PROJECT_KEY=$LD_APP_PROJECT_KEY" \
  -P "ubuntu-latest=ghcr.io/catthehacker/ubuntu:act-22.04" \
  -W .github/workflows/auto-factory.yml

echo ""
echo "=== Done. Check the branch for factory commits, and LD for new flags. ==="
