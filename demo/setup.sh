#!/usr/bin/env bash
# LaunchDarkly Factory Demo - setup wizard
#
# One-liners:
#   Fresh clone:  bash <(curl -fsSL https://raw.githubusercontent.com/gyeutter-launchdarkly/factory-ecom-example/main/demo/setup.sh)
#   Already here: bash demo/setup.sh
#
# Flags:
#   --fresh      ask nothing at all: keep saved credentials, reset
#   --no-reset   keep the current demo state (skip the reset)
#   --reset      same as the default; kept so older notes still work
set -euo pipefail

REPO_URL="https://github.com/gyeutter-launchdarkly/factory-ecom-example.git"
REPO_DIR="factory-ecom-example"

# colors
B='\033[1m'; D='\033[2m'; R='\033[0m'
BL='\033[34m'; WH='\033[97m'; GR='\033[32m'; YE='\033[33m'; RE='\033[31m'

# helpers
step() { echo -e "\n${BL}${B}$1${R}"; }
ok()   { echo -e "  ${GR}v${R}  $1"; }
warn() { echo -e "  ${YE}!${R}  $1"; }
die()  { echo -e "\n${RE}${B}x  $1${R}\n"; exit 1; }

mask() {
  local s="$1" len
  len="${#s}"
  if (( len <= 8 )); then echo "****"; else echo "${s:0:4}****${s: -4}"; fi
}

# Load existing .env.local into shell variables (best-effort)
load_env() {
  [[ -f .env.local ]] || return 0
  while IFS='=' read -r key val; do
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${key// }" ]] && continue
    case "$key" in
      LD_APP_PROJECT_KEY|LD_ENVIRONMENT_KEY|LD_API_KEY|LD_SDK_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN)
        printf -v "$key" '%s' "$val" ;;
    esac
  done < .env.local
}

# ask_secret VARNAME "Label" "URL/hint"
# shows masked current value and offers keep/replace
ask_secret() {
  local __var="$1" __label="$2" __hint="$3"
  local __cur="${!__var:-}" __val=""
  if $ASSUME_KEEP && [[ -n "$__cur" && "$__cur" != "placeholder" ]]; then
    ok "$__label (saved)"
    return
  fi
  echo -e "\n  ${B}$__label${R}"
  if [[ -n "$__cur" && "$__cur" != "placeholder" ]]; then
    echo -e "  ${D}current  $(mask "$__cur")${R}"
    local __ans=""
    read -r -p "  keep? [Y/n] " __ans </dev/tty
    [[ "${__ans:-Y}" =~ ^[Nn]$ ]] || { ok "keeping $__label"; return; }
  fi
  echo -e "  ${D}$__hint${R}"
  read -r -s -p "  > " __val </dev/tty; echo ""
  [[ -z "$__val" ]] && die "$__label is required"
  printf -v "$__var" '%s' "$__val"
}

# ask_text VARNAME "Label" "hint" "default"
# shows current value and offers keep/replace
ask_text() {
  local __var="$1" __label="$2" __hint="$3" __default="${4:-}"
  local __cur="${!__var:-$__default}" __val=""
  if $ASSUME_KEEP && [[ -n "$__cur" ]]; then
    ok "$__label ($__cur)"
    return
  fi
  echo -e "\n  ${B}$__label${R}"
  echo -e "  ${D}$__hint${R}"
  if [[ -n "$__cur" ]]; then
    echo -e "  ${D}current  $__cur${R}"
    local __ans=""
    read -r -p "  keep? [Y/n] " __ans </dev/tty
    [[ "${__ans:-Y}" =~ ^[Nn]$ ]] || { ok "keeping $__label ($__cur)"; return; }
  fi
  read -r -p "  > [${__default}] " __val </dev/tty
  __val="${__val:-$__default}"
  [[ -z "$__val" ]] && die "$__label is required"
  printf -v "$__var" '%s' "$__val"
}

