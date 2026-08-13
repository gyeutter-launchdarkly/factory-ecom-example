#!/usr/bin/env bash
# LaunchDarkly Factory Demo - setup wizard
#
# One-liners:
#   Fresh clone:  bash <(curl -fsSL https://raw.githubusercontent.com/gyeutter-launchdarkly/factory-ecom-example/main/demo/setup.sh)
#   Already here: bash demo/setup.sh
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
      LD_APP_PROJECT_KEY|LD_ENVIRONMENT_KEY|LD_API_KEY|LD_SDK_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|LD_FACTORY_PROJECT_KEY|LD_FACTORY_SDK_KEY)
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
LD_FACTORY_PROJECT_KEY=${LD_FACTORY_PROJECT_KEY}
LD_FACTORY_SDK_KEY=${LD_FACTORY_SDK_KEY:-placeholder}
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

  if ! command -v gh &>/dev/null; then
    warn "gh CLI not installed, so the GitHub Action was not configured."
    echo -e "  ${D}'make ci' works now. For 'make run' (real PRs), either install gh"
    echo -e "  (brew install gh) and re-run this script, or set these by hand at"
    echo -e "  https://github.com/${slug}/settings/secrets/actions :${R}"
    echo -e "  ${D}  secret   LD_SDK_KEY          = <factory project SDK key>"
    echo -e "  ${D}  secret   LD_API_KEY          = <your LD API token>"
    echo -e "  ${D}  secret   ANTHROPIC_API_KEY   = <your Anthropic key>"
    echo -e "  ${D}  variable LD_APP_PROJECT_KEY  = ${LD_APP_PROJECT_KEY}${R}"
    return 0
  fi

  if ! GH_TOKEN="$GITHUB_TOKEN" gh auth status &>/dev/null; then
    warn "gh is installed but the token was not accepted; skipping."
    echo -e "  ${D}'make ci' still works. Check the PAT has repo access.${R}"
    return 0
  fi

  # LD_SDK_KEY here is the FACTORY project's key, matching the workflow.
  local failed=0
  _gh_secret() {
    printf '%s' "$2" \
      | GH_TOKEN="$GITHUB_TOKEN" gh secret set "$1" --repo "$slug" --body-file - &>/dev/null \
      && ok "secret $1" || { warn "could not set secret $1"; failed=1; }
  }
  _gh_secret LD_SDK_KEY "$LD_FACTORY_SDK_KEY"
  _gh_secret LD_API_KEY "$LD_API_KEY"
  _gh_secret ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"

  GH_TOKEN="$GITHUB_TOKEN" gh variable set LD_APP_PROJECT_KEY \
    --repo "$slug" --body "$LD_APP_PROJECT_KEY" &>/dev/null \
    && ok "variable LD_APP_PROJECT_KEY" || { warn "could not set LD_APP_PROJECT_KEY"; failed=1; }

  if [[ "$failed" -eq 0 ]]; then
    ok "GitHub Action configured; 'make run' is ready"
  else
    warn "Some GitHub settings failed; 'make ci' still works."
  fi
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

for arg in "$@"; do [[ "$arg" == "--local" ]] && IN_REPO=true; done

# banner
clear
echo -e "${B}"
echo "  +--------------------------------------------------+"
echo "  |        LaunchDarkly Factory Demo                 |"
echo "  +--------------------------------------------------+"
echo -e "${R}"
echo -e "  ${D}What you'll need:${R}"
echo -e "  ${D}  - LaunchDarkly demo app project (where flags get created)${R}"
echo -e "  ${D}  - LaunchDarkly factory project with Guardian & AgentControl${R}"
echo -e "  ${D}  - Anthropic API Key${R}"
echo -e "  ${D}  - GitHub access${R}"
echo -e "  ${D}  - Optional: gh CLI, to auto-configure the GitHub Action${R}"
echo ""
if $IN_REPO; then
  echo -e "${D}  Mode: already in repo, skipping clone${R}"
else
  echo -e "${D}  Mode: fresh install, will clone repo first${R}"
fi

# preflight
step "Preflight"
for cmd in git curl docker; do
  command -v "$cmd" &>/dev/null && ok "$cmd" || die "$cmd is required but not installed"
done
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

ask_secret LD_SDK_KEY \
  "LaunchDarkly SDK key (app project: ${LD_APP_PROJECT_KEY})" \
  "The demo app uses this to evaluate flags.\n  https://app.launchdarkly.com/settings/sdk-keys?projKey=${LD_APP_PROJECT_KEY}&envKey=${LD_ENVIRONMENT_KEY:-production}"

# The factory reads its agent definitions (AI configs) from a SEPARATE project.
# This is a different SDK key from the one above; using the app project's key
# here makes the factory fail to resolve its agent graph.
ask_text LD_FACTORY_PROJECT_KEY \
  "LaunchDarkly factory project key" \
  "The project holding the AutoFactory AI configs (not the demo app project)" \
  "${LD_FACTORY_PROJECT_KEY:-}"
LD_FACTORY_PROJECT_KEY=$(echo "$LD_FACTORY_PROJECT_KEY" \
  | sed -E 's|https?://app\.launchdarkly\.com/projects/([^/?]+).*|\1|')

ask_secret LD_FACTORY_SDK_KEY \
  "LaunchDarkly SDK key (factory project: ${LD_FACTORY_PROJECT_KEY})" \
  "The factory uses this to read its agent AI configs.\n  https://app.launchdarkly.com/settings/sdk-keys?projKey=${LD_FACTORY_PROJECT_KEY}&envKey=${LD_ENVIRONMENT_KEY:-production}"

ask_secret ANTHROPIC_API_KEY \
  "Anthropic API key" \
  "https://console.anthropic.com/settings/keys"

ask_secret GITHUB_TOKEN \
  "GitHub personal access token" \
  "https://github.com/settings/personal-access-tokens/new\n  Permissions:\n    Contents:      Read and write\n    Pull requests: Read and write"

write_env

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
echo "  |   All set!  Launching demo app...                |"
echo "  |                                                  |"
echo "  |   App       ->  http://localhost:3000            |"
echo "  |   Factory   ->  make ci SCENARIO=dynamic-pricing |"
echo "  +--------------------------------------------------+"
echo -e "${R}"
make dev
