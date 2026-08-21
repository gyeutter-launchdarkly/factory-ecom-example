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
# shellcheck source=lib/pack.sh
source demo/lib/pack.sh
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
  pack_scenarios
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

# Honest execution modes. `act` is intentionally absent: it currently exits
# successfully without running agents.
RUNNER="hosted"
PR_STRATEGY="new"
REPLAY_SECS="2"
AUTO_OPEN="on"
DEMO_PACK="${DEMO_PACK:-default}"

load_settings() {
  [[ -f "$SETTINGS_FILE" ]] || return 0
  while IFS='=' read -r k v; do
    [[ "$k" =~ ^[[:space:]]*# || -z "${k// }" ]] && continue
    case "$k" in
      RUNNER | PR_STRATEGY | REPLAY_SECS | AUTO_OPEN | DEMO_PACK) printf -v "$k" '%s' "$v" ;;
    esac
  done < "$SETTINGS_FILE"
}

save_settings() {
  mkdir -p "$(dirname "$SETTINGS_FILE")"
  cat > "$SETTINGS_FILE" <<EOF
RUNNER=$RUNNER
PR_STRATEGY=$PR_STRATEGY
REPLAY_SECS=$REPLAY_SECS
AUTO_OPEN=$AUTO_OPEN
DEMO_PACK=$DEMO_PACK
EOF
}

choose_pack() {
  echo ""
  echo -e "  ${B}Choose demo pack${R}"
  local -a ids=()
  local id i=1
  while IFS= read -r id; do
    pack_is_valid "$id" || continue
    ids+=("$id")
    local previous="$DEMO_PACK"
    DEMO_PACK="$id"
    printf "    %d) %-24s %s\n" "$i" "$(pack_name)" "$(pack_visibility)"
    DEMO_PACK="$previous"
    i=$((i + 1))
  done < <(pack_ids)
  echo ""
  local choice=""
  read -r -p "  > " choice </dev/tty 2>/dev/null || return 1
  [[ "$choice" =~ ^[0-9]+$ ]] || return 1
  (( choice >= 1 && choice <= ${#ids[@]} )) || return 1
  DEMO_PACK="${ids[$((choice - 1))]}"
  save_settings
}

# The hosted workflow must be gated when we run the chain locally, and ungated
# when GitHub is meant to run it. Applied whenever the runner changes, and again
# at startup: the saved runner and the repo variable drift apart otherwise (a
# hosted run leaves the gate on if settings are edited outside the menu).
sync_gate() {
  local quiet="${1:-}"
  [[ "$RUNNER" == "hosted" ]] && gate_set true "$quiet"
}

runner_label() {
  case "$RUNNER" in
    hosted)
      [[ "$PR_STRATEGY" == "attach" ]] \
        && echo "Live PR · attach to active Actions run" \
        || echo "Live PR · start a new Actions run"
      ;;
    local) echo "Local agents · real chain, no PR" ;;
    recorded) echo "Recorded real run · accelerated replay" ;;
    rehearsal) echo "Rehearsal · synthetic, guaranteed" ;;
    *)       echo "$RUNNER" ;;
  esac
}

runner_eta() {
  case "$RUNNER" in
    hosted) [[ "$PR_STRATEGY" == "attach" ]] && echo "already running" || echo "5–10 min" ;;
    local) echo "3–8 min" ;;
    recorded) echo "30–90 sec" ;;
    rehearsal) echo "~12 sec" ;;
  esac
}

runner_needs_branch() { [[ "$RUNNER" == "hosted" || "$RUNNER" == "local" ]]; }

