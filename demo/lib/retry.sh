#!/usr/bin/env bash
# Ride out transient GitHub failures.
#
# GitHub answers a small fraction of requests with a 5xx or a rate-limit blip
# that clears on its own in a few seconds. Those used to abort a demo mid-run
# and, worse, print "the token lacks the Actions scope" — sending the presenter
# to re-auth a token that was fine. This retries the request instead, and gives
# callers a predicate so they can word a genuine failure correctly.

# What counts as "try again in a moment" rather than "your setup is wrong".
FACTORY_TRANSIENT_RE='HTTP (50[0234])|500 |502 |503 |504 |no server is currently available|rate limit|secondary rate|abuse detection|timeout|timed out|temporarily unavailable|could not resolve host|connection reset|unexpected EOF|EOF occurred|i/o timeout'

is_transient() { grep -qiE "$FACTORY_TRANSIENT_RE" <<<"${1:-}"; }

# Where gh_retry leaves the stderr of a call it gave up on. A file, not a
# variable: most gh calls here run inside $( ), so a variable would be set in a
# subshell and lost. Callers read it to tell an outage from a real error without
# re-probing — a second probe can hit a different endpoint and disagree, which is
# exactly what happens when GitHub's GraphQL is down while REST is fine.
FACTORY_GH_ERR_FILE="${FACTORY_GH_ERR_FILE:-.autofactory/.gh-last-error}"

gh_last_error() { cat "$FACTORY_GH_ERR_FILE" 2>/dev/null || true; }

# Only a recent failure describes what GitHub is doing now. Without the age
# check, a 503 from earlier could make an unrelated later failure look like an
# outage and send a broken setup into the visual fallback.
gh_last_error_transient() {
  local mtime now
  [[ -f "$FACTORY_GH_ERR_FILE" ]] || return 1
  mtime=$(stat -f %m "$FACTORY_GH_ERR_FILE" 2>/dev/null \
    || stat -c %Y "$FACTORY_GH_ERR_FILE" 2>/dev/null || echo 0)
  now=$(date +%s)
  (( now - mtime <= ${FACTORY_GH_ERR_TTL:-120} )) || return 1
  is_transient "$(gh_last_error)"
}

# gh_retry <command...>
# Runs the command, retrying while it fails AND its stderr looks transient.
# stdout is passed through untouched, so `x=$(gh_retry gh ... --jq ...)` still
# captures clean output; only stderr is inspected and, on the final failure,
# re-emitted so the caller sees GitHub's own message. Returns the last exit code.
gh_retry() {
  local max="${GH_RETRY_MAX:-4}" attempt=1 rc errfile
  errfile=$(mktemp "${TMPDIR:-/tmp}/gh-retry.XXXXXX")
  # shellcheck disable=SC2064
  trap "rm -f '$errfile'" RETURN

  while :; do
    "$@" 2>"$errfile"
    rc=$?
    if (( rc == 0 )); then
      rm -f "$FACTORY_GH_ERR_FILE" 2>/dev/null || true
      return 0
    fi

    if (( attempt >= max )) || ! is_transient "$(cat "$errfile")"; then
      cat "$errfile" >&2
      # Leave the reason where the caller can classify it after the fact.
      mkdir -p "$(dirname "$FACTORY_GH_ERR_FILE")" 2>/dev/null || true
      cp "$errfile" "$FACTORY_GH_ERR_FILE" 2>/dev/null || true
      return "$rc"
    fi

    local delay=$(( attempt * attempt )) # 1s, 4s, 9s
    printf '  GitHub returned a transient error (attempt %d/%d); retrying in %ds…\n' \
      "$attempt" "$max" "$delay" >&2
    sleep "$delay"
    (( attempt++ ))
  done
}
