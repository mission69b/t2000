#!/bin/bash
# CLI Test: Cross-feature integration tests
#
# Tests scenarios where multiple features interact — the edge cases
# that isolated feature tests miss.
#
# Run: T2000_PIN=your-pin bash scripts/cli/test-cross-features.sh

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
echo "── CLI: Cross-Feature Integration Tests ──"

# ══════════════════════════════════════════════════════
# Test 1: Balance hides zero-value stablecoins
# ══════════════════════════════════════════════════════

echo ""
echo "   Test 1: Balance hides zero-value stablecoins"
OUTPUT=$(t2000 balance 2>&1) || true

# Should NOT show $0.00 lines for any stablecoin
echo "$OUTPUT" | grep -q '\$0\.00'
if [ $? -eq 0 ]; then
  check 1 "balance hides zero-value stablecoins (found \$0.00)"
else
  check 0 "balance hides zero-value stablecoins"
fi

echo "$OUTPUT" | grep -q "Available"
check $? "balance still shows Available line"

echo "$OUTPUT" | grep -q "Total"
check $? "balance still shows Total line"

# ══════════════════════════════════════════════════════
# Test 2: Strategy sell preserves direct positions
# ══════════════════════════════════════════════════════

echo ""
echo "   Test 2: Strategy sell preserves direct positions"

# Buy direct ETH
echo "   → buy 2 ETH (direct)"
OUTPUT=$(t2000 buy 2 ETH 2>&1) || true
echo "$OUTPUT" | grep -q "Bought"
check $? "direct ETH buy succeeds"

# Buy strategy (which also buys ETH)
echo "   → invest strategy buy bluechip 5"
OUTPUT=$(t2000 invest strategy buy bluechip 5 2>&1) || true
echo "$OUTPUT" | grep -q "Invested"
check $? "strategy buy succeeds"

# Verify portfolio shows both
echo "   → portfolio (before strategy sell)"
OUTPUT=$(t2000 portfolio 2>&1) || true
echo "$OUTPUT" | grep -q "Direct"
check $? "portfolio shows Direct section"
echo "$OUTPUT" | grep -q "Bluechip"
check $? "portfolio shows Bluechip section"

# Sell ONLY the strategy
echo "   → invest strategy sell bluechip"
OUTPUT=$(t2000 invest strategy sell bluechip 2>&1) || true
echo "$OUTPUT" | grep -q "Sold"
check $? "strategy sell succeeds"

# Verify P&L is reasonable (not -$4.99)
PNL_LINE=$(echo "$OUTPUT" | grep "Realized P&L")
echo "   $PNL_LINE"
# Check that realized P&L does NOT contain a value worse than -$2
echo "$OUTPUT" | grep "Realized P&L" | grep -qE '\-\$[3-9]|\-\$[0-9]{2}'
if [ $? -eq 0 ]; then
  check 1 "strategy P&L is reasonable (got large loss)"
else
  check 0 "strategy P&L is reasonable"
fi

# Verify direct ETH still exists after strategy sell
echo "   → portfolio (after strategy sell)"
OUTPUT=$(t2000 portfolio 2>&1) || true
echo "$OUTPUT" | grep -q "ETH"
check $? "direct ETH position survives strategy sell"

# The portfolio should NOT say "No investments"
echo "$OUTPUT" | grep -q "No investments"
if [ $? -eq 0 ]; then
  check 1 "portfolio still has positions (got 'No investments')"
else
  check 0 "portfolio still has positions after strategy sell"
fi

# ══════════════════════════════════════════════════════
# Test 3: Swap works freely with investment positions
# ══════════════════════════════════════════════════════

echo ""
echo "   Test 3: Swap with investment positions"

# Swap USDC → SUI (should always work)
echo "   → swap 0.5 USDC SUI"
OUTPUT=$(t2000 swap 0.5 USDC SUI 2>&1) || true
echo "$OUTPUT" | grep -q "Swapped"
check $? "USDC→SUI swap works"

