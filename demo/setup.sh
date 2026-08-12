#!/usr/bin/env bash
# Meridian × LaunchDarkly AutoFactory — first-time setup wizard
# Usage (one-liner):
#   bash <(curl -fsSL https://raw.githubusercontent.com/gyeutter-launchdarkly/factory-ecom-example/main/demo/setup.sh)
set -euo pipefail

REPO_URL="https://github.com/gyeutter-launchdarkly/factory-ecom-example.git"
REPO_DIR="factory-ecom-example"

# ── colors ────────────────────────────────────────────────────────────────────
B='\033[1m'      # bold
D='\033[2m'      # dim
R='\033[0m'      # reset
BL='\033[34m'    # blue
GR='\033[32m'    # green
YE='\033[33m'    # yellow
RE='\033[31m'    # red

# ── helpers ───────────────────────────────────────────────────────────────────
step() { echo -e "\n${BL}${B}── $1 ──────────────────────────────────────${R}"; }
ok()   { echo -e "  ${GR}✓${R} $1"; }
warn() { echo -e "  ${YE}!${R} $1"; }
die()  { echo -e "\n${RE}${B}✗ $1${R}\n"; exit 1; }

ask_secret() {
  # ask_secret VARNAME "Label" "Hint / URL"
  local __var="$1" __label="$2" __hint="$3" __val=""
  echo -e "\n${B}$__label${R}"
  echo -e "${D}  $__hint${R}"
  read -r -s -p "  → " __val </dev/tty
  echo ""
  [[ -z "$__val" ]] && die "$__label is required"
  printf -v "$__var" '%s' "$__val"
}

ask_text() {
  # ask_text VARNAME "Label" "Hint" "default"
  local __var="$1" __label="$2" __hint="$3" __default="${4:-}" __val=""
  echo -e "\n${B}$__label${R}"
  echo -e "${D}  $__hint${R}"
  [[ -n "$__default" ]] && echo -e "${D}  (leave blank to use: $__default)${R}"
  read -r -p "  → " __val </dev/tty
  __val="${__val:-$__default}"
  [[ -z "$__val" ]] && die "$__label is required"
  printf -v "$__var" '%s' "$__val"
}

# ── banner ────────────────────────────────────────────────────────────────────
clear
echo -e "${B}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║   MERIDIAN  ×  LAUNCHDARKLY  AUTO FACTORY        ║"
echo "  ║   First-time setup                               ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${R}"
echo -e "${D}  This wizard will:${R}"
echo -e "${D}   1. Clone the demo repo${R}"
echo -e "${D}   2. Ask for your API keys${R}"
echo -e "${D}   3. Provision LaunchDarkly resources via Terraform (Docker)${R}"
echo -e "${D}   4. Ask for the SDK key that Terraform just created${R}"
echo -e "${D}   5. Launch the app at http://localhost:3000${R}"

# ── preflight ─────────────────────────────────────────────────────────────────
step "Preflight"
for cmd in git curl docker; do
  command -v "$cmd" &>/dev/null && ok "$cmd found" || die "$cmd is required but not installed"
done
docker info &>/dev/null 2>&1 && ok "Docker is running" || die "Docker is not running — start Docker Desktop first"

# ── clone ─────────────────────────────────────────────────────────────────────
step "Clone repo"
if [[ -d "$REPO_DIR/.git" ]]; then
  warn "Directory '$REPO_DIR' already exists — skipping clone"
else
  git clone "$REPO_URL" "$REPO_DIR" --quiet && ok "Cloned into $REPO_DIR"
fi
cd "$REPO_DIR"

# ── credentials ───────────────────────────────────────────────────────────────
step "Step 1 / 3 — API Keys"

ask_text LD_APP_PROJECT_KEY \
  "LaunchDarkly project key" \
  "A new LD project will be created with this key" \
  "factory-ecom-example"

ask_secret LD_API_KEY \
  "LaunchDarkly API key" \
  "https://app.launchdarkly.com/settings/authorization → Create token (Admin role)"

ask_secret ANTHROPIC_API_KEY \
  "Anthropic API key" \
  "https://console.anthropic.com/settings/keys"

ask_secret GITHUB_TOKEN \
  "GitHub personal access token" \
  "https://github.com/settings/tokens → Fine-grained → repo, pull_requests, checks (write)"

# Write .env.local with a placeholder SDK key — filled in after Terraform runs
cat > .env.local <<EOF
LD_APP_PROJECT_KEY=${LD_APP_PROJECT_KEY}
LD_API_KEY=${LD_API_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
GITHUB_TOKEN=${GITHUB_TOKEN}
LD_SDK_KEY=placeholder
EOF
ok "Wrote .env.local"

# ── terraform ─────────────────────────────────────────────────────────────────
step "Step 2 / 3 — Provision LaunchDarkly resources"
echo -e "${D}  Running: make setup (Terraform in Docker — may pull image on first run)${R}\n"
make setup

# ── sdk key ───────────────────────────────────────────────────────────────────
step "Step 3 / 3 — SDK key"
echo ""
echo -e "  Terraform created your LD project."
echo -e "  ${B}Open the URL printed above${R}, go to:"
echo -e "  ${D}  Environments → Production → SDK key → click '...' → Copy${R}"
echo ""

ask_secret LD_SDK_KEY \
  "LaunchDarkly SDK key (Production)" \
  "Paste the sdk-*** key from the URL above"

# Update placeholder in .env.local
TMP=$(mktemp)
sed "s|LD_SDK_KEY=placeholder|LD_SDK_KEY=${LD_SDK_KEY}|" .env.local > "$TMP"
mv "$TMP" .env.local
ok "Updated LD_SDK_KEY in .env.local"

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
