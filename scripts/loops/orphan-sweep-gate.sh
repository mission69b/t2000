#!/usr/bin/env bash
#
# orphan-sweep-gate.sh — the OBJECTIVE gate for the post-change orphan +
# doc-staleness sweep loop (see .cursor/rules/orphan-sweep.mdc).
#
# The loop opens NO pull request unless this exits 0. Hard gate = lint +
# typecheck + test on the published packages (mirrors .github/workflows/ci.yml
# — deliberately NOT `pnpm lint`, which includes docs/mintlify that fails on
# network + node 25). The stale-ref scan is an informational aid for the maker,
# not a hard fail (a doc comment can legitimately mention a removed symbol).
#
# Usage:  bash scripts/loops/orphan-sweep-gate.sh
# Exit:   0 = green (lint/typecheck/test all pass)  ·  1 = gate failed
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2

fail=0
run() { echo ""; echo "── $* ──"; "$@" || { echo "GATE FAIL: $*"; fail=1; }; }

# 1) Code health — the objective gate (catches dead code, unused imports, type breaks)
for pkg in sdk cli mcp ui; do run pnpm --filter "@t2000/$pkg" lint; done
for pkg in sdk mcp cli ui; do run pnpm --filter "@t2000/$pkg" typecheck; done
for pkg in sdk mcp; do run pnpm --filter "@t2000/$pkg" test; done
# CLI: UNIT tests only. The integration suite (program.integration.test.ts) spawns
# `t2` processes with timeouts and is timing-flaky under the gate's CPU load — a
# flaky step makes the loop block on noise. CI (dedicated runners, on the PR) +
# the weekly gateway-e2e are the AUTHORITATIVE integration gates; the fast inner
# loop gate stays deterministic.
run pnpm --filter @t2000/cli exec vitest run --exclude '**/*.integration.test.ts'

# 2) Stale-ref scan — INFORMATIONAL. Surfaces references to symbols/dirs/deps
#    confirmed removed in the cutover. Extend STALE_PATTERNS as new removals land
#    (the "compounding skill" — see orphan-sweep.mdc). Findings are for the maker
#    to review; they do NOT fail the gate (comments may legitimately mention them).
STALE_PATTERNS='@t2000/engine|/adapters/|protocolFee|addFeeTransfer|ContactManager|createSuiClient|transactionBlocks\(|\bisTier1\b|\bisTier2\b|SAVEABLE_ASSETS|gasReserve|@naviprotocol/lending'
echo ""
echo "── stale-ref scan (informational) ──"
if rg -n -e "$STALE_PATTERNS" \
      --glob '!**/dist/**' --glob '!**/node_modules/**' --glob '!spec/**' \
      --glob '!**/*.test.ts' --glob '!scripts/loops/**' \
      packages apps .github 2>/dev/null; then
  echo "^ review the above — confirm each is an intentional historical mention, not a live orphan"
else
  echo "ok — no references to removed symbols/dirs/deps"
fi

echo ""
if [ "$fail" -eq 0 ]; then echo "GATE GREEN - ok to open a draft PR"; else echo "GATE RED - fix the failures above before opening a PR"; fi
exit "$fail"
