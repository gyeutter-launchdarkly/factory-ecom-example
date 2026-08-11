#!/usr/bin/env bash
# Open a GitHub PR for a named demo scenario.
# Usage: ./demo/run.sh <scenario>
#   or:  make run SCENARIO=<scenario>
set -euo pipefail

SCENARIO="${1:-}"

if [[ -z "$SCENARIO" ]]; then
  echo "Usage: make run SCENARIO=<scenario>"
  echo "Available scenarios: product-ratings  discount-codes  dynamic-pricing"
  exit 1
fi

BRANCH="feature/${SCENARIO}"

if ! git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Error: branch $BRANCH not found locally."
  echo "Run 'make reset' to recreate it from the seed tag."
  exit 1
fi

# Push the branch so GitHub can see it
git push -u origin "$BRANCH" 2>/dev/null || true

case "$SCENARIO" in
  product-ratings)
    TITLE="feat: add per-product star ratings"
    BODY="Adds a numeric rating field to each product and displays a star breakdown on product cards."
    ;;
  discount-codes)
    TITLE="feat: add discount code support to checkout"
    BODY="Adds a discount code input to the checkout form. Codes are validated server-side before the order total is calculated."
    ;;
  dynamic-pricing)
    TITLE="feat: implement demand-based dynamic pricing"
    BODY="Adjusts product unit prices based on current inventory levels — lower inventory yields a higher demand multiplier, increasing the displayed price to manage supply."
    ;;
  *)
    echo "Unknown scenario: $SCENARIO"
    echo "Available: product-ratings  discount-codes  dynamic-pricing"
    exit 1
    ;;
esac

echo "Opening PR: $TITLE"
gh pr create \
  --head "$BRANCH" \
  --base main \
  --title "$TITLE" \
  --body "$BODY"

echo ""
echo "PR open. The AutoFactory action will run automatically."
echo "Watch it at: $(gh pr view --head "$BRANCH" --json url -q .url 2>/dev/null || echo 'check GitHub Actions')"
