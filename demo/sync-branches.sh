#!/usr/bin/env bash
# Rebase every feature/* branch onto main and re-point its demo-seed/* tag.
#
# Any commit to main leaves the scenario branches behind it, which `make menu`
# reports as "needs rebase". Most such commits are docs or tooling and harmless,
# but a UI change on main makes a stale branch's diff revert it mid-demo, so the
# check does not try to judge which is which. This makes fixing it one command.
#
# Usage: make sync   (or ./demo/sync-branches.sh)
set -uo pipefail

cd "$(dirname "$0")/.."

START=$(git branch --show-current)

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is dirty; commit or stash first."
  exit 1
fi

FAILED=()
for branch in $(git for-each-ref --format='%(refname:short)' 'refs/heads/feature/*'); do
  scenario="${branch#feature/}"
  printf '  %-20s ' "$scenario"

  if git merge-base --is-ancestor main "$branch" 2>/dev/null; then
    echo "already current"
    continue
  fi

  if git rebase main "$branch" >/dev/null 2>&1; then
    echo "rebased"
  else
    git rebase --abort >/dev/null 2>&1 || true
    echo "CONFLICT, left alone"
    FAILED+=("$scenario")
  fi
done

git checkout -q "$START" 2>/dev/null || git checkout -q main

echo ""
make _tag-seeds

if (( ${#FAILED[@]} > 0 )); then
  echo ""
  echo "Needs a hand: ${FAILED[*]}"
  echo "Rebase one manually to see the conflicts:  git rebase main feature/<scenario>"
  exit 1
fi
