#!/usr/bin/env bash
# Meridian × LaunchDarkly AutoFactory — setup wizard
#
# One-liners:
#   Fresh clone:  bash <(curl -fsSL https://raw.githubusercontent.com/gyeutter-launchdarkly/factory-ecom-example/main/demo/setup.sh)
#   Already here: bash demo/setup.sh
set -euo pipefail

REPO_URL="https://github.com/gyeutter-launchdarkly/factory-ecom-example.git"
REPO_DIR="factory-ecom-example"

# ── colors ────────────────────────────────────────────────────────────────────
B='\033[1m'; D='\033[2m'; R='\033[0m'
BL='\033[34m'; GR='\033[32m'; YE='\033[33m'; RE='\033[31m'

# ── helpers ───────────────────────────────────────────────────────────────────
step() { echo -e "\n${BL}${B}── $1 ──────────────────────────────────────${R}"; }
ok()   { echo -e "  ${GR}✓${R}  $1"; }
warn() { echo -e "  ${YE}!${R}  $1"; }
die()  { echo -e "\n${RE}${B}✗  $1${R}\n"; exit 1; }

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
      LD_APP_PROJECT_KEY|LD_API_KEY|LD_SDK_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN)
        printf -v "$key" '%s' "$val" ;;
    esac
  done < .env.local
}

# ask_secret VARNAME "Label" "URL/hint"
# — shows masked current value and offers keep/replace
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
  read -r -s -p "  → " __val </dev/tty; echo ""
  [[ -z "$__val" ]] && die "$__label is required"
  printf -v "$__var" '%s' "$__val"
}

# ask_text VARNAME "Label" "hint" "default"
# — shows current value and offers keep/replace
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
  read -r -p "  → [${__default}] " __val </dev/tty
  __val="${__val:-$__default}"
  [[ -z "$__val" ]] && die "$__label is required"
  printf -v "$__var" '%s' "$__val"
}

write_env() {
  cat > .env.local <<EOF
LD_APP_PROJECT_KEY=${LD_APP_PROJECT_KEY}
LD_API_KEY=${LD_API_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
GITHUB_TOKEN=${GITHUB_TOKEN}
LD_SDK_KEY=${LD_SDK_KEY:-placeholder}
EOF
  ok "wrote .env.local"
}

# ── detect mode ───────────────────────────────────────────────────────────────
# If we're already inside the repo (or --local passed), skip the clone step
IN_REPO=false
if grep -qs "factory-ecom-example" .git/config 2>/dev/null; then
  IN_REPO=true
fi
for arg in "$@"; do [[ "$arg" == "--local" ]] && IN_REPO=true; done

# ── banner ────────────────────────────────────────────────────────────────────
clear
echo -e "${B}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║   MERIDIAN  ×  LAUNCHDARKLY  AUTO FACTORY        ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${R}"
if $IN_REPO; then
  echo -e "${D}  Mode: already in repo — skipping clone${R}"
else
  echo -e "${D}  Mode: fresh install — will clone repo first${R}"
fi

# ── preflight ─────────────────────────────────────────────────────────────────
step "Preflight"
for cmd in git curl docker; do
  command -v "$cmd" &>/dev/null && ok "$cmd" || die "$cmd is required but not installed"
done
docker info &>/dev/null 2>&1 && ok "Docker running" \
  || die "Docker is not running — start Docker Desktop first"

# ── clone (if needed) ─────────────────────────────────────────────────────────
if ! $IN_REPO; then
  step "Clone"
  if [[ -d "$REPO_DIR/.git" ]]; then
    warn "'$REPO_DIR' already exists — skipping clone"
  else
    git clone "$REPO_URL" "$REPO_DIR" --quiet && ok "cloned into $REPO_DIR"
  fi
  cd "$REPO_DIR"
fi

# ── load existing creds ───────────────────────────────────────────────────────
load_env

# ── credentials ───────────────────────────────────────────────────────────────
step "Step 1 / 3 — Credentials"

ask_text LD_APP_PROJECT_KEY \
  "LaunchDarkly project key" \
  "A new LD project will be created with this key" \
  "factory-ecom-example"

ask_secret LD_API_KEY \
  "LaunchDarkly API key" \
  "https://app.launchdarkly.com/settings/authorization → Create token (Admin)"

ask_secret ANTHROPIC_API_KEY \
  "Anthropic API key" \
  "https://console.anthropic.com/settings/keys"

ask_secret GITHUB_TOKEN \
  "GitHub personal access token" \
  "https://github.com/settings/tokens → Fine-grained → repo, pull_requests, checks (write)"

write_env

# ── terraform ─────────────────────────────────────────────────────────────────
step "Step 2 / 3 — Provision LaunchDarkly resources"
echo -e "${D}  make setup  (Terraform in Docker — may pull image on first run)${R}\n"
make setup

# ── sdk key ───────────────────────────────────────────────────────────────────
step "Step 3 / 3 — SDK key"
echo ""
echo -e "  ${B}Open the URL printed above${R}"
echo -e "  ${D}Environments → Production → SDK key → '...' → Copy${R}"

ask_secret LD_SDK_KEY \
  "LaunchDarkly SDK key  (Production)" \
  "Paste the sdk-*** key from the URL above"

write_env

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GR}${B}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║   All set!  Launching demo app…                  ║"
echo "  ║                                                  ║"
echo "  ║   App  →  http://localhost:3000                  ║"
echo "  ║                                                  ║"
echo "  ║   Run the factory:                               ║"
echo "  ║     make ci SCENARIO=dynamic-pricing             ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${R}"
make dev
