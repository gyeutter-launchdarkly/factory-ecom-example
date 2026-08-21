#!/usr/bin/env bash
# Demo control menu. Stay here for the whole demo: pick a scenario, run the
# factory locally or as a real PR, open the app, reset between runs.
#
# Usage: bash demo/menu.sh   (or `make menu`, or automatically after setup.sh)
set -uo pipefail

cd "$(dirname "$0")/.."

# Run the whole menu inside tmux and serve it to the browser, so the pane can
# show the real terminal under the flowchart. No-op without tmux + ttyd, and
# this must happen before any output: tty_wrap replaces the process.
# shellcheck source=lib/ui.sh
source demo/lib/ui.sh
# shellcheck source=lib/tty.sh
source demo/lib/tty.sh
tty_wrap "$0" "$@"
trap 'control_stop; tty_stop' EXIT

# The pane's buttons post an action and wait for somebody on the host to carry
# it out; that somebody is this. It lives and dies with the menu, so a page left
# open after the demo greys its buttons out instead of queueing work nobody will
# run.
control_start() {
  [[ "${FACTORY_CONTROL:-1}" != "0" ]] || return 0
  command -v jq &>/dev/null || return 0
  bash demo/lib/control-watch.sh >/dev/null 2>&1 &
  CONTROL_PID=$!
}

control_stop() {
  [[ -n "${CONTROL_PID:-}" ]] && kill "$CONTROL_PID" 2>/dev/null
  rm -f .autofactory/control/watcher.json .autofactory/control/.busy 2>/dev/null
  return 0
}

B='\033[1m'; D='\033[2m'; R='\033[0m'
BL='\033[34m'; WH='\033[97m'; GR='\033[32m'; YE='\033[33m'; RD='\033[31m'

EVENTS_DIR="demo/ci/events"

# The LaunchDarkly mark as a dot matrix, sampled from the official 96x96
# icon (launchdarkly.com/icon.png) at terminal aspect ratio.
ld_banner() {
  echo ""
  echo -e "  ${WH}             ··            ${R}"
  echo -e "  ${WH}              ···          ${R}"
  echo -e "  ${WH}        ··     ····        ${R}"
  echo -e "  ${WH}        ······   ····      ${R}"
  echo -e "  ${WH}            ···········    ${R}"
  echo -e "  ${WH}              ···········  ${R}"
  echo -e "  ${WH}·························· ${R}${B}LaunchDarkly AutoFactory${R}"
  echo -e "  ${WH}            ·············  ${R}${B}Demo TUI${R}"
  echo -e "  ${WH}            ···········    ${R}"
  echo -e "  ${WH}         ······  ····      ${R}"
  echo -e "  ${WH}        ··     ····        ${R}"
  echo -e "  ${WH}              ···          ${R}"
  echo -e "  ${WH}             ··            ${R}"
  echo ""
}


