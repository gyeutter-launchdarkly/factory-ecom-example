#!/usr/bin/env bash
# One line per step, numbered, nothing else.
#
# The demo's own progress used to be paragraphs: a heading, a blank line, three
# indented URLs, another blank line. On a projector that scrolls the interesting
# part off the screen. Every step here is a single line that says where it is in
# the sequence, and a step that takes time rewrites its own line rather than
# printing a new one.
#
# Not a TTY (the UI's control watcher, CI, a pipe): no redraws, no escape codes,
# just the final line of each step.
#
# Usage:
#   ui_begin 5
#   ui_step  "pr" "#9 https://github.com/o/r/pull/9"
#   ui_start "run" "waiting for GitHub"; ui_tick "waiting 12s"; ui_done "1234 https://…"

UI_STEP_TOTAL=0
UI_STEP_N=0
UI_LABEL=""
UI_TEXT=""

ui_tty() { [ -t 1 ]; }

# Colour only for a terminal. The UI's control watcher captures this output and
# shows the tail in the browser, where a raw escape sequence is just noise.
if [ -t 1 ]; then
  UI_D=$'\033[2m'; UI_B=$'\033[1m'; UI_RD=$'\033[31m'; UI_R=$'\033[0m'
else
  UI_D=''; UI_B=''; UI_RD=''; UI_R=''
fi

ui_begin() {
  UI_STEP_TOTAL="$1"
  UI_STEP_N=0
}

ui__paint() {
  ui_tty || return 0
  printf '\r  %s%s/%s%s %-7s %s\033[K' \
    "$UI_D" "$UI_STEP_N" "$UI_STEP_TOTAL" "$UI_R" "$UI_LABEL" "$UI_TEXT"
}

# Begin a step that is going to take a while: claims the line without ending it.
ui_start() {
  UI_STEP_N=$(( UI_STEP_N + 1 ))
  UI_LABEL="$1"
  UI_TEXT="${2:-}"
  ui__paint
}

# Replace the in-progress text (elapsed time, what it is waiting on).
ui_tick() {
  UI_TEXT="$1"
  ui__paint
}

# Settle the current step on its final text.
ui_done() {
  UI_TEXT="${1:-$UI_TEXT}"
  ui_tty && printf '\r'
  printf '  %s%s/%s%s %-7s %s' "$UI_D" "$UI_STEP_N" "$UI_STEP_TOTAL" "$UI_R" "$UI_LABEL" "$UI_TEXT"
  ui_tty && printf '\033[K'
  printf '\n'
}

# A step with nothing to wait for.
ui_step() {
  ui_start "$1" "$2"
  ui_done
}

# Something went wrong, on the step's own line.
ui_fail() {
  UI_TEXT="$1"
  ui_tty && printf '\r'
  printf '  %s%s/%s%s %-7s %s%s%s' \
    "$UI_D" "$UI_STEP_N" "$UI_STEP_TOTAL" "$UI_R" "$UI_LABEL" "$UI_RD" "$UI_TEXT" "$UI_R"
  ui_tty && printf '\033[K'
  printf '\n'
}

# Detail under a step, for the rare line that cannot be folded into it.
ui_note() { printf '          %s%s%s\n' "$UI_D" "$1" "$UI_R"; }

ui_elapsed() {
  local secs=$(( $(date +%s) - $1 ))
  (( secs < 60 )) && { printf '%ds' "$secs"; return; }
  printf '%dm%02ds' "$(( secs / 60 ))" "$(( secs % 60 ))"
}

# Run a command behind a one-line timer. Its output is hidden while it succeeds
# and printed when it does not: a silent failure is worse than a noisy one.
ui_run() {
  local label="$1" working="$2" ok="$3"
  shift 3
  local log start pid rc
  log=$(mktemp "${TMPDIR:-/tmp}/factory-step.XXXXXX")
  start=$(date +%s)
  ui_start "$label" "$working"
  "$@" >"$log" 2>&1 &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    ui_tick "$working  $(ui_elapsed "$start")"
    sleep 1
  done
  wait "$pid"
  rc=$?
  if (( rc == 0 )); then
    ui_done "$ok  $(ui_elapsed "$start")"
  else
    ui_fail "failed after $(ui_elapsed "$start")"
    tail -n 15 "$log" | sed 's/^/          /'
  fi
  rm -f "$log"
  return "$rc"
}
