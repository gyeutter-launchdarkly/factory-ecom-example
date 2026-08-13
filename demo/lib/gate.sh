#!/usr/bin/env bash
# Shared helpers for the AUTOFACTORY_REQUIRE_LABEL repo variable, which decides
# whether the hosted GitHub Actions workflow runs on a PR.
#
# It has to track whichever runner you are using:
#   running the chain locally (act)      -> gate the hosted run, or it runs twice
#   running it in GitHub Actions         -> ungate, or nothing happens at all
#
# Source this file; it defines gate_get and gate_set. Both are quiet no-ops when
# there is no token or no remote, so nothing here can fail a demo.

gate_repo_slug() {
  git remote get-url origin 2>/dev/null \
    | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##' || true
}

gate_token() {
  [[ -f .env.local ]] || return 0
  grep "^GITHUB_TOKEN=" .env.local 2>/dev/null | cut -d= -f2- || true
}

# Reading and writing repo variables needs Actions Variables permission, which
# the demo PAT does not carry (it only has Contents + Pull requests). The gh CLI
# is authenticated separately via `gh auth login`, and that session does have it,
# so prefer gh and fall back to the PAT only if gh is missing.
gate_gh_ok() {
  command -v gh &>/dev/null && gh auth status &>/dev/null
}

# Prints "true", "false", or "" when unset or unreadable.
gate_get() {
  local slug
  slug=$(gate_repo_slug)
  [[ -z "$slug" ]] && return 0

  if gate_gh_ok; then
    gh variable list --repo "$slug" --json name,value 2>/dev/null \
      | jq -r '.[] | select(.name == "AUTOFACTORY_REQUIRE_LABEL") | .value' 2>/dev/null || true
    return 0
  fi

  local token
  token=$(gate_token)
  [[ -z "$token" || "$token" == "dummy-local-run" ]] && return 0
  curl -s -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/${slug}/actions/variables/AUTOFACTORY_REQUIRE_LABEL" \
    2>/dev/null | jq -r '.value // empty' 2>/dev/null || true
}

# gate_set <true|false> [quiet]
gate_set() {
  local want="$1" quiet="${2:-}"
  local slug current
  slug=$(gate_repo_slug)
  [[ -z "$slug" ]] && return 0

  current=$(gate_get)
  [[ "$current" == "$want" ]] && return 0

  local ok=false
  if gate_gh_ok; then
    gh variable set AUTOFACTORY_REQUIRE_LABEL --repo "$slug" --body "$want" &>/dev/null && ok=true
  else
    local token code
    token=$(gate_token)
    if [[ -n "$token" && "$token" != "dummy-local-run" ]]; then
      code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Authorization: Bearer $token" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        -d "{\"name\":\"AUTOFACTORY_REQUIRE_LABEL\",\"value\":\"${want}\"}" \
        "https://api.github.com/repos/${slug}/actions/variables")
      [[ "$code" == "201" || "$code" == "409" ]] && ok=true
      if [[ "$code" == "409" ]]; then
        code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
          -H "Authorization: Bearer $token" \
          -H "Accept: application/vnd.github+json" \
          -H "X-GitHub-Api-Version: 2022-11-28" \
          -d "{\"name\":\"AUTOFACTORY_REQUIRE_LABEL\",\"value\":\"${want}\"}" \
          "https://api.github.com/repos/${slug}/actions/variables/AUTOFACTORY_REQUIRE_LABEL")
        [[ "$code" == "204" ]] && ok=true || ok=false
      fi
    fi
  fi

  if $ok; then
    [[ -n "$quiet" ]] || echo "  hosted GitHub run: $([[ "$want" == "true" ]] && echo "gated" || echo "enabled") (AUTOFACTORY_REQUIRE_LABEL=$want)"
    return 0
  fi

  echo "  warning: could not set AUTOFACTORY_REQUIRE_LABEL."
  if [[ "$want" == "true" ]]; then
    echo "  GitHub Actions may also run the chain on this PR, duplicating its work."
  else
    echo "  The hosted run may stay gated, so opening a PR would do nothing."
  fi
  echo "  Fix with:  gh auth login   (then re-run), or set it in repo Settings > Variables."
}