write_env() {
  cat > .env.local <<EOF
LD_APP_PROJECT_KEY=${LD_APP_PROJECT_KEY}
LD_ENVIRONMENT_KEY=${LD_ENVIRONMENT_KEY:-production}
LD_API_KEY=${LD_API_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
GITHUB_TOKEN=${GITHUB_TOKEN}
LD_SDK_KEY=${LD_SDK_KEY:-placeholder}
EOF
  ok "wrote .env.local"
}

# Configure the GitHub Action's secrets and variables so `make run` (real PRs)
# works without visiting the repo settings UI.
#
# Secrets must be sealed-box encrypted with the repo's public key, which plain
# curl cannot do — so this needs the `gh` CLI. Without it we print the exact
# commands rather than pretending it is done. `make ci` does not need any of
# this; it reads .env.local directly.
configure_github() {
  local slug
  slug=$(git remote get-url origin 2>/dev/null \
    | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##' || true)
  if [[ -z "$slug" ]]; then
    warn "No git remote found; skipping GitHub Action setup (make ci still works)."
    return 0
  fi

  echo -e "\n  ${D}Configuring GitHub Action secrets for ${slug}...${R}"

  # Writing Actions secrets and variables needs permissions the demo PAT does not
  # carry (it has Contents + Pull requests only). gh is authenticated separately
  # by `gh auth login`, and that session does, so use it rather than the PAT.
  # Clear GH_TOKEN/GITHUB_TOKEN: gh prefers them over its keyring, and the demo
  # PAT cannot write Actions secrets or variables.
  gh_keyring() { env -u GH_TOKEN -u GITHUB_TOKEN gh "$@"; }

  if ! gh_keyring auth status &>/dev/null; then
    warn "gh is not logged in, so the GitHub Action was not configured."
    echo -e "  ${D}Run 'gh auth login', then re-run this script."
    echo -e "  'make ci' works regardless; see docs/MANUAL-SETUP.md to set them by hand.${R}"
    return 0
  fi

  local failed=0
  # gh reads the value from stdin when no --body is given. Avoid --body-file:
  # not every gh version has it, and avoid --body: the value would appear in the
  # process list.
  _gh_secret() {
    local err
    if err=$(printf '%s' "$2" | gh_keyring secret set "$1" --repo "$slug" 2>&1); then
      ok "secret $1"
    else
      warn "could not set secret $1: ${err//$'\n'/ }"
      failed=1
    fi
  }
  _gh_secret LD_SDK_KEY "$LD_SDK_KEY"
  _gh_secret LD_API_KEY "$LD_API_KEY"
  _gh_secret ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"

  gh_keyring variable set LD_APP_PROJECT_KEY \
    --repo "$slug" --body "$LD_APP_PROJECT_KEY" &>/dev/null \
    && ok "variable LD_APP_PROJECT_KEY" || { warn "could not set LD_APP_PROJECT_KEY"; failed=1; }

  if [[ "$failed" -eq 0 ]]; then
    ok "GitHub Action configured; 'make run' is ready"
  else
    warn "Some GitHub settings failed; 'make ci' still works."
  fi
}


# Put the demo back to a clean state: delete the flags and metrics the factory
# created, close open feature PRs, and rewind the feature branches to their seed
# tags. Same work as `make reset`, offered here so re-running this script is the
# only command you need between demos.
reset_demo() {
  step "Resetting the demo"
  echo -e "${D}  Deletes auto-factory flags + metrics, closes feature PRs,"
  echo -e "  rewinds feature branches. Your project and seed flag are kept.${R}\n"
  make reset
}

# The factory's own control plane (agent graph, AI configs, operational flags)
# must already exist in the project. This script does NOT create it: that is the
# factory repo's bootstrap. Without it the chain has nothing to execute and exits
# almost immediately, so check and say so plainly rather than let a demo fail.
FACTORY_DIRS=(
  "../launchdarkly-auto-factory"
  "$HOME/Documents/launchdarkly-auto-factory"
)

check_factory_graph() {
  local code
  code=$(/usr/bin/curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: ${LD_API_KEY}" \
    "https://app.launchdarkly.com/api/v2/flags/${LD_APP_PROJECT_KEY}/gha-auto-factory" 2>/dev/null || echo "000")

  if [[ "$code" == "200" ]]; then
    ok "AutoFactory agent graph present in ${LD_APP_PROJECT_KEY}"
    return 0
  fi

  warn "Project '${LD_APP_PROJECT_KEY}' has no AutoFactory agent graph (HTTP ${code})."
  echo -e "  ${D}The agents live in LaunchDarkly as AI configs plus a 'gha-auto-factory'"
  echo -e "  graph. Until they exist, a factory run starts and exits with no output.${R}"

  local dir=""
  for d in "${FACTORY_DIRS[@]}"; do
    [[ -f "$d/bootstrap/create.mjs" ]] && { dir="$d"; break; }
  done

  if [[ -z "$dir" ]]; then
    echo -e "  ${D}Clone the factory repo and bootstrap it against this project:"
    echo -e "    git clone https://github.com/launchdarkly-labs/launchdarkly-auto-factory"
    echo -e "    cd launchdarkly-auto-factory && npm install && npm run build"
    echo -e "    printf 'LD_API_KEY=%s\\nLD_PROJECT_KEY=%s\\nLD_APP_PROJECT_KEY=%s\\n' \\"
    echo -e "      \"\$LD_API_KEY\" ${LD_APP_PROJECT_KEY} ${LD_APP_PROJECT_KEY} > .env"
    echo -e "    node packages/config-bridge/dist/cli.js provision${R}"
    return 1
  fi

  echo ""
  local ans=""
  read -r -p "  Found the factory at ${dir}. Bootstrap it now? [Y/n] " ans </dev/tty
  [[ "${ans:-Y}" =~ ^[Nn]$ ]] && return 1

  (
    cd "$dir" || exit 1
    if [[ ! -f packages/config-bridge/dist/cli.js ]]; then
      echo -e "  ${D}building the factory tool (first run only)...${R}"
      npm install --silent >/dev/null 2>&1 || true
      npm run build >/dev/null 2>&1 || true
    fi
    [[ -f packages/config-bridge/dist/cli.js ]] || { echo "  build failed; bootstrap by hand"; exit 1; }
    printf 'LD_API_KEY=%s\nLD_PROJECT_KEY=%s\nLD_APP_PROJECT_KEY=%s\n' \
      "$LD_API_KEY" "$LD_APP_PROJECT_KEY" "$LD_APP_PROJECT_KEY" > .env
    chmod 600 .env
    node packages/config-bridge/dist/cli.js provision
  ) && ok "factory control plane provisioned" || { warn "bootstrap failed; see output above"; return 1; }
}

# Create (or confirm) the AutoFactory view and link the factory's flags to it.
# LD views organise by explicit resource links, not by a tag filter, which is why
# an earlier attempt at /flag-filters 404d.
# shellcheck source=lib/link-view.sh
source demo/lib/link-view.sh

create_ld_view() {
  echo -e "\n  ${D}Syncing the AutoFactory view in LaunchDarkly...${R}"
  ld_view_sync
}

# detect mode
# Skip clone if: (a) already inside the repo, (b) repo dir exists here,
#                (c) script is being run from inside the repo tree
IN_REPO=false

# Case (a): running from inside factory-ecom-example
if grep -qs "factory-ecom-example" .git/config 2>/dev/null; then
  IN_REPO=true

# Case (b): repo already cloned as a subdirectory of CWD
elif [[ -d "$REPO_DIR/.git" ]]; then
  cd "$REPO_DIR"
  IN_REPO=true

# Case (c): script path is inside the repo (e.g. bash demo/setup.sh from repo root)
elif [[ -f "$(dirname "$0")/../.git/config" ]] && \
     grep -qs "factory-ecom-example" "$(dirname "$0")/../.git/config" 2>/dev/null; then
  cd "$(dirname "$0")/.."
  IN_REPO=true
fi

DO_RESET=false
NO_RESET=false
ASSUME_KEEP=false
for arg in "$@"; do
  case "$arg" in
    --local)    IN_REPO=true ;;
    --reset)    DO_RESET=true ;;
    --no-reset) NO_RESET=true ;;
    # One command to get a clean demo: reset, reuse saved credentials, no prompts.
    --fresh)    DO_RESET=true; ASSUME_KEEP=true ;;
  esac
