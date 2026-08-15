#!/usr/bin/env bash
# Branch health for the demo scenarios, shared by the menu and the direct paths.
#
# Every commit to main leaves the feature branches behind it. A branch that is
# behind main by a commit touching src/ has a diff that REVERTS that commit, so
# opening its PR mid-demo shows the factory (and the audience) the wrong change.
# The menu has always checked for this; `make hosted` and `make run` did not,
# which is why these live here rather than in menu.sh.
#
# Source this file from the repo root; it defines is_current, is_spent,
# needs_attention, autosync and ensure_branch_ready.

# A branch is current if main is an ancestor of it — i.e. it has been rebased
# onto the current UI. Computed, not hardcoded, so it stays honest as branches
# are rebased.
is_current() {
  git merge-base --is-ancestor main "feature/$1" 2>/dev/null
}

# A scenario whose diff against main is empty has already been merged: there is
# nothing left to demo, and opening a PR fails with "No commits between".
is_spent() {
  git diff --quiet main.."feature/$1" -- src 2>/dev/null
}

# True when the branch is missing commits from main that touched the app itself.
# Missing only tooling or docs commits is harmless: the branch's diff cannot
# revert app code it never touched.
needs_attention() {
  if is_current "$1"; then return 1; fi
  local changed
  changed=$(git diff --name-only "feature/$1"...main -- src 2>/dev/null | head -1)
  [[ -n "$changed" ]]
}

tree_is_dirty() {
  ! git diff --quiet || ! git diff --cached --quiet
}

# Bring a branch up to date without asking, and leave you where you started.
# Rebasing onto main is safe and fast, and doing it silently keeps a demo moving.
autosync() {
  local scenario="$1" start
  start=$(git branch --show-current 2>/dev/null || true)

  local rebased=1
  git rebase main "feature/$scenario" >/dev/null 2>&1 && rebased=0
  [[ $rebased -eq 0 ]] || git rebase --abort >/dev/null 2>&1 || true

  git checkout -q "${start:-main}" 2>/dev/null || git checkout -q main 2>/dev/null || true
  [[ $rebased -eq 0 ]] || return 1

  # The seed tag is what `make reset` rewinds to, so it has to follow the rebase
  # or the next reset throws the rebase away.
  git tag -f "demo-seed/$scenario" "feature/$scenario" >/dev/null 2>&1 || true

  push_if_diverged "$scenario"
  return 0
}

# The post-commit hook rebases locally and does not push, so a branch can be
# up to date here and still differ from what GitHub has — and an open PR would
# then show the pre-rebase commits. The comparison is against the
# remote-tracking ref, so it costs nothing when they already agree.
push_if_diverged() {
  local branch="feature/$1" local_sha remote_sha
  git rev-parse --verify -q "refs/remotes/origin/$branch" >/dev/null 2>&1 || return 0

  local_sha=$(git rev-parse "$branch" 2>/dev/null || true)
  remote_sha=$(git rev-parse "refs/remotes/origin/$branch" 2>/dev/null || true)
  [[ -n "$local_sha" && "$local_sha" != "$remote_sha" ]] || return 0

  git fetch -q origin "$branch" >/dev/null 2>&1 || true
  git push -q origin "$branch" --force-with-lease >/dev/null 2>&1 \
    || echo "  note: could not push $branch; GitHub may still have the older commits."
}

# ensure_branch_ready <scenario>
# Non-interactive gate for the paths that open a PR. Returns non-zero when the
# scenario cannot be demoed correctly, with the reason and the fix.
ensure_branch_ready() {
  local scenario="$1" branch="feature/$1"

  if ! git show-ref --verify --quiet "refs/heads/$branch"; then
    echo "  $branch does not exist locally."
    echo "  'make reset' recreates it from its demo-seed tag."
    return 1
  fi

  if is_spent "$scenario"; then
    echo "  $branch is already merged into main: its diff is empty, so no PR can be opened."
    echo "  Revert the merge on main to demo it again, or pick another scenario."
    return 1
  fi

  if is_current "$scenario"; then
    push_if_diverged "$scenario"
    return 0
  fi

  if tree_is_dirty; then
    if needs_attention "$scenario"; then
      echo "  $branch is behind main, and the working tree is dirty so it cannot be rebased."
      echo "  main has app changes this branch does not; its PR diff would revert them."
      echo "  Commit or stash, then run: make sync"
      return 1
    fi
    echo "  note: $branch is behind main by tooling commits only; leaving it as it is."
    return 0
  fi

  echo "  $branch is behind main; rebasing so the PR diff shows only the feature."
  if autosync "$scenario"; then
    echo "  rebased feature/$scenario onto main"
    return 0
  fi

  echo "  rebase hit conflicts. Resolve by hand:"
  echo "    git rebase main $branch"
  return 1
}
