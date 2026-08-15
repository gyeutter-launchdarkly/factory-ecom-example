#!/usr/bin/env bash
# Rebase every feature/* branch onto main and re-point its demo-seed/* tag.
#
# Any commit to main leaves the scenario branches behind it, and a branch that is
# behind has a diff that reverts main's own commits. Rather than report that and
# make you fix it, this runs automatically: the post-commit hook fires it after
# every commit on main, and the menu runs it at startup.
#
# The rebases happen in a scratch worktree, so this never checks anything out in
# yours. That is what lets it run unattended, and while you are mid-edit — the
# old version refused whenever the working tree was dirty, which was exactly
# when it was most likely to be needed.
#
# Usage:
#   make sync                        on demand, verbose
#   ./demo/sync-branches.sh --auto   quiet, never fails; used by the hook and menu
#
# SYNC_PUSH=0 skips pushing the rebased branches (local refs only).
set -uo pipefail

cd "$(dirname "$0")/.."

AUTO=0
[[ "${1:-}" == "--auto" ]] && AUTO=1

# The rebases below run git commands that can fire hooks; this is how the
# post-commit hook knows not to start another sync.
export FACTORY_SYNC_RUNNING=1

say() { [[ $AUTO -eq 1 ]] || printf '%s\n' "$*"; }

# push_if_diverged lives with the other branch helpers, so the PR paths and this
# one cannot disagree about when GitHub needs updating.
# shellcheck source=lib/branch.sh
source demo/lib/branch.sh

# The post-commit hook runs with SYNC_PUSH=0 and leaves the remote to catch up
# here, so pushing is not conditional on having just rebased something.
push_all_diverged() {
  [[ "${SYNC_PUSH:-1}" == "1" ]] || return 0
  local branch
  while IFS= read -r branch; do
    [[ -z "$branch" ]] && continue
    push_if_diverged "${branch#feature/}"
  done < <(git for-each-ref --format='%(refname:short)' 'refs/heads/feature/*')
}

# Which branches are actually behind. "Nothing to do" is the common case and has
# to stay fast, because the menu calls this before its first render.
STALE=()
while IFS= read -r branch; do
  [[ -z "$branch" ]] && continue
  git merge-base --is-ancestor main "$branch" 2>/dev/null && continue
  STALE+=("$branch")
done < <(git for-each-ref --format='%(refname:short)' 'refs/heads/feature/*')

if (( ${#STALE[@]} == 0 )); then
  say "  all scenario branches are current"
  push_all_diverged
  exit 0
fi

# Self-heal first. A sync killed part-way (a closed terminal, a machine asleep
# mid-push) leaves its scratch worktree registered and its lock held, and
# without this every later sync would refuse and the branches would silently
# stop being maintained.
git worktree list --porcelain 2>/dev/null \
  | awk '/^worktree /{print substr($0,10)}' \
  | grep '/factory-sync\.' \
  | while IFS= read -r old; do
      git worktree remove --force "$old" >/dev/null 2>&1 || true
    done
git worktree prune >/dev/null 2>&1 || true

# One at a time: the hook fires on every commit, and two syncs racing would
# fight over the same refs.
LOCK=".autofactory/.sync.lock"
mkdir -p .autofactory
if ! mkdir "$LOCK" 2>/dev/null; then
  # Whoever holds it may be dead. Ask the OS rather than guessing from the
  # timestamp: a lock left by a killed run must not stop the branches being
  # maintained until it happens to age out.
  holder=$(cat "$LOCK/pid" 2>/dev/null || true)
  if [[ -n "$holder" ]] && kill -0 "$holder" 2>/dev/null; then
    echo "  another sync is already running (pid $holder); skipping"
    exit 0
  fi
  rm -rf "$LOCK" 2>/dev/null || true
  if ! mkdir "$LOCK" 2>/dev/null; then
    echo "  could not take the sync lock; skipping"
    exit 0
  fi
fi
echo $$ > "$LOCK/pid" 2>/dev/null || true

WT=""
TMPROOT=""
cleanup() {
  [[ -n "$WT" ]] && git worktree remove --force "$WT" >/dev/null 2>&1
  [[ -n "$TMPROOT" ]] && rm -rf "$TMPROOT"
  rm -rf "$LOCK" 2>/dev/null || true
}
trap cleanup EXIT

TMPROOT=$(mktemp -d "${TMPDIR:-/tmp}/factory-sync.XXXXXX")
WT="$TMPROOT/wt"
# --detach: main stays checked out in your worktree, this one just needs a tree
# to rebase in.
if ! git worktree add -q --detach "$WT" main >/dev/null 2>&1; then
  say "  could not create a scratch worktree; leaving branches alone"
  WT=""
  exit 0
fi

FAILED=()
REBASED=0
for branch in "${STALE[@]}"; do
  scenario="${branch#feature/}"

  if git -C "$WT" rebase main "$branch" >/dev/null 2>&1; then
    # Detach again so the branch is not held by the scratch worktree.
    git -C "$WT" checkout -q --detach >/dev/null 2>&1 || true
    # The seed tag is what `make reset` rewinds to, so it has to follow.
    git tag -f "demo-seed/$scenario" "$branch" >/dev/null 2>&1 || true
    REBASED=$((REBASED + 1))
    say "  $scenario rebased"
    [[ "${SYNC_PUSH:-1}" == "1" ]] && push_if_diverged "$scenario"
  else
    git -C "$WT" rebase --abort >/dev/null 2>&1 || true
    git -C "$WT" checkout -q --detach >/dev/null 2>&1 || true
    FAILED+=("$scenario")
    say "  $scenario CONFLICT, left alone"
  fi
done

# The hook runs with output going to .autofactory/sync.log, so leave a trace of
# what moved and when; a silent log makes an unattended rebase hard to trust.
if (( AUTO == 1 )) && (( REBASED > 0 || ${#FAILED[@]} > 0 )); then
  printf '%s  rebased %d, conflicts: %s\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" "$REBASED" "${FAILED[*]:-none}"
fi

if (( ${#FAILED[@]} > 0 )); then
  say ""
  say "Needs a hand: ${FAILED[*]}"
  say "Rebase one manually to see the conflicts:  git rebase main feature/<scenario>"
  # In --auto mode a conflict must not fail a commit or block the menu; the
  # branch is left exactly as it was and reported when you next look.
  [[ $AUTO -eq 1 ]] && exit 0
  exit 1
fi

exit 0
