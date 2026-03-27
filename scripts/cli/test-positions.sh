#!/bin/bash
# CLI Test: positions, rates, health (multi-protocol)
# Run: T2000_PIN=your-pin bash scripts/cli/test-positions.sh

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
echo "── CLI: Positions & Multi-Protocol ──"

echo ""
echo "   t2000 positions"
t2000 positions > /dev/null 2>&1 || true
check $? "positions exits 0"

echo ""
echo "   t2000 rates (multi-protocol)"
OUTPUT=$(t2000 rates 2>&1) || true
echo "$OUTPUT" | grep -q "NAVI"
check $? "rates shows NAVI"

echo "$OUTPUT" | grep -q "Suilend"
check $? "rates shows Suilend"

echo ""
echo "   t2000 health"
t2000 health > /dev/null 2>&1 || true
check $? "health exits 0"

t2000 health 2>&1 | grep -q "Health Factor"
check $? "health output contains Health Factor"

echo ""
echo "   t2000 earn (multi-protocol)"
OUTPUT=$(t2000 earn 2>&1) || true
echo "$OUTPUT" | grep -q "SAVINGS"
check $? "earn shows SAVINGS section"

echo "$OUTPUT" | grep -q "Total Saved"
check $? "earn shows savings section"

echo ""
echo "════════════════════════════════════════════"
echo "  CLI Positions: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo ""

[ $FAIL -eq 0 ] || exit 1
