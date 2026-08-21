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
# that must match a fixed list, and a scenario that must match an event in the
# active demo pack. Anything else is refused, so a stray request cannot turn
# into arbitrary shell.
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
# shellcheck source=pack.sh
source demo/lib/pack.sh

RUNNER="hosted"
PR_STRATEGY="new"
REPLAY_SECS="2"

load_runtime_settings() {
  RUNNER="hosted"; PR_STRATEGY="new"; REPLAY_SECS="2"; DEMO_PACK="default"
  if [[ -f .autofactory/demo-settings ]]; then
    while IFS='=' read -r key value; do
      case "$key" in
        RUNNER | PR_STRATEGY | REPLAY_SECS | DEMO_PACK) printf -v "$key" '%s' "$value" ;;
      esac
    done < .autofactory/demo-settings
  fi
  pack_is_valid "$DEMO_PACK" || DEMO_PACK="default"
}

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
  load_runtime_settings
  local out="$CONTROL_DIR/scenarios.json" scenario file
  : >"$out.ndjson"
  while IFS= read -r scenario; do
    file=$(pack_event_file "$scenario") || continue
    recorded=false
    [[ -f "$(pack_recordings_dir)/$scenario.ndjson" ]] && recorded=true
    jq -c --arg key "$scenario" --argjson recorded "$recorded" \
      '{
        key:$key,
        title:(.pull_request.title // $key),
        recorded:$recorded,
        story:{
          problem:(.demo.problem // .pull_request.body // "A customer request needs a safe release path."),
          goal:(.demo.goal // "Turn the request into guarded code, metrics, tests, and a release plan."),
          payoff:(.demo.payoff // "The team can release with evidence and roll back immediately.")
        }
      }' "$file" >>"$out.ndjson"
  done < <(pack_scenarios)
  jq -sc '.' "$out.ndjson" >"$out.tmp" && mv "$out.tmp" "$out"
  rm -f "$out.ndjson"
  jq -nc --arg mode "$RUNNER" --arg strategy "$PR_STRATEGY" --arg pack "$DEMO_PACK" \
    --arg packName "$(pack_name)" --arg visibility "$(pack_visibility)" \
    '{mode:$mode,strategy:$strategy,pack:$pack,packName:$packName,visibility:$visibility}' \
    >"$CONTROL_DIR/runtime.json.tmp" \
    && mv "$CONTROL_DIR/runtime.json.tmp" "$CONTROL_DIR/runtime.json"

  : >"$CONTROL_DIR/packs.ndjson"
  local id previous="$DEMO_PACK"
  while IFS= read -r id; do
    pack_is_valid "$id" || continue
    DEMO_PACK="$id"
    jq -nc --arg id "$id" --arg name "$(pack_name)" --arg visibility "$(pack_visibility)" \
      '{id:$id,name:$name,visibility:$visibility}' >>"$CONTROL_DIR/packs.ndjson"
  done < <(pack_ids)
  DEMO_PACK="$previous"
  jq -sc '.' "$CONTROL_DIR/packs.ndjson" >"$CONTROL_DIR/packs.json.tmp" \
    && mv "$CONTROL_DIR/packs.json.tmp" "$CONTROL_DIR/packs.json"
  rm -f "$CONTROL_DIR/packs.ndjson"
}

valid_scenario() { [[ -n "$1" ]] && pack_event_file "$1" >/dev/null 2>&1; }

set_setting() {
  local key="$1" value="$2" file=".autofactory/demo-settings" tmp
  mkdir -p .autofactory
  tmp="$file.tmp"
  awk -F= -v key="$key" -v value="$value" '
    BEGIN { found=0 }
    $1 == key { print key "=" value; found=1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$file" 2>/dev/null >"$tmp" || printf '%s=%s\n' "$key" "$value" >"$tmp"
  mv "$tmp" "$file"
}

configure_runtime() {
  local mode="$1" strategy="$2" pack="$3"
  [[ "$mode" =~ ^(hosted|local|recorded|rehearsal)$ ]] || return 1
  [[ "$strategy" =~ ^(new|attach)$ ]] || return 1
  local previous="$DEMO_PACK"
  DEMO_PACK="$pack"
  pack_is_valid "$pack" || { DEMO_PACK="$previous"; return 1; }
  set_setting RUNNER "$mode"
  set_setting PR_STRATEGY "$strategy"
  set_setting DEMO_PACK "$pack"
  publish_scenarios
}

run_action() {
  local id="$1" action="$2" scenario="$3" mode="${4:-}" strategy="${5:-}" pack="${6:-}" rc=0

  : >"$LOG"
  load_runtime_settings
  # stdin is closed on every action: this runs as a child of the menu, and a
  # script that decided to prompt would otherwise eat the keystroke meant for
  # the menu's own prompt.
  case "$action" in
    configure)
      write_status "$id" running "Updating demo settings…"
      if configure_runtime "$mode" "$strategy" "$pack"; then
        write_status "$id" done "Settings updated"
      else
        write_status "$id" error "Invalid demo settings"
      fi
      return
      ;;
    reset)
      write_status "$id" running "Resetting the demo…"
      make reset >>"$LOG" 2>&1 </dev/null || rc=$?
      ;;
    run)
      if ! valid_scenario "$scenario"; then
        write_status "$id" error "Unknown scenario"
        return
      fi
      write_status "$id" running "Starting ${RUNNER} mode for ${scenario}…"
      case "$RUNNER" in
        hosted)
          FACTORY_ATTACH="$([[ "$PR_STRATEGY" == "attach" ]] && echo 1 || echo 0)" \
            FACTORY_PROGRESS_ONLY=1 make hosted SCENARIO="$scenario" \
            >>"$LOG" 2>&1 </dev/null || rc=$?
          ;;
        local)
          FACTORY_PROGRESS_ONLY=1 ./demo/ci/run-local.sh "$scenario" \
            >>"$LOG" 2>&1 </dev/null || rc=$?
          ;;
        recorded)
          ./demo/replay-recording.sh "$scenario" >>"$LOG" 2>&1 </dev/null || rc=$?
          ;;
        rehearsal)
          FACTORY_PROGRESS_ONLY=1 ./demo/replay-progress.sh \
            "$scenario" "$REPLAY_SECS" 0 >>"$LOG" 2>&1 </dev/null || rc=$?
          ;;
        *) write_status "$id" error "Unsupported execution mode"; return ;;
      esac
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
    mode=$(jq -r '.mode // ""' "$req" 2>/dev/null)
    strategy=$(jq -r '.strategy // ""' "$req" 2>/dev/null)
    pack=$(jq -r '.pack // ""' "$req" 2>/dev/null)
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
    run_action "$id" "$action" "$scenario" "$mode" "$strategy" "$pack"
    rm -f "$LOCK"
    kill "$beater" 2>/dev/null
    wait "$beater" 2>/dev/null
    beat
  done

  sleep "$POLL_SECS"
done
