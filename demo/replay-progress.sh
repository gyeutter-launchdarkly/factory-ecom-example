#!/usr/bin/env bash
# A complete, explicitly simulated journey. No external resources are mutated.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node demo/lib/rehearse-journey.mjs "${1:-express-checkout}" "${2:-2}"
