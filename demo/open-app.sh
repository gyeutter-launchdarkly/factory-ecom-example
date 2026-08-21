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

# Wait for a real HTTP response, not just an open socket. One line, rewritten
# in place: a banner and a progress track cost five lines to say what fits in
# one, and on a projector the useful part scrolls away.
started=$(date +%s)
deadline=$(( started + TIMEOUT ))
until curl -fsS -o /dev/null --max-time 2 "$URL" 2>/dev/null; do
  [ -t 1 ] && printf '\r  app     waiting for it to answer  %ds\033[K' "$(( $(date +%s) - started ))"
  [ "$(date +%s)" -ge "$deadline" ] && {
    [ -t 1 ] && printf '\r\033[K'
    printf '%s\n' "  app     ${URL} did not answer within ${TIMEOUT}s — docker compose logs app" >&2
    # Non-zero, so a caller is not told the app is up when it is not. Callers
    # that must not fail on this (`make dev`, the setup wizard) append `|| true`.
    exit 1
  }
  sleep 1
done
[ -t 1 ] && printf '\r\033[K'

printf '%s\n' "  app     ${GR}ready${R}  ${B}${URL}${R}"

if [ -n "${NO_OPEN:-}" ]; then
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
  printf '%s\n' "${D}  open ${URL} in your browser${R}"
fi
exit 0
