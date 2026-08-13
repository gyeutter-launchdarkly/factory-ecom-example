#!/usr/bin/env bash
# LaunchDarkly Factory Demo - setup wizard
#
# One-liners:
#   Fresh clone:  bash <(curl -fsSL https://raw.githubusercontent.com/gyeutter-launchdarkly/factory-ecom-example/main/demo/setup.sh)
#   Already here: bash demo/setup.sh
#
# Flags:
#   --reset      reset the demo first, without asking
#   --no-reset   skip the reset prompt entirely
set -euo pipefail

REPO_URL="https://github.com/gyeutter-launchdarkly/factory-ecom-example.git"
REPO_DIR="factory-ecom-example"

# colors
B='\033[1m'; D='\033[2m'; R='\033[0m'
BL='\033[34m'; GR='\033[32m'; YE='\033[33m'; RE='\033[31m'

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

# Create (or confirm) an 'AutoFactory' saved view in the LD flag list
create_ld_view() {
  echo -e "\n  ${D}Creating AutoFactory saved view in LaunchDarkly...${R}"
  local body
  body=$(printf '{"name":"AutoFactory","description":"Flags and metrics created by the LaunchDarkly AutoFactory","filters":[{"attribute":"tags","negate":false,"operator":"in","values":["auto-factory"]}]}')
  local code
  code=$(/usr/bin/curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "Authorization: ${LD_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "https://app.launchdarkly.com/api/v2/projects/${LD_APP_PROJECT_KEY}/flag-filters" 2>/dev/null || echo "000")
  case "$code" in
    200|201) ok "Created AutoFactory view" ;;
    409)     ok "AutoFactory view already exists" ;;
    *)       warn "Could not create LD view (HTTP $code) - in the LD UI: filter by tag auto-factory, then save as a view" ;;
  esac
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
for arg in "$@"; do
  case "$arg" in
    --local)    IN_REPO=true ;;
    --reset)    DO_RESET=true ;;
    --no-reset) NO_RESET=true ;;
  esac
done

# banner
clear
echo -e "${B}"
echo "  +--------------------------------------------------+"
echo "  |        LaunchDarkly Factory Demo                 |"
echo "  +--------------------------------------------------+"
echo -e "${R}"
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

# Re-run against an existing setup: offer to clean up first.
if $DO_RESET; then
  reset_demo
elif ! $NO_RESET && [[ -f .env.local ]] && [[ -n "${LD_API_KEY:-}" ]]; then
  echo ""
  ans=""
  read -r -p "  Reset the demo before setting up (delete factory flags, close PRs, rewind branches)? [y/N] " ans </dev/tty
  [[ "$ans" =~ ^[Yy]$ ]] && reset_demo
fi

# terraform
step "Step 2 / 2 - Provision seed flag + LD View"
echo -e "${D}  make setup  (Terraform in Docker, creates seed flag in your existing project)${R}\n"
make setup
create_ld_view
configure_github

# done
echo ""
echo -e "${GR}${B}"
echo "  +--------------------------------------------------+"
echo "  |   All set!  Starting the app...                  |"
echo "  +--------------------------------------------------+"
echo -e "${R}"

# Start detached and hand over to the demo menu, so scenarios can be run from
# here rather than dropping back to the shell for `make ci`/`make run`.
docker compose up -d --build
./demo/open-app.sh || true
exec ./demo/menu.sh
