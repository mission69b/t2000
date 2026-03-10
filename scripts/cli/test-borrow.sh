#!/bin/bash
# CLI Test: borrow + repay (USDC only)
# Run: T2000_PIN=your-pin bash scripts/cli/test-borrow.sh
# Requires: savings deposited first (t2000 save 1)

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
echo "── CLI: Borrow + Repay ──"
echo "   (requires: t2000 save 1 — needs collateral)"

# Check if we have savings first
POSITIONS=$(t2000 positions 2>&1) || true
if echo "$POSITIONS" | grep -q "No positions"; then
  echo ""
  echo "   ⚠  Skipped — no savings positions (deposit with t2000 save 1 first)"
  echo ""
  echo "════════════════════════════════════════════"
  echo "  CLI Borrow: 0 passed, 0 failed (skipped)"
  echo "════════════════════════════════════════════"
  echo ""
  exit 0
fi

echo ""
echo "   t2000 borrow 0.1"
OUTPUT=$(t2000 borrow 0.1 2>&1) || true
echo "$OUTPUT" | grep -q "Borrowed"
check $? "borrow USDC succeeds"

echo "$OUTPUT" | grep -q "Health Factor"
check $? "borrow shows health factor"

echo ""
echo "   t2000 repay 0.1"
OUTPUT=$(t2000 repay 0.1 2>&1) || true
echo "$OUTPUT" | grep -q "Repaid"
check $? "repay USDC succeeds"

echo ""
echo "   t2000 positions (check borrow display)"
OUTPUT=$(t2000 positions 2>&1) || true
echo "$OUTPUT" | grep -qE "Savings|No positions"
check $? "positions shows output"

echo ""
echo "════════════════════════════════════════════"
echo "  CLI Borrow: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo ""

[ $FAIL -eq 0 ] || exit 1
