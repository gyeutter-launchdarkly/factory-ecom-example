#!/usr/bin/env bash
# Which repo a demo run drives, and which factory drives it.
#
# Two targets, because they are genuinely different products:
#
#   autofactory  This repo. The chain is a checked-in GitHub Actions workflow
#                that we trigger ourselves (the `autofactory` label), so the
#                demo owns the gate and watches the run it started.
#
#   factory      launchdarkly-labs/gyeutter-factory-demo, driven by LaunchDarkly Factory,
#                the GitHub App. Nothing is checked in there and there is no
#                workflow to trigger: opening a PR is the whole trigger, and the
#                App reacts on its own. The demo therefore never sets a gate and
#                never expects to find a workflow run of its own.
#
# The target repo is not the one we are running in, so it is kept as a managed
# clone under .autofactory/targets (gitignored) and every git call is scoped to
# it with -C.

FACTORY_TARGET="${FACTORY_TARGET:-}"
if [[ -z "$FACTORY_TARGET" && -f .autofactory/demo-settings ]]; then
  FACTORY_TARGET=$(awk -F= '$1 == "FACTORY_TARGET" { print $2; exit }' .autofactory/demo-settings)
fi
FACTORY_TARGET="${FACTORY_TARGET:-autofactory}"

FACTORY_APP_SLUG="${FACTORY_APP_SLUG:-launchdarkly-labs/gyeutter-factory-demo}"
TARGETS_DIR=".autofactory/targets"

target_id() { printf '%s' "$FACTORY_TARGET"; }

target_label() {
  case "$FACTORY_TARGET" in
    autofactory) echo "AutoFactory · this repo (workflow we trigger)" ;;
    factory)     echo "Factory GitHub App · ${FACTORY_APP_SLUG} (App reacts to the PR)" ;;
    *)           echo "$FACTORY_TARGET" ;;
  esac
}

target_slug() {
  if [[ "$FACTORY_TARGET" == "factory" ]]; then
    printf '%s' "$FACTORY_APP_SLUG"
  else
    git remote get-url origin 2>/dev/null \
      | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##'
  fi
}

# Where the target's git tree lives. "." for this repo; a managed clone otherwise.
target_dir() {
  if [[ "$FACTORY_TARGET" == "factory" ]]; then
    printf '%s/%s' "$TARGETS_DIR" "$(basename "$FACTORY_APP_SLUG")"
  else
    printf '%s' "."
  fi
}

target_is_local() { [[ "$FACTORY_TARGET" != "factory" ]]; }

# Only the AutoFactory path triggers a workflow, so only it owns the label gate.
target_uses_label_gate() { [[ "$FACTORY_TARGET" != "factory" ]]; }

# Clone on first use, otherwise fetch. Safe to call repeatedly.
target_ensure_repo() {
  target_is_local && return 0
  local dir slug
  dir=$(target_dir); slug=$(target_slug)
  if [[ ! -d "$dir/.git" ]]; then
    mkdir -p "$(dirname "$dir")"
    echo "  cloning ${slug}"
    env -u GH_TOKEN -u GITHUB_TOKEN gh repo clone "$slug" "$dir" -- -q 2>/dev/null \
      || { echo "  could not clone ${slug}"; return 1; }
  fi
  git -C "$dir" fetch -q origin 2>/dev/null || true
  local base
  base=$(target_base_branch)
  git -C "$dir" checkout -q "$base" 2>/dev/null || true
  git -C "$dir" reset -q --hard "origin/${base}" 2>/dev/null || true
}

target_base_branch() {
  local dir
  dir=$(target_dir)
  git -C "$dir" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null \
    | sed 's#^origin/##' || echo main
}

# The app must exist in the target before a scenario can change it. On a fresh
# target repo the storefront is still an open PR, and saying so beats letting a
# patch fail with three "does not exist in index" errors.
target_has_app() {
  local dir base
  dir=$(target_dir); base=$(target_base_branch)
  git -C "$dir" cat-file -e "origin/${base}:src/lib/ld.ts" 2>/dev/null
}

# Build the scenario's change in the target from this repo's feature branch.
# The diff is taken three-dot (against the merge base) and applied with --3way,
# which survives the two repos' files having drifted apart.
target_prepare_scenario() {
  local scenario="$1" dir base branch patch
  dir=$(target_dir); base=$(target_base_branch); branch="feature/${scenario}"

  if ! git rev-parse --verify -q "refs/heads/$branch" >/dev/null; then
    echo "  no local $branch to take the change from"
    return 1
  fi

  patch=$(mktemp "${TMPDIR:-/tmp}/scenario.XXXXXX.patch")
  git diff "main...${branch}" -- src > "$patch"
  if [[ ! -s "$patch" ]]; then
    echo "  $branch has no changes under src/ (already merged into main?)"
    rm -f "$patch"; return 1
  fi

  git -C "$dir" checkout -q -B "$branch" "origin/${base}" 2>/dev/null
  if ! git -C "$dir" apply --3way "$patch" 2>/dev/null; then
    echo "  the $scenario change did not apply to $(target_slug)"
    echo "  resolve by hand in $dir, or pick another scenario"
    rm -f "$patch"; return 1
  fi
  rm -f "$patch"

  git -C "$dir" add -A src
  if git -C "$dir" diff --cached --quiet; then
    echo "  nothing to commit for $scenario"
    return 1
  fi
  local title
  title=$(jq -r '.pull_request.title // empty' "$(pack_event_file "$scenario")" 2>/dev/null)
  git -C "$dir" -c user.email=demo@launchdarkly.com -c user.name="LaunchDarkly Demo" \
    commit -q -m "${title:-feat: $scenario}"
  git -C "$dir" push -q --force-with-lease origin "$branch" 2>/dev/null \
    || git -C "$dir" push -q --force origin "$branch" 2>/dev/null \
    || { echo "  could not push $branch to $(target_slug)"; return 1; }
  printf '%s' "$branch"
}
