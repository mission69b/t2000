#!/bin/bash
# CLI Test: multi-stable borrow + repay
# Run: T2000_PIN=your-pin bash scripts/cli/test-borrow-multi.sh
# Requires: savings deposited first (t2000 save 1)

set -e
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
echo "── CLI: Multi-Stable Borrow + Repay ──"

echo ""
echo "   t2000 borrow 0.1 USDC (default)"
OUTPUT=$(t2000 borrow 0.1 2>&1) || true
echo "$OUTPUT" | grep -q "Borrowed"
check $? "borrow USDC succeeds"

echo ""
echo "   t2000 repay 0.1 USDC"
OUTPUT=$(t2000 repay 0.1 2>&1) || true
echo "$OUTPUT" | grep -q "Repaid"
check $? "repay USDC succeeds"

echo ""
echo "   t2000 borrow 0.1 USDT --protocol navi"
OUTPUT=$(t2000 borrow 0.1 USDT --protocol navi 2>&1) || true
echo "$OUTPUT" | grep -q "Borrowed"
check $? "borrow USDT on navi succeeds"

echo "$OUTPUT" | grep -q "USDT"
check $? "borrow output shows USDT asset"

echo ""
echo "   t2000 repay 0.1 USDT --protocol navi"
OUTPUT=$(t2000 repay 0.1 USDT --protocol navi 2>&1) || true
echo "$OUTPUT" | grep -q "Repaid"
check $? "repay USDT on navi succeeds"

echo ""
echo "   t2000 positions (check multi-asset display)"
OUTPUT=$(t2000 positions 2>&1) || true
echo "$OUTPUT" | grep -qE "Savings|No open"
check $? "positions shows output"

echo ""
echo "════════════════════════════════════════════"
echo "  CLI Borrow Multi: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo ""

[ $FAIL -eq 0 ] || exit 1
