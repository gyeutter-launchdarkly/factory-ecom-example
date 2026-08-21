#!/usr/bin/env bash
# Save the newest completed run for a scenario into the active pack.
set -euo pipefail
cd "$(dirname "$0")/.."

SCENARIO="${1:-}"
[[ "$SCENARIO" =~ ^[a-z0-9-]{1,64}$ ]] || {
  echo "usage: demo/capture-recording.sh <scenario>"
  exit 2
}

# shellcheck source=lib/pack.sh
source demo/lib/pack.sh
source_file=".autofactory/runs.ndjson"
[[ -f "$source_file" ]] || { echo "No run history to capture."; exit 1; }

run=$(jq -rs --arg scenario "$SCENARIO" \
  '[.[] | select(.scenario == $scenario)] | sort_by(.at) | last | .run // empty' \
  "$source_file")
[[ -n "$run" ]] || { echo "No run found for '$SCENARIO'."; exit 1; }

dir=$(pack_recordings_dir)
mkdir -p "$dir"
jq -c --arg run "$run" 'select(.run == $run)' "$source_file" >"$dir/$SCENARIO.ndjson"
echo "captured $run -> $dir/$SCENARIO.ndjson"
