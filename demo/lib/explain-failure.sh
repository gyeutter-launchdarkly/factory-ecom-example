#!/usr/bin/env bash
# Say why a hosted run failed, in the terminal, while the presenter is looking at
# it.
#
# The watcher can only report where the chain stopped ("run failure at
# autofactory-research-planner"). The reason lives in the Actions log, which is a
# bad place to go during a demo — an expired Anthropic key and a genuine agent
# failure look identical from the pane, yet one is a 30-second fix and the other
# is a talking point.
#
# Failure to explain is never fatal: the caller has already printed the run URL,
# so a quiet `return 1` leaves the old behaviour intact.

# shellcheck source=retry.sh
source demo/lib/retry.sh

# The log with its job/step columns and ISO timestamps stripped, so patterns can
# match the message text itself.
_failure_log() {
  local slug="$1" run="$2" raw
  raw=$(gh_retry env -u GH_TOKEN -u GITHUB_TOKEN \
    gh run view "$run" --repo "$slug" --log-failed 2>/dev/null) || return 1
  [[ -n "$raw" ]] || return 1
  printf '%s\n' "$raw" | sed -e $'s/^[^\t]*\t[^\t]*\t//' -e 's/^[0-9][0-9T:.-]*Z* //'
}

# First line matching a pattern, trimmed of leading spaces and ::directives::.
_first_match() {
  grep -m1 -iE "$1" <<<"$2" | sed -e 's/^ *//' -e 's/^::[a-z]*:://' -e 's/^##\[[a-z]*\]//'
}

explain_run_failure() {
  local slug="$1" run="$2" log why fix context
  log=$(_failure_log "$slug" "$run") || return 1

  # Ordered by cause, not by severity: the earliest thing to go wrong explains
  # everything after it, so the first match wins. Credentials come first because
  # they fail every node at once and look like a total collapse.
  if grep -qiE 'invalid access token|401.*launchdarkly|launchdarkly.*(401|unauthorized)' <<<"$log"; then
    why="LaunchDarkly rejected LD_API_KEY (401)"
    fix="gh secret set LD_API_KEY, and update it in .env.local (needs write access)"
  elif grep -qiE 'authentication_error|api key is invalid|invalid x-api-key' <<<"$log"; then
    why="Anthropic rejected the API key (401) — every agent failed instantly"
    fix="new key at console.anthropic.com/settings/keys, then gh secret set ANTHROPIC_API_KEY (and .env.local)"
  elif grep -qiE 'credit balance is too low|insufficient_quota|billing' <<<"$log"; then
    why="the Anthropic account is out of credit"
    fix="top up at console.anthropic.com/settings/billing, then rerun"
  elif grep -qiE 'overloaded_error|rate_limit_error|429' <<<"$log"; then
    why="Anthropic was rate limited or overloaded — transient, not your setup"
    fix="rerun in a minute; the same PR is reused"
  elif grep -qiE 'deterministic check failed' <<<"$log"; then
    # Already written for a human; quote it rather than paraphrase.
    why=$(_first_match 'deterministic check failed' "$log")
    fix="a real finding about the generated code, not a broken demo"
  elif grep -qiE 'verdict → .*(rejected|incomplete)' <<<"$log"; then
    # The factory worked and decided against the change. Worth saying plainly,
    # because a red check for this reason is a talking point, not a fault.
    why=$(_first_match 'verdict →' "$log")
    fix="the factory reached this verdict; the PR comment has the reasoning"
  fi

  # Useful even when the cause is unknown: where the chain stopped and why the
  # next agent never ran.
  context=$(_first_match 'chain stalled at' "$log")

  if [[ -z "$why" ]]; then
    # Nothing recognised: fall back to the first failed node's error line, which
    # is the line directly after its banner.
    why=$(grep -A2 -iE '═+ .* \[failed\] ═+' <<<"$log" \
      | grep -viE '═+|^tags:|^--$' | grep -m1 . | sed -e 's/^ *//' | cut -c1-200)
    # Some runs have no per-node banner at all — GitHub could not attribute the
    # steps — so fall further back to whatever error the job did print.
    [[ -n "$why" ]] || why=$(_first_match '^(##\[error\]|::error|verdict →)' "$log" | cut -c1-200)
  fi
  [[ -n "$why$context" ]] || return 1

  # Aligned under the runner's step lines, one line each, no blank separators:
  # this lands mid-demo and has to be read at a glance.
  local d='' b='' rd='' r=''
  [ -t 1 ] && { d=$'\033[2m'; b=$'\033[1m'; rd=$'\033[31m'; r=$'\033[0m'; }
  [[ -n "$why" ]]     && printf '          %swhy%s %s\n' "$rd" "$r" "$(cut -c1-160 <<<"$why")"
  [[ -n "$context" ]] && printf '          %s%s%s\n' "$d" "$(cut -c1-160 <<<"$context")" "$r"
  [[ -n "$fix" ]]     && printf '          %sfix%s %s\n' "$b" "$r" "$fix"
  return 0
}