scenarios() {
  local s
  for f in "$EVENTS_DIR"/*.json; do
    s=$(basename "$f" .json)
    case "${DEMO_PROFILE:-commerce}:$s" in
      cat:cat-*)
        echo "$s"
        ;;
      commerce:cat-*) ;;
      commerce:*) echo "$s" ;;
    esac
  done | sort
}

# "3m" / "2h" for a marker file, so a stale GitHub-outage warning is obviously
# stale rather than looking like a fresh verdict. stat's flags differ by platform.
file_age_human() {
  local mtime now secs
  mtime=$(stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0)
  now=$(date +%s)
  secs=$(( now - mtime ))
  (( secs < 60 ))   && { echo "${secs}s"; return; }
  (( secs < 3600 )) && { echo "$(( secs / 60 ))m"; return; }
  echo "$(( secs / 3600 ))h"
}

# Branch freshness (is_current, is_spent, needs_attention, autosync) is shared
# with the direct paths, which need the same guarantees when they open a PR.
# shellcheck source=lib/branch.sh
source demo/lib/branch.sh

# Rebuild only when it is actually needed. The app is a production `next build`
# baked into the image, so app source changes require a rebuild (~2 min) and
# nothing else does: the factory progress stream reaches the pane through a bind
# mount, so runs, replays and resets never need one.
#
# Freshness is tracked with a marker file rather than the image's timestamp:
# Docker reports UTC and `date -j` on macOS parses it as local time, which put
# "built" hours in the future and broke the comparison.
BUILD_INPUTS=(src public package.json package-lock.json next.config.mjs tailwind.config.ts postcss.config.mjs tsconfig.json Dockerfile)
BUILD_MARKER=".autofactory/.image-built"

app_needs_rebuild() {
  [[ -f "$BUILD_MARKER" ]] || return 0
  local newer
  newer=$(find "${BUILD_INPUTS[@]}" -type f -newer "$BUILD_MARKER" -print -quit 2>/dev/null)
  [[ -n "$newer" ]]
}

mark_built() {
  mkdir -p "$(dirname "$BUILD_MARKER")"
  : > "$BUILD_MARKER"
}

start_app() {
  local rebuilt=0
  ui_begin 2

  if app_needs_rebuild; then
    ui_run "build" "app code changed; rebuilding" "image rebuilt" \
      docker compose --progress quiet build || return 1
    mark_built
    rebuilt=1
  else
    ui_step "build" "image current"
  fi

  # A rebuild has to recreate the container, so a running app is not "already
  # running" — it is the old image still serving.
  if (( ! rebuilt )) && curl -sf -o /dev/null --max-time 2 http://localhost:3000/ 2>/dev/null; then
    ui_step "start" "already running  http://localhost:3000"
  else
    ui_run "start" "starting the container" "http://localhost:3000" \
      docker compose --progress quiet up -d
  fi
}

app_state() {
  if curl -sf -o /dev/null --max-time 2 http://localhost:3000/ 2>/dev/null; then
    echo "running"
  else
    echo "stopped"
  fi
}

# shellcheck source=lib/gate.sh
source demo/lib/gate.sh

SETTINGS_FILE=".autofactory/demo-settings"

# Defaults. RUNNER decides what "run the factory" does:
#   hosted   real PR, chain on GitHub Actions, progress streamed into the pane.
#            The only mode that actually runs the agents, so it is the default.
#   act      canned event, dummy token, nothing touches GitHub. Currently a
#            no-op: the action bundle exits in ~190ms under act.
#   act+pr   real PR with act running the chain. Same no-op problem.
RUNNER="hosted"
REPLAY_SECS="2"
AUTO_OPEN="on"
DEMO_PROFILE="commerce"

load_settings() {
  [[ -f "$SETTINGS_FILE" ]] || return 0
  while IFS='=' read -r k v; do
    [[ "$k" =~ ^[[:space:]]*# || -z "${k// }" ]] && continue
    case "$k" in
      RUNNER | REPLAY_SECS | AUTO_OPEN | DEMO_PROFILE) printf -v "$k" '%s' "$v" ;;
    esac
  done < "$SETTINGS_FILE"
}

save_settings() {
  mkdir -p "$(dirname "$SETTINGS_FILE")"
  cat > "$SETTINGS_FILE" <<EOF
RUNNER=$RUNNER
REPLAY_SECS=$REPLAY_SECS
AUTO_OPEN=$AUTO_OPEN
DEMO_PROFILE=$DEMO_PROFILE
EOF
}

profile_label() {
  case "$DEMO_PROFILE" in
    cat) echo "CAT Parts Store" ;;
    *) echo "DarkCommerce" ;;
  esac
}

choose_profile() {
  echo ""
  echo -e "  ${B}Choose storefront${R}"
  echo "    1) CAT Parts Store"
  echo "    2) DarkCommerce"
  echo ""
  local p=""
  read -r -p "  > " p </dev/tty 2>/dev/null || return 1
  case "$p" in
    1) DEMO_PROFILE="cat" ;;
    2) DEMO_PROFILE="commerce" ;;
    *) return 1 ;;
  esac
  save_settings
}

# The hosted workflow must be gated when we run the chain locally, and ungated
# when GitHub is meant to run it. Applied whenever the runner changes, and again
# at startup: the saved runner and the repo variable drift apart otherwise (a
# hosted run leaves the gate on, and a later `actions` run then does nothing).
sync_gate() {
  local quiet="${1:-}"
  case "$RUNNER" in
    hosted)  gate_set true "$quiet" ;;   # the label is how the run is triggered
    act+pr)  gate_set true "$quiet" ;;
    actions) gate_set false "$quiet" ;;
    act) ;;  # no PR is opened, so the gate is irrelevant
  esac
}

runner_label() {
  case "$RUNNER" in
    hosted)  echo "real PR + Actions, live in the pane" ;;
    act)     echo "act only (does not run the agents)" ;;
    act+pr)  echo "real PR + act (does not run the agents)" ;;
    actions) echo "real PR + Actions (no live pane)" ;;
    *)       echo "$RUNNER" ;;
  esac
}

# Dispatch a scenario through whichever runner is selected.
run_scenario() {
  # The menu is the presentation surface: show the live progress bar, errors,
  # links and final result, not the parser's raw protocol. Running `make hosted`
  # directly remains verbose for troubleshooting.
  case "$RUNNER" in
    hosted)  FACTORY_PROGRESS_ONLY=1 make hosted SCENARIO="$1" ;;
    act)     FACTORY_PROGRESS_ONLY=1 make ci SCENARIO="$1" ;;
    act+pr)  FACTORY_PROGRESS_ONLY=1 make pr SCENARIO="$1" ;;
    actions) FACTORY_PROGRESS_ONLY=1 make run SCENARIO="$1" ;;
    *)       echo "  unknown RUNNER '$RUNNER'; fix it in Settings"; return 1 ;;
  esac
}

settings_screen() {
  while true; do
    clear
    echo -e "${B}"
    echo "  +--------------------------------------------------+"
    echo "  |        Settings                                  |"
    echo "  +--------------------------------------------------+"
    echo -e "${R}"
    local gate
    gate=$(gate_get)
    echo -e "    1) Factory runner       ${GR}$(runner_label)${R}"
    echo -e "       ${D}hosted GitHub run: $([[ "$gate" == "true" ]] && echo "gated" || echo "enabled")${R}"
    echo -e "    2) Replay speed         ${GR}${REPLAY_SECS}s per step${R}"
    echo -e "    3) Open browser on start ${GR}${AUTO_OPEN}${R}"
    echo -e "    4) Storefront            ${GR}$(profile_label)${R}"
    echo ""
    echo "    0) back"
    echo ""
    local c=""
    read -r -p "  > " c </dev/tty 2>/dev/null || return 0
    case "$c" in
      1)
        echo ""
        echo "    1) hosted   real PR + Actions, streamed into the pane"
        echo "    2) actions  real PR + Actions, no live pane"
        echo ""
        echo -e "  ${D}The act runners are hidden: under act the factory action exits in"
        echo -e "  ~185ms without running any agents. See demo/ci/run.sh for the evidence.${R}"
        echo ""
        local r=""
        read -r -p "  > " r </dev/tty 2>/dev/null || continue
        case "$r" in
          1) RUNNER="hosted" ;;
          2) RUNNER="actions" ;;
        esac
        save_settings
        echo ""
        sync_gate
        read -r -p "  press enter " _ </dev/tty 2>/dev/null || true
        ;;
      2)
        local v=""
        read -r -p "  seconds per step [${REPLAY_SECS}]: " v </dev/tty 2>/dev/null || continue
        [[ "$v" =~ ^[0-9]+$ ]] && REPLAY_SECS="$v" && save_settings
        ;;
      3)
        [[ "$AUTO_OPEN" == "on" ]] && AUTO_OPEN="off" || AUTO_OPEN="on"
        save_settings
        ;;
      4)
        choose_profile || true
        ;;
      0 | "") return 0 ;;
    esac
  done
}

load_settings

# An older settings file may still name an act runner; those do not run the
# agents, so migrate silently to the working path.
case "$RUNNER" in
  act | act+pr) RUNNER="hosted"; save_settings ;;
esac

# Quietly, because the first thing the loop does is clear the screen.
sync_gate quiet

# Bring any stale scenario branches forward before the first render. The
# post-commit hook normally does this the moment main moves, so this is just the
# backstop for commits made outside this checkout (a pull, or a merged PR) —
# either way the list should never open on a screen full of "needs rebase".
./demo/sync-branches.sh --auto >/dev/null 2>&1 || true

pick_scenario() {
  # Prints the chosen scenario on stdout; everything else goes to stderr so the
  # caller can capture the value cleanly.
  local -a list=()
  while IFS= read -r s; do list+=("$s"); done < <(scenarios)

  echo "" >&2
  echo -e "  ${B}Pick a scenario${R}" >&2
  local i=1
  for s in "${list[@]}"; do
    local title mark
    title=$(jq -r '.pull_request.title' "$EVENTS_DIR/$s.json")
    if is_spent "$s"; then
      mark="${D}merged, nothing to demo${R}"
    elif needs_attention "$s"; then
      mark="${YE}needs rebase${R}"
    else
      mark="${GR}ready${R}"
    fi
    printf "    %d) %-18s %-46s %b\n" "$i" "$s" "${title:0:46}" "$mark" >&2
    i=$((i + 1))
  done
  echo -e "    0) back" >&2
  echo "" >&2

  local choice=""
  read -r -p "  > " choice </dev/tty 2>/dev/null || return 1
  [[ "$choice" == "0" || -z "$choice" ]] && return 1
  if ! [[ "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > ${#list[@]} )); then
    echo -e "  ${YE}!${R}  not a valid choice" >&2
    return 1
  fi

  local chosen="${list[$((choice - 1))]}"

  if is_spent "$chosen"; then
    echo "" >&2
    echo -e "  ${YE}!${R}  feature/$chosen is already merged into main." >&2
    echo -e "  ${D}Opening a PR would fail: there are no commits between them." >&2
    echo -e "  Revert the merge on main to demo it again, or pick another.${R}" >&2
    return 1
  fi

  if ! is_current "$chosen"; then
    if needs_attention "$chosen"; then
      echo "" >&2
      echo -e "  ${YE}!${R}  main has app changes feature/$chosen does not." >&2
      echo -e "  ${D}Running it as-is would revert them mid-demo.${R}" >&2
      local ans=""
      read -r -p "  Rebase it now? [Y/n] " ans </dev/tty 2>/dev/null || return 1
      [[ "${ans:-Y}" =~ ^[Nn]$ ]] && return 1
    fi
    # Either it only missed tooling commits, or you asked for the rebase.
    if ! autosync "$chosen"; then
      echo "" >&2
      echo -e "  ${YE}!${R}  rebase hit conflicts; resolve by hand:" >&2
      echo -e "  ${D}    git rebase main feature/$chosen${R}" >&2
      return 1
    fi
  fi

  printf '%s' "$chosen"
}

pause() {
  echo ""
  read -r -p "  press enter to return to the menu " _ </dev/tty 2>/dev/null || true
}

control_start

while true; do
  clear
  ld_banner

  state=$(app_state)
  if [[ "$state" == "running" ]]; then
    echo -e "  ${D}App:${R} ${GR}http://localhost:3000${R}"
  else
    echo -e "  ${D}App:${R} ${YE}not running${R}"
  fi
  echo -e "  ${D}Branch:${R} $(git branch --show-current)"
  if tty_running; then
    echo -e "  ${D}Terminal:${R} mirrored into the app pane ${D}(ctrl-b d to detach)${R}"
  fi
  if [[ -n "${CONTROL_PID:-}" ]] && kill -0 "$CONTROL_PID" 2>/dev/null; then
    echo -e "  ${D}Controls:${R} the app pane can run and reset ${D}(output: .autofactory/control/watcher.log)${R}"
  fi
  if [[ -f .autofactory/github-offline ]]; then
    echo -e "  ${RD}${B}GitHub: unavailable${R} ${RD}— runs fall back to visual simulation${R}" \
      "${D}(detected $(file_age_human .autofactory/github-offline) ago; clears on the next healthy run)${R}"
  fi
  echo ""
  echo -e "  ${D}Runner:${R} $(runner_label)"
  echo -e "  ${D}Storefront:${R} ${B}$(profile_label)${R}"
  echo ""
  echo -e "  ${BL}${B}Factory${R}"
  echo "    1) Run a scenario"
  echo ""
  echo -e "  ${BL}${B}App${R}"
  echo "    2) Start app (rebuilds only if app code changed)"
  echo "    3) Open in browser"
  echo "    4) Replay a fake run (rehearse the flowchart)"
  echo ""
  echo -e "  ${BL}${B}Between demos${R}"
  echo "    5) Reset (delete factory flags, close PRs, rewind branches)"
  echo "    6) Show branch status"
  echo ""
  echo "    p) Switch storefront    s) Settings      q) Quit"
  echo ""
  echo -e "  ${D}ctrl-c to exit${R}"
  echo ""

  choice=""
  if ! read -r -p "  > " choice </dev/tty 2>/dev/null; then
    echo ""
    echo "  No controlling terminal; run this from an interactive shell."
    exit 1
  fi

  case "$choice" in
    1)
      if s=$(pick_scenario); then
        run_scenario "$s"
        pause
      fi
      ;;
    2)
      start_app
      # if/else, not a && b || c: open-app.sh exits non-zero when the app never
      # answers, and the || branch would then run it a second time.
      if [[ "$AUTO_OPEN" == "on" ]]; then
        ./demo/open-app.sh || true
      else
        NO_OPEN=1 ./demo/open-app.sh || true
      fi
      pause
      ;;
    3)
      ./demo/open-app.sh || true
      pause
      ;;
    4)
      if s=$(pick_scenario); then
        pr=""
        read -r -p "  PR number to label it with [7]: " pr </dev/tty 2>/dev/null || true
        FACTORY_PROGRESS_ONLY=1 ./demo/replay-progress.sh "$s" "$REPLAY_SECS" "${pr:-7}"
        pause
      fi
      ;;
    5)
      make reset
      pause
      ;;
    6)
      echo ""
      stale=0
      for s in $(scenarios); do
        printf "    %-18s " "$s"
        if is_current "$s"; then
          echo -e "${GR}current${R}"
        else
          echo -e "${YE}behind main by $(git rev-list --count "feature/$s"..main 2>/dev/null)${R}"
          stale=$((stale + 1))
        fi
      done
      if (( stale > 0 )); then
        echo ""
        ans=""
        read -r -p "  Rebase all $stale onto main now? [Y/n] " ans </dev/tty 2>/dev/null || true
        [[ "${ans:-Y}" =~ ^[Nn]$ ]] || { echo ""; make sync; }
      fi
      pause
      ;;
    s | S)
      settings_screen
      ;;
    p | P)
      choose_profile || true
      ;;
    q | Q)
      echo ""
      echo -e "  ${D}App is still running. 'docker compose down' to stop it.${R}"
      echo ""
      exit 0
      ;;
    *)
      ;;
  esac
done
