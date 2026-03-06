#!/bin/bash
# CLI Test: save command (multi-protocol)
# Run: T2000_PIN=your-pin bash scripts/cli/test-save.sh

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
echo "── CLI: Save Command ──"

echo ""
echo "   t2000 save 0.1 (auto-route to best rate)"
OUTPUT=$(t2000 save 0.1 2>&1)
echo "$OUTPUT" | grep -q "Saved"
check $? "save auto-route succeeds"

echo "$OUTPUT" | grep -q "APY"
check $? "save output shows APY"

echo "$OUTPUT" | grep -q "Tx:"
check $? "save output shows transaction link"

echo ""
echo "   t2000 save 0.1 --protocol suilend"
OUTPUT=$(t2000 save 0.1 --protocol suilend 2>&1)
echo "$OUTPUT" | grep -q "suilend"
check $? "save --protocol suilend routes to suilend"

echo "$OUTPUT" | grep -q "Saved"
check $? "save to suilend succeeds"

echo ""
echo "   t2000 save 0.1 --protocol navi"
OUTPUT=$(t2000 save 0.1 --protocol navi 2>&1)
echo "$OUTPUT" | grep -q "Saved"
check $? "save --protocol navi succeeds"

echo ""
echo "════════════════════════════════════════════"
echo "  CLI Save: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo ""

[ $FAIL -eq 0 ] || exit 1