done

# The LaunchDarkly mark as a dot matrix, sampled from the official 96x96
# icon (launchdarkly.com/icon.png) at terminal aspect ratio.
ld_banner() {
  echo ""
  echo -e "  ${WH}             ··            ${R}"
  echo -e "  ${WH}              ···          ${R}"
  echo -e "  ${WH}        ··     ····        ${R}"
  echo -e "  ${WH}        ······   ····      ${R}${B}LaunchDarkly AutoFactory${R}"
  echo -e "  ${WH}            ···········    ${R}${B}Demo TUI${R}"
  echo -e "  ${WH}              ···········  ${R}"
  echo -e "  ${WH}·························· ${R}"
  echo -e "  ${WH}            ·············  ${R}"
  echo -e "  ${WH}            ···········    ${R}"
  echo -e "  ${WH}         ······  ····      ${R}"
  echo -e "  ${WH}        ··     ····        ${R}"
  echo -e "  ${WH}              ···          ${R}"
  echo -e "  ${WH}             ··            ${R}"
  echo ""
}

# banner
clear
ld_banner
echo -e "  ${D}What you'll need:${R}"
echo -e "  ${D}  LaunchDarkly${R}"
echo -e "  ${D}    - Existing project${R}"
echo -e "  ${D}      (workspace needs Guarded Releases + AgentControl)${R}"
echo -e "  ${D}    - SDK key${R}"
echo -e "  ${D}    - API token (Admin)${R}"
echo -e "  ${D}  Anthropic API key${R}"
echo -e "  ${D}  GitHub PAT${R}"
echo -e "  ${D}  Docker installed and running${R}"
echo -e "  ${D}    (Docker Desktop or Colima)${R}"
echo -e "  ${D}  gh CLI installed${R}"
echo ""
if $IN_REPO; then
  echo -e "${D}  Mode: already in repo, skipping clone${R}"
