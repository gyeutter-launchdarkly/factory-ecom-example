#!/usr/bin/env bash
# Runs the demo actions the pane's buttons ask for.
#
# The app is a container with .autofactory mounted read-only and no repo, no gh
# and no LaunchDarkly key, so it cannot reset anything itself. It writes a
# request file into .autofactory/control/requests/ instead, and this watcher —
# on the host, where the scripts and credentials live — carries it out and
# writes the outcome back to .autofactory/control/status/.
#
# The browser therefore never supplies a command. It supplies an action name
# that must match a fixed list, and a scenario that must match a file in
# demo/ci/events. Anything else is refused, so a stray request cannot turn into
# arbitrary shell.
#
# Usage: bash demo/lib/control-watch.sh    (started by demo/menu.sh)
set -uo pipefail

cd "$(dirname "$0")/../.."

CONTROL_DIR="${FACTORY_CONTROL_DIR:-.autofactory/control}"
REQ_DIR="$CONTROL_DIR/requests"
STATUS_DIR="$CONTROL_DIR/status"
HEARTBEAT="$CONTROL_DIR/watcher.json"
LOG="$CONTROL_DIR/watcher.log"
LOCK="$CONTROL_DIR/.busy"
POLL_SECS="${FACTORY_CONTROL_POLL:-1}"
EVENTS_DIR="demo/ci/events"

mkdir -p "$REQ_DIR" "$STATUS_DIR"

# The pane greys its buttons out unless this file is fresh, so a demo without
# the menu running says "unavailable" rather than silently swallowing clicks.
beat() {
  printf '{"alive":true,"at":%s,"pid":%s,"busy":%s}\n' \
    "$(( $(date +%s) * 1000 ))" "$$" "$([[ -e $LOCK ]] && echo true || echo false)" \
    >"$HEARTBEAT"
}

write_status() {
  local id="$1" state="$2" message="$3" detail="${4:-}"
  # jq builds it: a failure detail is arbitrary script output, and pasting that
  # between quotes with printf produces JSON the pane cannot parse.
  jq -nc --arg id "$id" --arg state "$state" --arg message "$message" \
    --arg detail "$detail" --argjson at "$(( $(date +%s) * 1000 ))" \
    '{id:$id,state:$state,message:$message,detail:$detail,at:$at}' \
    >"$STATUS_DIR/$id.json.tmp" && mv "$STATUS_DIR/$id.json.tmp" "$STATUS_DIR/$id.json"
}

