#!/usr/bin/env bash
# Demo control menu. Stay here for the whole demo: pick a scenario, run the
# factory locally or as a real PR, open the app, reset between runs.
#
# Usage: bash demo/menu.sh   (or `make menu`, or automatically after setup.sh)
set -uo pipefail

cd "$(dirname "$0")/.."

B='\033[1m'; D='\033[2m'; R='\033[0m'
BL='\033[34m'; GR='\033[32m'; YE='\033[33m'

EVENTS_DIR="demo/ci/events"

scenarios() {
  for f in "$EVENTS_DIR"/*.json; do basename "$f" .json; done | sort
}

# A branch is current if main is an ancestor of it — i.e. it has been rebased
# onto the current UI. Computed, not hardcoded, so it stays honest as branches
# are rebased.
is_current() {
  git merge-base --is-ancestor main "feature/$1" 2>/dev/null
}

app_state() {
  if curl -sf -o /dev/null --max-time 2 http://localhost:3000/ 2>/dev/null; then
    echo "running"
  else
    echo "stopped"
  fi
}

SETTINGS_FILE=".autofactory/demo-settings"

# Defaults. RUNNER decides what "run the factory" does:
#   act      canned event, dummy token. Nothing touches GitHub. Fastest.
#   act+pr   real PR on GitHub, chain executed locally by act. Fast AND visible.
#   actions  real PR, chain executed by GitHub Actions. Realistic, queue wait.
RUNNER="act+pr"
REPLAY_SECS="2"
AUTO_OPEN="on"

load_settings() {
  [[ -f "$SETTINGS_FILE" ]] || return 0
  while IFS='=' read -r k v; do
    [[ "$k" =~ ^[[:space:]]*# || -z "${k// }" ]] && continue
    case "$k" in
      RUNNER | REPLAY_SECS | AUTO_OPEN) printf -v "$k" '%s' "$v" ;;
    esac
  done < "$SETTINGS_FILE"
}

save_settings() {
  mkdir -p "$(dirname "$SETTINGS_FILE")"
  cat > "$SETTINGS_FILE" <<EOF
RUNNER=$RUNNER
REPLAY_SECS=$REPLAY_SECS
AUTO_OPEN=$AUTO_OPEN
EOF
}

runner_label() {
  case "$RUNNER" in
    act)     echo "act only (nothing on GitHub)" ;;
    act+pr)  echo "real PR + act (fast, visible)" ;;
    actions) echo "real PR + GitHub Actions (queue wait)" ;;
    *)       echo "$RUNNER" ;;
  esac
}

# Dispatch a scenario through whichever runner is selected.
run_scenario() {
  case "$RUNNER" in
    act)     make ci SCENARIO="$1" ;;
    act+pr)  make pr SCENARIO="$1" ;;
    actions) make run SCENARIO="$1" ;;
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
    echo -e "    1) Factory runner       ${GR}$(runner_label)${R}"
    echo -e "    2) Replay speed         ${GR}${REPLAY_SECS}s per step${R}"
    echo -e "    3) Open browser on start ${GR}${AUTO_OPEN}${R}"
    echo ""
    echo "    0) back"
    echo ""
    local c=""
    read -r -p "  > " c </dev/tty 2>/dev/null || return 0
    case "$c" in
      1)
        echo ""
        echo "    1) act only      canned event, dummy token, nothing on GitHub"
        echo "    2) real PR + act opens a real PR, act runs the chain against it"
        echo "    3) real PR + Actions  hosted run, realistic but you wait"
        echo ""
        local r=""
        read -r -p "  > " r </dev/tty 2>/dev/null || continue
        case "$r" in
          1) RUNNER="act" ;;
          2) RUNNER="act+pr" ;;
          3) RUNNER="actions" ;;
        esac
        save_settings
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
      0 | "") return 0 ;;
    esac
  done
}

load_settings

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
    if is_current "$s"; then
      mark="${GR}ready${R}"
    else
      mark="${YE}needs rebase${R}"
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
  if ! is_current "$chosen"; then
    echo "" >&2
    echo -e "  ${YE}!${R}  feature/$chosen has not been rebased onto main." >&2
    echo -e "  ${D}Its diff reverts the current UI, so the demo will look wrong.${R}" >&2
    local ans=""
    read -r -p "  Run it anyway? [y/N] " ans </dev/tty 2>/dev/null || return 1
    [[ "$ans" =~ ^[Yy]$ ]] || return 1
  fi
  printf '%s' "$chosen"
}

pause() {
  echo ""
  read -r -p "  press enter to return to the menu " _ </dev/tty 2>/dev/null || true
}

while true; do
  clear
  echo -e "${B}"
  echo "  +--------------------------------------------------+"
  echo "  |        LaunchDarkly Factory Demo                 |"
  echo "  +--------------------------------------------------+"
  echo -e "${R}"

  state=$(app_state)
  if [[ "$state" == "running" ]]; then
    echo -e "  ${D}App:${R} ${GR}http://localhost:3000${R}"
  else
    echo -e "  ${D}App:${R} ${YE}not running${R}"
  fi
  echo -e "  ${D}Branch:${R} $(git branch --show-current)"
  echo ""
  echo -e "  ${D}Runner:${R} $(runner_label)"
  echo ""
  echo -e "  ${BL}${B}Factory${R}"
  echo "    1) Run a scenario"
  echo ""
  echo -e "  ${BL}${B}App${R}"
  echo "    2) Start / rebuild"
  echo "    3) Open in browser"
  echo "    4) Replay a fake run (rehearse the flowchart)"
  echo ""
  echo -e "  ${BL}${B}Between demos${R}"
  echo "    5) Reset (delete factory flags, close PRs, rewind branches)"
  echo "    6) Show branch status"
  echo ""
  echo "    s) Settings      q) Quit"
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
        echo ""
        run_scenario "$s"
        pause
      fi
      ;;
    2)
      echo ""
      docker compose up -d --build
      [[ "$AUTO_OPEN" == "on" ]] && ./demo/open-app.sh || NO_OPEN=1 ./demo/open-app.sh
      pause
      ;;
    3)
      ./demo/open-app.sh
      pause
      ;;
    4)
      if s=$(pick_scenario); then
        echo ""
        pr=""
        read -r -p "  PR number to label it with [7]: " pr </dev/tty 2>/dev/null || true
        ./demo/replay-progress.sh "$s" "$REPLAY_SECS" "${pr:-7}"
        pause
      fi
      ;;
    5)
      echo ""
      make reset
      pause
      ;;
    6)
      echo ""
      for s in $(scenarios); do
        printf "    %-18s " "$s"
        if is_current "$s"; then
          echo -e "${GR}rebased onto main${R}"
        else
          echo -e "${YE}needs rebase${R}"
        fi
      done
      pause
      ;;
    s | S)
      settings_screen
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