else
  echo -e "${D}  Mode: fresh install, will clone repo first${R}"
fi

# preflight
step "Preflight"
for cmd in git curl docker jq gh; do
  command -v "$cmd" &>/dev/null && ok "$cmd" || die "$cmd is required but not installed"
done
env -u GH_TOKEN -u GITHUB_TOKEN gh auth status &>/dev/null && ok "gh authenticated" \
  || warn "gh is installed but not logged in; run 'gh auth login' for GitHub setup"
docker info &>/dev/null 2>&1 && ok "Docker running" \
  || die "Docker is not running. Start Docker Desktop first."

# clone (if needed)
if ! $IN_REPO; then
  step "Clone"
  if [[ -d "$REPO_DIR/.git" ]]; then
    warn "'$REPO_DIR' already exists, skipping clone"
  else
    git clone "$REPO_URL" "$REPO_DIR" --quiet && ok "cloned into $REPO_DIR"
  fi
  cd "$REPO_DIR"
fi

# load existing creds
load_env

# credentials
# Saved credentials are the common case on a re-run, so ask once rather than
# once per value. Default is to keep them.
if ! $ASSUME_KEEP && [[ -f .env.local && -n "${LD_API_KEY:-}" && -n "${LD_SDK_KEY:-}" ]]; then
  echo ""
  creds_ans=""
  read -r -p "  Credentials already exist, update them? [y/N] " creds_ans </dev/tty
  [[ "$creds_ans" =~ ^[Yy]$ ]] || ASSUME_KEEP=true
fi

step "Step 1 / 2 - Credentials"

ask_text LD_APP_PROJECT_KEY \
  "LaunchDarkly project key" \
  "Paste the URL of your project. You can also get your project key from Project Settings > General > Key" \
  "${LD_APP_PROJECT_KEY:-}"
# Accept a pasted URL and extract the key
LD_APP_PROJECT_KEY=$(echo "$LD_APP_PROJECT_KEY" \
  | sed -E 's|https?://app\.launchdarkly\.com/projects/([^/?]+).*|\1|')

ask_text LD_ENVIRONMENT_KEY \
  "LaunchDarkly environment key" \
  "The environment the demo app will use (e.g. production, test)" \
  "${LD_ENVIRONMENT_KEY:-production}"

ask_secret LD_API_KEY \
  "LaunchDarkly API key" \
  "https://app.launchdarkly.com/settings/authorization\n  Role: Admin"

# One project holds both the app's flags and the factory's own AI configs and
# operational flags, so a single SDK key serves both.
ask_secret LD_SDK_KEY \
  "LaunchDarkly SDK key" \
  "Used by the app to evaluate flags, and by the factory to read its AI configs.\n  https://app.launchdarkly.com/settings/sdk-keys?projKey=${LD_APP_PROJECT_KEY}&envKey=${LD_ENVIRONMENT_KEY:-production}"

ask_secret ANTHROPIC_API_KEY \
  "Anthropic API key" \
  "https://console.anthropic.com/settings/keys"

ask_secret GITHUB_TOKEN \
  "GitHub personal access token" \
  "https://github.com/settings/personal-access-tokens/new\n  Permissions:\n    Contents:      Read and write\n    Pull requests: Read and write"

write_env

# Always start from a clean demo. Re-running this script is how you reset, so it
# does not ask; --no-reset keeps the current state.
if ! $NO_RESET; then
  reset_demo
fi

# terraform
step "Step 2 / 2 - Provision seed flag + LD View"
echo -e "${D}  make setup  (Terraform in Docker, creates seed flag in your existing project)${R}\n"
make setup
check_factory_graph || true
create_ld_view
configure_github

# done
echo ""
echo -e "${GR}${B}"
echo "  +--------------------------------------------------+"
echo "  |   Ready. Starting the app...                     |"
echo "  +--------------------------------------------------+"
echo -e "${R}"

# Start detached and hand over to the demo menu, so scenarios can be run from
# here rather than dropping back to the shell for `make ci`/`make run`.
docker compose up -d --build
./demo/open-app.sh || true
exec ./demo/menu.sh
