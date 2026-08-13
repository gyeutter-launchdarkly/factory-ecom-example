#!/usr/bin/env bash
# Close any open PRs from feature/* branches.
#
# Run via `make reset` (or `bash demo/setup.sh --reset`). Closing is a plain
# PATCH, so this needs only the PAT already in .env.local — no gh CLI.
#
# Branches are force-pushed back to their seed tags by reset-branches.sh. If a
# PR is left open, that push rewrites it in place and the factory may re-run on
# it, so closing first keeps runs from bleeding across demos.
set -euo pipefail

cd "$(dirname "$0")/.."

TOKEN=""
if [[ -f .env.local ]]; then
  TOKEN=$(grep "^GITHUB_TOKEN=" .env.local 2>/dev/null | cut -d= -f2- || true)
fi

if [[ -z "$TOKEN" || "$TOKEN" == "dummy-local-run" ]]; then
  echo "  no usable GITHUB_TOKEN in .env.local; skipping PR cleanup"
  exit 0
fi

SLUG=$(git remote get-url origin 2>/dev/null \
  | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##' || true)
if [[ -z "$SLUG" ]]; then
  echo "  no git remote; skipping PR cleanup"
  exit 0
fi

api() {
  curl -s -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" "$@"
}

open_prs=$(api "https://api.github.com/repos/${SLUG}/pulls?state=open&per_page=100" \
  | jq -r '.[] | select(.head.ref | startswith("feature/")) | "\(.number)\t\(.head.ref)"' 2>/dev/null || true)

if [[ -z "$open_prs" ]]; then
  echo "  no open feature/* PRs"
  exit 0
fi

# Issues are not created by the demo, and are disabled on the reference repo, so
# there is nothing to clean there.

while IFS=$'\t' read -r number ref; do
  [[ -z "$number" ]] && continue
  code=$(api -o /dev/null -w "%{http_code}" -X PATCH \
    -d '{"state":"closed"}' \
    "https://api.github.com/repos/${SLUG}/pulls/${number}")
  if [[ "$code" == "200" ]]; then
    echo "  closed PR #${number} (${ref})"
  else
    echo "  warning: could not close PR #${number} (HTTP ${code})"
  fi
done <<< "$open_prs"
