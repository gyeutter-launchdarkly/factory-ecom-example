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
  echo -e "  ${BL}${B}Run the factory${R}"
  echo "    1) Locally, via act          (no queue, no GitHub setup)"
  echo "    2) As a real PR              (runs in GitHub Actions)"
  echo ""
  echo -e "  ${BL}${B}App${R}"
  echo "    3) Start / rebuild"
  echo "    4) Open in browser"
  echo "    5) Replay a fake factory run (rehearse the flowchart)"
  echo ""
  echo -e "  ${BL}${B}Between demos${R}"
  echo "    6) Reset (delete factory flags, close PRs, rewind branches)"
  echo "    7) Show branch status"
  echo ""
  echo "    q) Quit"
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
        make ci SCENARIO="$s"
        pause
      fi
      ;;
    2)
      if s=$(pick_scenario); then
        echo ""
        make run SCENARIO="$s"
        pause
      fi
      ;;
    3)
      echo ""
      docker compose up -d --build && ./demo/open-app.sh
      pause
      ;;
    4)
      ./demo/open-app.sh
      pause
      ;;
    5)
      if s=$(pick_scenario); then
        echo ""
        pr=""
        read -r -p "  PR number to label it with [7]: " pr </dev/tty 2>/dev/null || true
        ./demo/replay-progress.sh "$s" 2 "${pr:-7}"
        pause
      fi
      ;;
    6)
      echo ""
      make reset
      pause
      ;;
    7)
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
