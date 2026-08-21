#!/usr/bin/env bash
# Replay a captured real run at accelerated speed.
set -euo pipefail
cd "$(dirname "$0")/.."

SCENARIO="${1:-}"
SPEED="${2:-${FACTORY_RECORDING_SPEED:-8}}"
[[ "$SCENARIO" =~ ^[a-z0-9-]{1,64}$ ]] || {
  echo "usage: demo/replay-recording.sh <scenario> [speed]"
  exit 2
}

# shellcheck source=lib/pack.sh
source demo/lib/pack.sh
recording="$(pack_recordings_dir)/$SCENARIO.ndjson"
[[ -f "$recording" ]] || {
  echo "No recorded run for '$SCENARIO' in pack '$DEMO_PACK'."
  echo "Expected: $recording"
  exit 2
}

echo "  recorded  $SCENARIO · ${SPEED}x · no agents running"
node demo/lib/replay-recording.mjs "$recording" "$SCENARIO" "$SPEED"
echo "  recorded  complete"
