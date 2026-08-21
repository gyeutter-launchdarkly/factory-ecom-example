#!/usr/bin/env bash
# Demo-pack discovery shared by the TUI and every runner.
# Customer packs live in .autofactory/packs (gitignored); the public repository
# ships only the generic default pack and this loader.

PACKS_DIR="${FACTORY_PACKS_DIR:-.autofactory/packs}"
if [[ -z "${DEMO_PACK:-}" && -f .autofactory/demo-settings ]]; then
  DEMO_PACK=$(awk -F= '$1 == "DEMO_PACK" { print $2; exit }' .autofactory/demo-settings)
fi
DEMO_PACK="${DEMO_PACK:-default}"

pack_dir() {
  [[ "$DEMO_PACK" == "default" ]] && printf '%s' "demo" || printf '%s' "$PACKS_DIR/$DEMO_PACK"
}

pack_manifest() {
  [[ "$DEMO_PACK" == "default" ]] && return 1
  printf '%s/pack.json' "$(pack_dir)"
}

pack_name() {
  if [[ "$DEMO_PACK" == "default" ]]; then
    echo "DarkCommerce"
  else
    jq -r '.name // .id // "Unnamed demo"' "$(pack_manifest)" 2>/dev/null
  fi
}

pack_visibility() {
  [[ "$DEMO_PACK" == "default" ]] && { echo "public"; return; }
  jq -r '.visibility // "private"' "$(pack_manifest)" 2>/dev/null
}

pack_events_dir() {
  [[ "$DEMO_PACK" == "default" ]] \
    && printf '%s' "demo/ci/events" \
    || printf '%s/events' "$(pack_dir)"
}

pack_recordings_dir() {
  [[ "$DEMO_PACK" == "default" ]] \
    && printf '%s' "demo/recordings" \
    || printf '%s/recordings' "$(pack_dir)"
}

pack_has_recordings() {
  compgen -G "$(pack_recordings_dir)/*.ndjson" >/dev/null
}

pack_event_file() {
  local file
  file="$(pack_events_dir)/$1.json"
  [[ -f "$file" ]] || return 1
  printf '%s' "$file"
}

pack_scenarios() {
  local f dir
  dir=$(pack_events_dir)
  for f in "$dir"/*.json; do
    [[ -e "$f" ]] || continue
    basename "$f" .json
  done | sort
}

pack_ids() {
  echo "default"
  local manifest
  for manifest in "$PACKS_DIR"/*/pack.json; do
    [[ -e "$manifest" ]] || continue
    jq -r '.id // empty' "$manifest" 2>/dev/null
  done | sort -u
}

pack_is_valid() {
  [[ "$1" == "default" ]] && return 0
  [[ "$1" =~ ^[a-z0-9-]{1,64}$ && -f "$PACKS_DIR/$1/pack.json" ]] || return 1
  jq -e --arg id "$1" \
    '.id == $id and (.name | type == "string")
     and (.visibility == "public" or .visibility == "private")' \
    "$PACKS_DIR/$1/pack.json" >/dev/null 2>&1
}

# A pack declared private must never open a PR in a public repository. This
# checks GitHub, not just the manifest: privacy cannot rest on self-reporting.
pack_assert_repo_policy() {
  [[ "$(pack_visibility)" == "private" ]] || return 0
  command -v gh >/dev/null || {
    echo "Private demo packs require gh so repository visibility can be verified."
    return 1
  }
  local visibility
  visibility=$(env -u GH_TOKEN -u GITHUB_TOKEN gh repo view --json visibility \
    --jq '.visibility' 2>/dev/null || true)
  if [[ "$visibility" != "PRIVATE" ]]; then
    echo "Refusing to publish private demo pack '$DEMO_PACK' to a ${visibility:-unverified} repository."
    echo "Run it locally, or use a private fork/remote."
    return 1
  fi
}
