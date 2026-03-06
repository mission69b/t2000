#!/bin/bash
# CLI Test: withdraw command (multi-protocol)
# Run: T2000_PIN=your-pin bash scripts/cli/test-withdraw.sh

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
echo "── CLI: Withdraw Command ──"

echo ""
echo "   t2000 withdraw 0.1 --protocol suilend"
OUTPUT=$(t2000 withdraw 0.1 --protocol suilend 2>&1)
echo "$OUTPUT" | grep -q "Withdrew\|Withdrawn"
check $? "withdraw from suilend succeeds"

echo ""
echo "   t2000 withdraw 0.1 --protocol navi"
OUTPUT=$(t2000 withdraw 0.1 --protocol navi 2>&1)
echo "$OUTPUT" | grep -q "Withdrew\|Withdrawn"
check $? "withdraw from navi succeeds"

echo ""
echo "════════════════════════════════════════════"
echo "  CLI Withdraw: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo ""

[ $FAIL -eq 0 ] || exit 1