# Swap SUI → USDC (should work freely)
echo "   → swap 0.3 SUI USDC"
OUTPUT=$(t2000 swap 0.3 SUI USDC 2>&1) || true
echo "$OUTPUT" | grep -q "Swapped"
check $? "SUI→USDC swap works freely"

# ══════════════════════════════════════════════════════
# Test 4: Rebalance excludes investment assets
# ══════════════════════════════════════════════════════

echo ""
echo "   Test 4: Rebalance excludes investment assets"

echo "   → rebalance --dry-run"
OUTPUT=$(t2000 rebalance --dry-run 2>&1) || true

# If rebalance suggests anything, it should NOT be SUI, ETH, or BTC
echo "$OUTPUT" | grep -q "From:.*SUI"
if [ $? -eq 0 ]; then
  check 1 "rebalance does NOT suggest SUI (found SUI in 'From:')"
else
  check 0 "rebalance does NOT suggest SUI"
fi

echo "$OUTPUT" | grep -q "From:.*ETH"
if [ $? -eq 0 ]; then
  check 1 "rebalance does NOT suggest ETH"
else
  check 0 "rebalance does NOT suggest ETH"
fi

echo "$OUTPUT" | grep -q "From:.*BTC"
if [ $? -eq 0 ]; then
  check 1 "rebalance does NOT suggest BTC"
else
  check 0 "rebalance does NOT suggest BTC"
fi

# ══════════════════════════════════════════════════════
# Test 5: No Cetus debug output leaking to CLI
# ══════════════════════════════════════════════════════

echo ""
echo "   Test 5: No debug output in CLI"

echo "   → sell all ETH (checking for debug output)"
OUTPUT=$(t2000 sell all ETH 2>&1) || true
echo "$OUTPUT" | grep -q "extendedDetails"
if [ $? -eq 0 ]; then
  check 1 "no Cetus debug output (found extendedDetails)"
else
  check 0 "no Cetus debug output"
fi

echo "$OUTPUT" | grep -q "haedalhmmv2"
if [ $? -eq 0 ]; then
  check 1 "no haedal debug output"
else
  check 0 "no haedal debug output"
fi

# ══════════════════════════════════════════════════════
# Test 6: Withdraw prefers stablecoins over investment assets
# ══════════════════════════════════════════════════════

echo ""
echo "   Test 6: Withdraw prefers stablecoins"

# Buy some SUI to have a position
echo "   → buy 1 SUI (so SUI is on lending)"
OUTPUT=$(t2000 buy 1 SUI 2>&1) || true

# Save a bit of USDC
echo "   → save 0.2 (so there's a stablecoin savings position)"
OUTPUT=$(t2000 save 0.2 2>&1) || true
echo "$OUTPUT" | grep -q "Saved"
check $? "save 0.2 USDC succeeds"

# Withdraw should NOT withdraw SUI
echo "   → withdraw 0.1"
OUTPUT=$(t2000 withdraw 0.1 2>&1) || true
echo "$OUTPUT" | grep -q "Withdrew"
check $? "withdraw 0.1 succeeds"

# Verify it withdrew USDC or USDT (not SUI/ETH/BTC)
echo "$OUTPUT" | grep -q "SUI"
if [ $? -eq 0 ]; then
  # Could be gas info, check specifically for "Withdrew.*SUI"
  echo "$OUTPUT" | grep "Withdrew" | grep -q "SUI"
  if [ $? -eq 0 ]; then
    check 1 "withdraw did NOT withdraw investment asset SUI"
  else
    check 0 "withdraw withdrew a stablecoin (not SUI)"
  fi
else
  check 0 "withdraw withdrew a stablecoin (not SUI)"
fi

# ══════════════════════════════════════════════════════
# Final cleanup: sell remaining positions
# ══════════════════════════════════════════════════════

echo ""
echo "   Cleanup: selling remaining positions"
t2000 sell all SUI 2>/dev/null || true
t2000 sell all BTC 2>/dev/null || true

echo ""
echo "════════════════════════════════════════════"
echo "  CLI Cross-Feature: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo ""

[ $FAIL -eq 0 ] || exit 1
