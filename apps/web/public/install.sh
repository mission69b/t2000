#!/usr/bin/env bash
# t2000 CLI installer — Agent Wallet for AI agents on Sui
#
# Usage:
#   curl -fsSL https://t2000.ai/install.sh | bash
#
# What this does:
#   1. Checks for Node.js (v18+)
#   2. Installs @t2000/cli globally via npm (provides the `t2` binary)
#   3. Creates a wallet (`t2 init`) — or detects an existing one
#   4. Wires the MCP server into Claude Desktop / Cursor / Windsurf
#   5. Installs the agent skills
#
# Environment variables (all opt-OUT):
#   T2000_SKIP_INIT    - Skip wallet creation (read-only install)
#   T2000_SKIP_MCP     - Skip MCP wiring
#   T2000_SKIP_SKILLS  - Skip skills install

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
bold "  ┌──────────────────────────────────────────┐"
bold "  │  ${Green}t2000${Color_Off}${Bold} — Agent Wallet for AI agents          │"
bold "  └──────────────────────────────────────────┘"
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

if ! command -v t2 >/dev/null 2>&1; then
  error "Installation failed — t2 command not found after npm install.

  Try installing manually:
    npm install -g @t2000/cli"
fi

INSTALLED_VERSION=$(t2 --version 2>/dev/null || echo "unknown")

echo ""
success "  ✓ t2 ${INSTALLED_VERSION} installed"

# ─── Wallet: create, or detect an existing one ──────────────────────────────

WALLET_PATH="${HOME}/.t2000/wallet.key"

if [[ -f "$WALLET_PATH" ]]; then
  echo ""
  info "  ✓ Existing wallet detected at ~/.t2000/wallet.key — keeping it."
elif [[ "${T2000_SKIP_INIT:-}" == "true" ]]; then
  echo ""
  info "  Skipping wallet creation (T2000_SKIP_INIT=true) — read-only install."
  info "  Create one later with: t2 init"
else
  echo ""
  bold "  Creating your wallet..."
  echo ""
  t2 init
fi

# ─── Wire MCP into Claude Desktop / Cursor / Windsurf (idempotent) ───────────
# Non-fatal: a missing platform config or a write hiccup must not abort install.

if [[ "${T2000_SKIP_MCP:-}" != "true" ]]; then
  echo ""
  bold "  Wiring MCP into your AI clients..."
  echo ""
  t2 mcp install || warn "MCP wiring skipped (no supported client config found, or a write failed). Run \`t2 mcp install\` later."
fi

# ─── Install agent skills (idempotent) ──────────────────────────────────────

if [[ "${T2000_SKIP_SKILLS:-}" != "true" ]]; then
  echo ""
  bold "  Installing agent skills..."
  echo ""
  t2 skills install || warn "Skills install skipped. Run \`t2 skills install\` later."
fi

# ─── Done ────────────────────────────────────────────────────────────────────

echo ""
success "  ──────────────────────────────────────"
success "  ✓ t2 is ready"
echo ""
info "  Next steps:"
echo ""
bold "    t2 balance                 ${Dim}# check USDC / USDsui / SUI${Color_Off}"
bold "    t2 services search chat    ${Dim}# browse paid APIs on the rail${Color_Off}"
bold "    t2 pay <url>               ${Dim}# pay-per-call, gasless USDC${Color_Off}"
bold "    t2 send 5 USDC <addr>      ${Dim}# gasless USDC send${Color_Off}"
echo ""
info "  Fund with USDC on Sui, then pay per call — at the \$0.02 rail floor, \$5 ≈ ~250 calls."
info "  Spending limits are ON by default (\$25/tx, \$100/day). Change with \`t2 limit set\`."
echo ""
info "  Restart your AI client, then ask it: \"what's my t2000 balance?\""
info "  Developer docs:  https://developers.t2000.ai"
echo ""

}

# Run the installer — this line MUST be the last line in the file.
# If the download is interrupted, bash will not execute an incomplete function.
main "$@"
