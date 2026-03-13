#!/usr/bin/env bash
# t2000 CLI installer
#
# Usage:
#   curl -fsSL https://t2000.ai/install.sh | bash
#
# What this does:
#   1. Checks for Node.js (v18+)
#   2. Installs @t2000/cli globally via npm
#   3. Runs t2000 init (creates wallet + PIN)
#   4. Optionally connects your AI via MCP
#
# Environment variables:
#   T2000_SKIP_INIT  - Skip t2000 init (default: false)
#   T2000_SKIP_MCP   - Skip MCP setup prompt (default: false)

main() {

set -euo pipefail

# ─── Colors (only when outputting to a terminal) ─────────────────────────────

Color_Off='' Red='' Green='' Dim='' Bold='' Blue='' Yellow=''

if [[ -t 1 ]]; then
  Color_Off='\033[0m'
  Red='\033[0;31m'
  Green='\033[0;32m'
  Yellow='\033[0;33m'
  Dim='\033[0;2m'
  Bold='\033[1m'
  Blue='\033[0;34m'
fi

# ─── Helpers ─────────────────────────────────────────────────────────────────

error() {
  printf "%b\n" "${Red}error${Color_Off}: $*" >&2
  exit 1
}

warn() {
  printf "%b\n" "${Yellow}warn${Color_Off}: $*" >&2
}

info() {
  printf "%b\n" "${Dim}$*${Color_Off}"
}

success() {
  printf "%b\n" "${Green}$*${Color_Off}"
}

bold() {
  printf "%b\n" "${Bold}$*${Color_Off}"
}

# ─── Banner ──────────────────────────────────────────────────────────────────

echo ""
bold "  ┌─────────────────────────────────────┐"
bold "  │  ${Green}t2000${Color_Off}${Bold} — bank account for AI agents  │"
bold "  └─────────────────────────────────────┘"
echo ""

# ─── Check Node.js ───────────────────────────────────────────────────────────

if ! command -v node >/dev/null 2>&1; then
  error "Node.js is required but not found.

  Install Node.js 18+ from https://nodejs.org
  Or use a version manager:

    # nvm
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    nvm install 20

    # brew (macOS)
    brew install node"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_VERSION" -lt 18 ]]; then
  error "Node.js 18+ is required (found v$(node -v | sed 's/v//'))

  Update Node.js: https://nodejs.org"
fi

info "  ✓ Node.js $(node -v) detected"

# ─── Check npm ───────────────────────────────────────────────────────────────

if ! command -v npm >/dev/null 2>&1; then
  error "npm is required but not found. It should come with Node.js."
fi

# ─── Install @t2000/cli ─────────────────────────────────────────────────────

echo ""
bold "  Installing @t2000/cli..."
echo ""

npm install -g @t2000/cli 2>&1 | while IFS= read -r line; do
  printf "  %s\n" "$line"
done

if ! command -v t2000 >/dev/null 2>&1; then
  error "Installation failed — t2000 command not found after npm install.

  Try installing manually:
    npm install -g @t2000/cli"
fi

INSTALLED_VERSION=$(t2000 --version 2>/dev/null || echo "unknown")

echo ""
success "  ✓ t2000 ${INSTALLED_VERSION} installed"

# ─── Run t2000 init ─────────────────────────────────────────────────────────

if [[ "${T2000_SKIP_INIT:-}" != "true" ]]; then
  echo ""
  bold "  Setting up your agent wallet..."
  echo ""
  t2000 init
fi

# ─── MCP setup ──────────────────────────────────────────────────────────────

if [[ "${T2000_SKIP_MCP:-}" != "true" ]] && [[ -t 0 ]]; then
  echo ""
  printf "%b" "${Bold}  Connect your AI via MCP? (Claude, Cursor, etc.) [Y/n] ${Color_Off}"
  read -r mcp_answer
  mcp_answer="${mcp_answer:-Y}"

  if [[ "$mcp_answer" =~ ^[Yy]$ ]]; then
    echo ""
    t2000 mcp install
  fi
fi

# ─── Done ────────────────────────────────────────────────────────────────────

echo ""
success "  ──────────────────────────────────────"
success "  ✓ t2000 is ready"
echo ""
info "  Next steps:"
echo ""
bold "    t2000 balance          ${Dim}# check your accounts${Color_Off}"
bold "    t2000 save 100         ${Dim}# earn yield on idle funds${Color_Off}"
bold "    t2000 invest buy 50 SUI  ${Dim}# invest in crypto${Color_Off}"
echo ""
info "  Docs:  https://t2000.ai/docs"
info "  Demos: https://t2000.ai/demo"
echo ""

}

# Run the installer — this line MUST be the last line in the file.
# If the download is interrupted, bash will not execute an incomplete function.
main "$@"