# Scenario list for the pane's dropdown: the container cannot read demo/, so it
# is published here and refreshed on every poll (titles rarely change, but a
# scenario added mid-demo should still show up).
publish_scenarios() {
  local out="$CONTROL_DIR/scenarios.json"
  jq -nc '[inputs | {key: (input_filename | split("/") | last | rtrimstr(".json")),
                     title: (.pull_request.title // "")}]' \
    "$EVENTS_DIR"/*.json >"$out.tmp" 2>/dev/null && mv "$out.tmp" "$out"
}

valid_scenario() { [[ -n "$1" && -f "$EVENTS_DIR/$1.json" ]]; }

run_action() {
  local id="$1" action="$2" scenario="$3" rc=0

  : >"$LOG"
  # stdin is closed on every action: this runs as a child of the menu, and a
  # script that decided to prompt would otherwise eat the keystroke meant for
  # the menu's own prompt.
  case "$action" in
    reset)
      write_status "$id" running "Resetting the demo…"
      make reset >>"$LOG" 2>&1 </dev/null || rc=$?
      ;;
    run)
      if ! valid_scenario "$scenario"; then
        write_status "$id" error "Unknown scenario"
        return
      fi
      write_status "$id" running "Starting the factory for ${scenario}…"
      # Progress reaches the pane through the same stream the terminal uses, so
      # the run is watchable from the browser even though it started there.
      FACTORY_PROGRESS_ONLY=1 make hosted SCENARIO="$scenario" >>"$LOG" 2>&1 </dev/null || rc=$?
      ;;
    replay)
      if ! valid_scenario "$scenario"; then
        write_status "$id" error "Unknown scenario"
        return
      fi
      write_status "$id" running "Rehearsing ${scenario}…"
      # Synthetic and deterministic: the same six steps, always approved, in
      # about twelve seconds. Nothing is created, so this is the one path that
      # cannot fail in front of an audience — and the one that proves nothing.
      FACTORY_PROGRESS_ONLY=1 ./demo/replay-progress.sh \
        "$scenario" "${FACTORY_REPLAY_SECS:-2}" "${FACTORY_REPLAY_PR:-7}" \
        >>"$LOG" 2>&1 </dev/null || rc=$?
      ;;
    clear-history)
      write_status "$id" running "Clearing the run history…"
      rm -f .autofactory/runs.ndjson >>"$LOG" 2>&1 </dev/null || rc=$?
      ;;
    *)
      write_status "$id" error "Unsupported action"
      return
      ;;
  esac

  # Colour codes render as literal noise in the browser, and something in the
  # chain always emits them however careful this end is.
  local tail_out
  tail_out=$(tail -n 20 "$LOG" 2>/dev/null | sed $'s/\033\\[[0-9;]*m//g')
  if (( rc == 0 )); then
    write_status "$id" done "Finished" "$tail_out"
  else
    write_status "$id" error "Failed (exit $rc)" "$tail_out"
  fi
}

# Two watchers would both see the same request, and both could act on it before
# either claimed it — a reset running twice at once is a mess of force-pushes.
if [[ -f "$HEARTBEAT" ]]; then
  other_pid=$(jq -r '.pid // 0' "$HEARTBEAT" 2>/dev/null)
  other_at=$(jq -r '(.at // 0) / 1000 | floor' "$HEARTBEAT" 2>/dev/null)
  if [[ "$other_pid" =~ ^[0-9]+$ ]] && (( other_pid > 0 )) \
    && (( $(date +%s) - ${other_at:-0} < 15 )) && kill -0 "$other_pid" 2>/dev/null; then
    echo "control-watch: already running (pid $other_pid)"
    exit 0
  fi
fi

echo "control-watch: watching $REQ_DIR (ctrl-c to stop)"
publish_scenarios
beat

while :; do
  beat
  publish_scenarios

  for req in "$REQ_DIR"/*.json; do
    [[ -e "$req" ]] || continue

    id=$(basename "$req" .json)
    action=$(jq -r '.action // ""' "$req" 2>/dev/null)
    scenario=$(jq -r '.scenario // ""' "$req" 2>/dev/null)
    asked_at=$(jq -r '(.at // 0) / 1000 | floor' "$req" 2>/dev/null)
    # Claim the request by deleting it: a crash mid-action must not leave
    # something that replays a reset on the next poll.
    rm -f "$req"

    # Ids name a status file, so keep them to characters that cannot escape the
    # directory or the printf above.
    [[ "$id" =~ ^[A-Za-z0-9_-]{1,64}$ ]] || continue

    # A request written while no watcher was listening is a click from an old
    # session. Running it now — a reset, hours later, as the next demo starts —
    # is the worst possible time for it.
    if [[ "$asked_at" =~ ^[0-9]+$ ]] && (( asked_at > 0 && $(date +%s) - asked_at > 120 )); then
      write_status "$id" error "Expired before anything was listening"
      continue
    fi

    if [[ -e "$LOCK" ]]; then
      write_status "$id" error "Another action is already running"
      continue
    fi

    : >"$LOCK"
    beat
    # A reset or a run blocks this loop for minutes, and a heartbeat that stops
    # for minutes reads as a dead watcher — the pane would grey its buttons out
    # and claim the menu is not running, mid-reset. So keep beating alongside.
    ( while [[ -e "$LOCK" ]]; do beat; sleep "$POLL_SECS"; done ) &
    beater=$!
    run_action "$id" "$action" "$scenario"
    rm -f "$LOCK"
    kill "$beater" 2>/dev/null
    wait "$beater" 2>/dev/null
    beat
  done

  sleep "$POLL_SECS"
done
