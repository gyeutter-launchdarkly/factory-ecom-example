#!/usr/bin/env bash
# One action after an approved factory run: merge the PR, deploy the merged
# SHA to the local "production" store, and start + observe the guarded release.
# The journey's Guard release and Production circles fill from what this
# actually verifies — merge, served SHA, and the LaunchDarkly rollout outcome.
#
# Usage: ./demo/release-live.sh <scenario> <pr-number> [run-id]
#   run-id defaults to the scenario's most recent run in the progress stream.
#
# Needs in .env.local: LD_API_KEY, LD_APP_PROJECT_KEY, BEACON_URL,
# BEACON_WEBHOOK_SECRET. FACTORY_STORE_URL defaults to http://127.0.0.1:3109.
# The release flag key is read from the PR's .release-flags manifest, so this
# works for any scenario without editing configuration.
set -euo pipefail

cd "$(dirname "$0")/.."

SCENARIO="${1:-}"
PR="${2:-}"
RUN="${3:-}"
[[ -n "$SCENARIO" && "$PR" =~ ^[0-9]+$ ]] || {
  echo "usage: ./demo/release-live.sh <scenario> <pr-number> [run-id]"
  exit 2
}

set -a
# shellcheck disable=SC1091
[[ -f .env.local ]] && source .env.local
set +a
STORE="${FACTORY_STORE_URL:-http://127.0.0.1:3109}"
PORT="${STORE##*:}"
DEPLOY_DIR=".autofactory/deploy/app"
SLUG=$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
G() { env -u GH_TOKEN -u GITHUB_TOKEN gh "$@"; }

if [[ -z "$RUN" ]]; then
  RUN=$(jq -rs --arg s "$SCENARIO" \
    '[.[] | select(.t=="run-start" and .scenario==$s)] | last | .run // empty' \
    .autofactory/runs.ndjson 2>/dev/null)
  [[ -n "$RUN" ]] || { echo "No run found for '$SCENARIO'; pass a run id."; exit 2; }
fi
echo "» run: $RUN"

# 1. Merge (a re-run against an already-merged PR just re-verifies it).
if [[ "$(G api "repos/$SLUG/pulls/$PR" --jq .merged)" != "true" ]]; then
  echo "» merging PR #$PR"
  G pr merge "$PR" --repo "$SLUG" --squash
  sleep 3
fi
SHA=$(G api "repos/$SLUG/pulls/$PR" --jq .merge_commit_sha)
echo "» merged SHA: $SHA"

# The flag under release comes from the PR's own manifest — never a guess.
FLAG=$(G api "repos/$SLUG/contents/.release-flags/pr-$PR.json?ref=$SHA" \
  --jq .content | base64 -d | jq -r .flagKey)
[[ -n "$FLAG" && "$FLAG" != "null" ]] || { echo "PR #$PR has no release manifest."; exit 1; }
echo "» release flag: $FLAG"

# 2. Deploy that SHA to the local production store. A detached worktree keeps
# the demo checkout untouched; DEPLOY_SHA is what /api/status reports back.
FACTORY_SYNC_RUNNING=1 git fetch --quiet origin main
if [[ -d "$DEPLOY_DIR" ]]; then
  FACTORY_SYNC_RUNNING=1 git -C "$DEPLOY_DIR" checkout --quiet --detach "$SHA"
else
  FACTORY_SYNC_RUNNING=1 git worktree add --quiet --detach "$DEPLOY_DIR" "$SHA"
fi
cp .env.local "$DEPLOY_DIR/.env.local"
echo "» building the store at $SHA (a few minutes)"
(cd "$DEPLOY_DIR" && npm ci --no-audit --no-fund --silent && npm run build --silent) \
  > .autofactory/deploy/build.log 2>&1 \
  || { echo "Build failed; see .autofactory/deploy/build.log"; exit 1; }

if [[ -f .autofactory/deploy/store.pid ]]; then
  kill -- -"$(cat .autofactory/deploy/store.pid)" 2>/dev/null || true
  rm -f .autofactory/deploy/store.pid
  sleep 1
fi
(cd "$DEPLOY_DIR" && DEPLOY_SHA="$SHA" setsid node node_modules/next/dist/bin/next start \
  --hostname 127.0.0.1 --port "$PORT" > ../deploy/store.log 2>&1 & echo $! > ../deploy/store.pid)
for _ in $(seq 1 30); do
  [[ "$(curl -s "$STORE/api/status" | jq -r .version 2>/dev/null)" == "$SHA" ]] && break
  sleep 2
done
[[ "$(curl -s "$STORE/api/status" | jq -r .version)" == "$SHA" ]] \
  || { echo "Deployed store did not come up on $STORE"; exit 1; }
echo "» deployed: $STORE serves $SHA"

# 3. Beacon must be up to receive the deploy notification.
if ! curl -sf "${BEACON_URL:?BEACON_URL missing from .env.local}/health" >/dev/null; then
  echo "Beacon is not answering at $BEACON_URL."
  echo "Start it from the AutoFactory repo (config/services.yaml knows checkout-demo):"
  echo "  cd \${AUTOFACTORY_DIR:-~/Documents/launchdarkly-auto-factory} &&"
  echo "  BEACON_WEBHOOK_SECRET=… LD_API_KEY=… LD_PROJECT_KEY=$LD_APP_PROJECT_KEY PORT=${BEACON_URL##*:} \\"
  echo "    node_modules/.bin/tsx packages/beacon/src/server.ts"
  exit 1
fi

# 4. Verify + notify + observe: fills Guard release and Production with the
# real rollout outcome. Rollback stays a stopped release.
echo "» observing the guarded release (ctrl-c stops watching, not the rollout)"
FACTORY_STORE_URL="$STORE" FACTORY_RELEASE_FLAG="$FLAG" \
  node --env-file-if-exists=.env.local demo/observe-release.mjs \
  "$SCENARIO" "$SLUG" "$PR" "$RUN" --notify
