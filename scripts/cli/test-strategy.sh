#!/bin/bash
# CLI Test: strategies, auto-invest
# Run: T2000_PIN=your-pin bash scripts/cli/test-strategy.sh

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
echo "── CLI: Strategy & Auto-Invest Commands ──"

# ── Strategy list ──

echo ""
echo "   t2000 invest strategy list"
OUTPUT=$(t2000 invest strategy list 2>&1) || true
echo "$OUTPUT" | grep -q "bluechip"
check $? "strategy list shows bluechip"

echo "$OUTPUT" | grep -q "layer1"
check $? "strategy list shows layer1"

echo "$OUTPUT" | grep -q "sui-heavy"
check $? "strategy list shows sui-heavy"

echo "$OUTPUT" | grep -q "BTC"
check $? "strategy list shows allocation assets"

# ── Strategy buy (dry-run) ──

echo ""
echo "   t2000 invest strategy buy layer1 5 --dry-run"
OUTPUT=$(t2000 invest strategy buy layer1 5 --dry-run 2>&1) || true
echo "$OUTPUT" | grep -q "Dry Run"
check $? "strategy buy dry-run shows preview"

echo "$OUTPUT" | grep -q "SUI"
check $? "strategy buy dry-run shows SUI allocation"

echo "$OUTPUT" | grep -q "ETH"
check $? "strategy buy dry-run shows ETH allocation"

# ── Strategy buy (real) ──

echo ""
echo "   t2000 invest strategy buy layer1 5"
OUTPUT=$(t2000 invest strategy buy layer1 5 2>&1) || true
echo "$OUTPUT" | grep -q "Invested"
check $? "strategy buy executes"

echo "$OUTPUT" | grep -q "Total invested"
check $? "strategy buy shows total"

# ── Strategy status ──

echo ""
echo "   t2000 invest strategy status layer1"
OUTPUT=$(t2000 invest strategy status layer1 2>&1) || true
echo "$OUTPUT" | grep -q "layer1\|Layer"
check $? "strategy status shows name"

echo "$OUTPUT" | grep -q "Total value"
check $? "strategy status shows total value"

# ── Portfolio with strategy grouping ──

echo ""
echo "   t2000 portfolio (strategy grouping)"
OUTPUT=$(t2000 portfolio 2>&1) || true
echo "$OUTPUT" | grep -q "SUI"
check $? "portfolio shows strategy positions"

# ── Strategy create ──

echo ""
echo "   t2000 invest strategy create test-strat --alloc SUI:50 ETH:50"
OUTPUT=$(t2000 invest strategy create test-strat --alloc SUI:50 ETH:50 2>&1) || true
echo "$OUTPUT" | grep -q "Created"
check $? "strategy create succeeds"

# ── Strategy delete ──

echo ""
echo "   t2000 invest strategy delete test-strat"
OUTPUT=$(t2000 invest strategy delete test-strat 2>&1) || true
echo "$OUTPUT" | grep -q "Deleted"
check $? "strategy delete succeeds"

# ── Strategy sell ──

echo ""
echo "   t2000 invest strategy sell layer1"
OUTPUT=$(t2000 invest strategy sell layer1 2>&1) || true
echo "$OUTPUT" | grep -q "Sold"
check $? "strategy sell succeeds"

echo "$OUTPUT" | grep -q "proceeds"
check $? "strategy sell shows proceeds"

# ── Auto-invest status (empty) ──

echo ""
echo "   t2000 invest auto status"
OUTPUT=$(t2000 invest auto status 2>&1) || true
echo "$OUTPUT" | grep -q -i "schedule\|No auto"
check $? "auto status shows output"

# ── Auto-invest setup ──

echo ""
echo "   t2000 invest auto setup 10 weekly bluechip"
OUTPUT=$(t2000 invest auto setup 10 weekly bluechip 2>&1) || true
echo "$OUTPUT" | grep -q "created"
check $? "auto setup creates schedule"

echo "$OUTPUT" | grep -q "Next run"
check $? "auto setup shows next run"

# ── Auto-invest status (with schedule) ──

echo ""
echo "   t2000 invest auto status (after setup)"
OUTPUT=$(t2000 invest auto status 2>&1) || true
echo "$OUTPUT" | grep -q "bluechip"
check $? "auto status shows bluechip schedule"

echo "$OUTPUT" | grep -q "weekly"
check $? "auto status shows frequency"

# ── Auto-invest run (nothing pending yet) ──

echo ""
echo "   t2000 invest auto run"
OUTPUT=$(t2000 invest auto run 2>&1) || true
echo "$OUTPUT" | grep -q -i "pending\|up to date\|executed"
check $? "auto run shows status"

echo ""
echo "════════════════════════════════════════════"
echo "  CLI Strategy: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo ""

[ $FAIL -eq 0 ] || exit 1
