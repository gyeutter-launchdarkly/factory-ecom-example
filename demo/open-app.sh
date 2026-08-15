#!/usr/bin/env bash
# Wait for the demo app to answer on $PORT, print a clickable link, and open
# the browser. Run in the background by `make dev`, or on its own via `make open`.
#
# Next.js prints the container hostname (http://<container-id>:3000), which is
# not reachable from the host, so we print the real URL ourselves.
#
# Opt out of the browser launch with NO_OPEN=1 (the link is still printed).
# Skipped automatically when stdout is not a terminal.

set -uo pipefail

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"
TIMEOUT="${TIMEOUT:-90}"

B=$'\033[1m'; GR=$'\033[32m'; D=$'\033[2m'; R=$'\033[0m'

# Wait for a real HTTP response, not just an open socket.
# ### track while the app comes up.
deadline=$(( $(date +%s) + TIMEOUT ))
tick=0
until curl -fsS -o /dev/null --max-time 2 "$URL" 2>/dev/null; do
  tick=$(( tick + 1 ))
  [ -t 1 ] && printf '\r  starting the app  [%-24s]' "$(printf '#%.0s' $(seq 1 $(( tick % 25 ))))"
  [ "$(date +%s)" -ge "$deadline" ] && {
    [ -t 1 ] && printf '\r%-60s\r' " "
    printf '%s\n' "${D}  App did not respond on ${URL} within ${TIMEOUT}s.${R}" >&2
    exit 0   # never fail the parent `make dev`
  }
  sleep 1
done
[ -t 1 ] && printf '\r%-60s\r' " "

printf '\n%s\n' "${GR}${B}  +--------------------------------------------------+"
printf '%s\n'   "  |   Demo app ready                                 |"
printf '%s\n'   "  |                                                  |"
printf '%s\n'   "  |   ${URL}$(printf '%*s' $(( 47 - ${#URL} )) '')|"
printf '%s\n'   "  +--------------------------------------------------+${R}"

if [ -n "${NO_OPEN:-}" ]; then
  printf '%s\n\n' "${D}  NO_OPEN set, not opening the browser.${R}"
  exit 0
fi
if [ ! -t 1 ]; then
  exit 0
fi

if command -v open >/dev/null 2>&1; then          # macOS
  open "$URL" 2>/dev/null
elif command -v wslview >/dev/null 2>&1; then     # WSL
  wslview "$URL" 2>/dev/null
elif command -v xdg-open >/dev/null 2>&1; then    # Linux
  xdg-open "$URL" >/dev/null 2>&1
else
  printf '%s\n' "${D}  Open ${URL} in your browser.${R}"
fi
printf '\n'
exit 0