# Dispatch a scenario through whichever runner is selected.
run_scenario() {
  # The menu is the presentation surface: show the live progress bar, errors,
  # links and final result, not the parser's raw protocol. Running `make hosted`
  # directly remains verbose for troubleshooting.
  case "$RUNNER" in
    hosted)
      FACTORY_ATTACH="$([[ "$PR_STRATEGY" == "attach" ]] && echo 1 || echo 0)" \
        FACTORY_PROGRESS_ONLY=1 make hosted SCENARIO="$1"
      ;;
    local) FACTORY_PROGRESS_ONLY=1 ./demo/ci/run-local.sh "$1" ;;
    recorded)
      [[ -f "$(pack_recordings_dir)/$1.ndjson" ]] || {
        echo "  no recording for '$1'; run demo/capture-recording.sh $1 after a live run"
        return 2
      }
      ./demo/replay-recording.sh "$1"
      ;;
    rehearsal) FACTORY_PROGRESS_ONLY=1 ./demo/replay-progress.sh "$1" "$REPLAY_SECS" 0 ;;
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
    echo -e "    1) Execution mode        ${GR}$(runner_label)${R} ${D}($(runner_eta))${R}"
    echo -e "    2) Live PR behavior      ${GR}${PR_STRATEGY}${R}"
    echo -e "    3) Rehearsal speed       ${GR}${REPLAY_SECS}s per step${R}"
    echo -e "    4) Open browser on start ${GR}${AUTO_OPEN}${R}"
    echo -e "    5) Demo pack             ${GR}$(pack_name)${R} ${D}($(pack_visibility))${R}"
    [[ "$RUNNER" == "hosted" ]] \
      && echo -e "       ${D}hosted trigger gate: $([[ "$gate" == "true" ]] && echo "ready" || echo "not enabled")${R}"
    echo ""
    echo "    0) back"
    echo ""
    local c=""
    read -r -p "  > " c </dev/tty 2>/dev/null || return 0
    case "$c" in
      1)
        echo ""
        echo "    1) Live PR       real PR + GitHub Actions"
        echo "    2) Local agents  real chain via phase1-cli, no PR"
        echo "    3) Recorded run  accelerated replay of a completed real run$(
          pack_has_recordings || printf ' (none captured in this pack)'
        )"
        echo "    4) Rehearsal     synthetic, deterministic, no agents"
        echo ""
        echo -e "  ${D}act is hidden: it currently exits successfully without running agents.${R}"
        echo ""
        local r=""
        read -r -p "  > " r </dev/tty 2>/dev/null || continue
        case "$r" in
          1) RUNNER="hosted" ;;
          2) RUNNER="local" ;;
          3) RUNNER="recorded" ;;
          4) RUNNER="rehearsal" ;;
        esac
        save_settings
        echo ""
        sync_gate
        read -r -p "  press enter " _ </dev/tty 2>/dev/null || true
        ;;
      2)
        echo ""
        echo "    1) new     create/reuse the PR and start a new workflow"
        echo "    2) attach  watch an already queued/running workflow"
        local strategy=""
        read -r -p "  > " strategy </dev/tty 2>/dev/null || continue
        case "$strategy" in
          1) PR_STRATEGY="new" ;;
          2) PR_STRATEGY="attach" ;;
        esac
        save_settings
        ;;
      3)
        local v=""
        read -r -p "  seconds per step [${REPLAY_SECS}]: " v </dev/tty 2>/dev/null || continue
        [[ "$v" =~ ^[0-9]+$ ]] && REPLAY_SECS="$v" && save_settings
        ;;
      4)
        [[ "$AUTO_OPEN" == "on" ]] && AUTO_OPEN="off" || AUTO_OPEN="on"
        save_settings
        ;;
      5)
        choose_pack || true
        ;;
      0 | "") return 0 ;;
    esac
  done
}

load_settings

# An older settings file may still name an act runner; those do not run the
# agents, so migrate silently to the working path.
case "$RUNNER" in
  act | act+pr | actions) RUNNER="hosted"; save_settings ;;
esac
pack_is_valid "$DEMO_PACK" || { DEMO_PACK="default"; save_settings; }

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
    title=$(jq -r '.pull_request.title' "$(pack_event_file "$s")")
    if runner_needs_branch && is_spent "$s"; then
      mark="${D}merged, nothing to demo${R}"
    elif runner_needs_branch && needs_attention "$s"; then
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
  local chosen_branch chosen_base
  chosen_branch=$(scenario_branch "$chosen")
  chosen_base=$(scenario_base "$chosen")

  if runner_needs_branch && is_spent "$chosen"; then
    echo "" >&2
    echo -e "  ${YE}!${R}  $chosen_branch is already merged into $chosen_base." >&2
    echo -e "  ${D}Opening a PR would fail: there are no commits between them." >&2
    echo -e "  Revert the merge on main to demo it again, or pick another.${R}" >&2
    return 1
  fi

  if runner_needs_branch && ! is_current "$chosen"; then
    if needs_attention "$chosen"; then
      echo "" >&2
      echo -e "  ${YE}!${R}  $chosen_base has app changes $chosen_branch does not." >&2
      echo -e "  ${D}Running it as-is would revert them mid-demo.${R}" >&2
      local ans=""
      read -r -p "  Rebase it now? [Y/n] " ans </dev/tty 2>/dev/null || return 1
      [[ "${ans:-Y}" =~ ^[Nn]$ ]] && return 1
    fi
    # Either it only missed tooling commits, or you asked for the rebase.
    if ! autosync "$chosen"; then
      echo "" >&2
      echo -e "  ${YE}!${R}  rebase hit conflicts; resolve by hand:" >&2
      echo -e "  ${D}    git rebase $chosen_base $chosen_branch${R}" >&2
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
  echo -e "  ${D}Mode:${R} $(runner_label) ${D}· $(runner_eta)${R}"
  echo -e "  ${D}Pack:${R} ${B}$(pack_name)${R} ${D}· $(pack_visibility)${R}"
  echo ""
  echo -e "  ${BL}${B}Factory${R}"
  echo "    1) Run a scenario"
  echo ""
  echo -e "  ${BL}${B}App${R}"
  echo "    2) Start app (rebuilds only if app code changed)"
  echo "    3) Open in browser"
  echo "    4) Quick rehearsal (synthetic, no agents)"
  echo ""
  echo -e "  ${BL}${B}Between demos${R}"
  echo "    5) Reset (delete factory flags, close PRs, rewind branches)"
  echo "    6) Show branch status"
  echo ""
  echo "    p) Switch demo pack     s) Settings      q) Quit"
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
        branch=$(scenario_branch "$s")
        base=$(scenario_base "$s")
        printf "    %-18s " "$s"
        if is_current "$s"; then
          echo -e "${GR}current${R}"
        else
          echo -e "${YE}behind $base by $(git rev-list --count "$branch".."$base" 2>/dev/null)${R}"
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
      choose_pack || true
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
