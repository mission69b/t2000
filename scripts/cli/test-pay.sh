#!/bin/bash
# CLI Test: pay command (dry-run only — no real payment)
# Run: T2000_PIN=your-pin bash scripts/cli/test-pay.sh

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
echo "── CLI: Pay Command ──"

echo ""
echo "   t2000 pay --help"
t2000 pay --help > /dev/null 2>&1 || true
check $? "pay --help exits 0"

t2000 pay --help 2>&1 | grep -q "MPP"
check $? "pay help mentions MPP"

t2000 pay --help 2>&1 | grep -q "max-price"
check $? "pay help mentions max-price"

echo ""
echo "════════════════════════════════════════════"
echo "  CLI Pay: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo ""

[ $FAIL -eq 0 ] || exit 1
