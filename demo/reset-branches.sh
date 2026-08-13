#!/usr/bin/env bash
# Recreate feature/* branches from their seed tags.
# Run via `make reset` — do not run directly while the app has open PRs.
set -euo pipefail

# Keep in sync with the scenario list in the Makefile (`help`, `_tag-seeds`).
SCENARIOS=(
  product-ratings discount-codes dynamic-pricing
  tiered-pricing express-checkout stripe-checkout
)

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
