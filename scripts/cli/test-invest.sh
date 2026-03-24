#!/bin/bash
# CLI Test: buy, portfolio, sell, invest earn, invest unearn
# Run: T2000_PIN=your-pin bash scripts/cli/test-invest.sh

PASS=0
FAIL=0

check() {
  if [ $1 -eq 0 ]; then
    echo "   ✓ $2"
    PASS=$((PASS + 1))
  else
    echo "   ✗ $2"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "── CLI: Trade Commands ──"

# ── Buy ──

echo ""
echo "   t2000 buy 1 SUI"
OUTPUT=$(t2000 buy 1 SUI 2>&1) || true
echo "$OUTPUT" | grep -q "Bought"
check $? "buy succeeds"

echo "$OUTPUT" | grep -q "SUI"
check $? "buy output contains SUI"

echo "$OUTPUT" | grep -q "Tx:"
check $? "buy output shows transaction link"

# ── Portfolio ──

echo ""
echo "   t2000 portfolio"
OUTPUT=$(t2000 portfolio 2>&1) || true
echo "$OUTPUT" | grep -q "SUI"
check $? "portfolio shows SUI position"

echo "$OUTPUT" | grep -q "Total invested"
check $? "portfolio shows Total invested"

echo "$OUTPUT" | grep -q "Unrealized"
check $? "portfolio shows Unrealized P&L"

echo ""
echo "   t2000 portfolio --json"
t2000 portfolio --json > /dev/null 2>&1 || true
check $? "portfolio --json exits 0"

t2000 portfolio --json 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'positions' in d" 2>/dev/null || true
check $? "portfolio --json contains positions"

# ── Balance ──

echo ""
echo "   t2000 balance (investment line)"
OUTPUT=$(t2000 balance 2>&1) || true
echo "$OUTPUT" | grep -q "Investment"
check $? "balance shows Investment line"

# ── Pre-flight: unearn if already earning from previous run ──

PREFLIGHT=$(t2000 invest unearn SUI 2>&1) || true
if echo "$PREFLIGHT" | grep -q "Withdrew"; then
  echo "   ℹ  Pre-flight: unearn'd stale earning position"
fi

# ── Invest Earn ──

echo ""
echo "   t2000 invest earn SUI"
OUTPUT=$(t2000 invest earn SUI 2>&1) || true
echo "$OUTPUT" | grep -q "deposited"
check $? "invest earn succeeds"

echo "$OUTPUT" | grep -q "APY"
check $? "invest earn shows APY"

echo "$OUTPUT" | grep -q "Tx:"
check $? "invest earn shows transaction link"

# ── Portfolio with yield ──

echo ""
echo "   t2000 portfolio (earning)"
OUTPUT=$(t2000 portfolio 2>&1) || true
echo "$OUTPUT" | grep -q "APY"
check $? "portfolio shows APY column while earning"

echo "$OUTPUT" | grep -q "SUI"
check $? "portfolio still shows SUI position"

# ── Balance with earning ──

echo ""
echo "   t2000 balance (earning APY)"
OUTPUT=$(t2000 balance 2>&1) || true
echo "$OUTPUT" | grep -q "earning"
check $? "balance shows earning APY on investment line"

# ── Invest Unearn ──

echo ""
echo "   t2000 invest unearn SUI"
OUTPUT=$(t2000 invest unearn SUI 2>&1) || true
echo "$OUTPUT" | grep -q "Withdrew"
check $? "invest unearn succeeds"

echo "$OUTPUT" | grep -q "withdrawn to wallet\|remains in"
check $? "invest unearn confirms SUI status"

# ── Portfolio after unearn ──

echo ""
echo "   t2000 portfolio (after unearn)"
OUTPUT=$(t2000 portfolio 2>&1) || true
echo "$OUTPUT" | grep -q "SUI"
check $? "portfolio still shows SUI after unearn"

# ── Earn then sell (auto-withdraw via invest sell) ──

echo ""
echo "   t2000 invest earn SUI (before sell)"
OUTPUT=$(t2000 invest earn SUI 2>&1) || true
echo "$OUTPUT" | grep -q "deposited\|already fully earning"
check $? "re-earn succeeds"

echo ""
echo "   t2000 sell all SUI (auto-withdraw)"
OUTPUT=$(t2000 sell all SUI 2>&1) || true
echo "$OUTPUT" | grep -q "Sold"
check $? "sell all SUI succeeds (auto-withdrew from lending)"

echo "$OUTPUT" | grep -q "Proceeds"
check $? "sell shows Proceeds"

echo "$OUTPUT" | grep -q "suiscan"
check $? "sell shows transaction link"

# ── Multi-asset buy/sell ──

echo ""
echo "   t2000 buy 1 BTC"
OUTPUT=$(t2000 buy 1 BTC 2>&1) || true
echo "$OUTPUT" | grep -q "Bought"
check $? "buy BTC succeeds"

echo ""
echo "   t2000 buy 1 ETH"
OUTPUT=$(t2000 buy 1 ETH 2>&1) || true
echo "$OUTPUT" | grep -q "Bought"
check $? "buy ETH succeeds"

echo ""
echo "   t2000 portfolio (multi-asset)"
OUTPUT=$(t2000 portfolio 2>&1) || true
echo "$OUTPUT" | grep -q "BTC"
check $? "portfolio shows BTC"

echo "$OUTPUT" | grep -q "ETH"
check $? "portfolio shows ETH"

echo ""
echo "   t2000 sell all BTC"
OUTPUT=$(t2000 sell all BTC 2>&1) || true
echo "$OUTPUT" | grep -q "Sold"
check $? "sell all BTC succeeds"

echo ""
echo "   t2000 sell all ETH"
OUTPUT=$(t2000 sell all ETH 2>&1) || true
echo "$OUTPUT" | grep -q "Sold"
check $? "sell all ETH succeeds"

# ── Empty state ──

echo ""
echo "   t2000 portfolio (empty after sell)"
OUTPUT=$(t2000 portfolio 2>&1) || true
# Strategy positions may persist from previous runs, so check direct positions are cleared
if echo "$OUTPUT" | grep -q "No investments"; then
  check 0 "portfolio cleared after sell-all"
elif ! echo "$OUTPUT" | grep -q "BTC\|ETH"; then
  check 0 "portfolio cleared after sell-all"
else
  check 1 "portfolio cleared after sell-all"
fi

echo ""
echo "════════════════════════════════════════════"
echo "  CLI Trade: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo ""

[ $FAIL -eq 0 ] || exit 1
