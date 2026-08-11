#!/usr/bin/env bash
# Recreate feature/* branches from their seed tags.
# Run via `make reset` — do not run directly while the app has open PRs.
set -euo pipefail

SCENARIOS=(product-ratings discount-codes dynamic-pricing)

for scenario in "${SCENARIOS[@]}"; do
  branch="feature/${scenario}"
  tag="demo-seed/${scenario}"

  if ! git rev-parse "$tag" &>/dev/null; then
    echo "  warning: tag $tag not found — skipping $branch (run 'make _tag-seeds' once)"
    continue
  fi

  git push origin --delete "$branch" 2>/dev/null || true
  git branch -f "$branch" "$tag"
  git push -u origin "$branch" --force-with-lease 2>/dev/null || git push -u origin "$branch"
  echo "  reset: $branch -> $(git rev-parse --short $tag)"
done
