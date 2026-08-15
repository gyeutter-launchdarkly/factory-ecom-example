#!/usr/bin/env bash
# Stop hook: commit any remaining work and push the current branch.
#
# Fires when an agent turn completes. Skips aborted/error turns, empty trees,
# and anything that is not a normal branch tip. Never amends, never force-pushes.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  echo '{}'
  exit 0
fi
cd "$ROOT"

input="$(cat || true)"
status="$(printf '%s' "$input" | jq -r '.status // empty' 2>/dev/null || true)"

# Only act on a clean completion. Aborts and errors leave the tree alone.
if [[ "$status" != "completed" ]]; then
  echo '{}'
  exit 0
fi

branch="$(git branch --show-current 2>/dev/null || true)"
if [[ -z "$branch" ]]; then
  echo "commit-and-push: detached HEAD; skipping" >&2
  echo '{}'
  exit 0
fi

# Stage everything tracked and any new files that are not ignored. Never force
# secrets that .gitignore already keeps out.
git add -A

if git diff --cached --quiet && git diff --quiet; then
  # Nothing to commit, but the branch may still be ahead of origin.
  if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
    ahead="$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)"
    if [[ "$ahead" -gt 0 ]]; then
      if git push 2>&1; then
        echo "commit-and-push: pushed $ahead existing commit(s) on $branch" >&2
      else
        echo "commit-and-push: push failed on $branch" >&2
      fi
    fi
  fi
  echo '{}'
  exit 0
fi

# Refuse to commit files that look like secrets even if they somehow got staged.
blocked="$(git diff --cached --name-only | grep -E '(^|/)\.env(\.|$)|credentials\.json|id_rsa|\.pem$' || true)"
if [[ -n "$blocked" ]]; then
  echo "commit-and-push: refusing to commit secret-looking paths:" >&2
  printf '%s\n' "$blocked" | sed 's/^/  /' >&2
  git reset -q
  echo '{}'
  exit 0
fi

summary="$(git diff --cached --stat | tail -1 | sed 's/^ *//')"
files="$(git diff --cached --name-only | wc -l | tr -d ' ')"

git commit -m "$(cat <<EOF
chore: apply agent session changes

${files} file(s) changed (${summary}).
EOF
)" >/dev/null

if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
  git push
else
  git push -u origin HEAD
fi

echo "commit-and-push: committed and pushed on $branch" >&2
echo '{}'
exit 0
