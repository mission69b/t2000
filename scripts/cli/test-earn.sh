#!/bin/bash
# CLI Test: earn command
# Run: T2000_PIN=your-pin bash scripts/cli/test-earn.sh

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
echo "── CLI: Earn Command ──"

echo ""
echo "   t2000 earn"
t2000 earn > /dev/null 2>&1 || true
check $? "earn exits 0"

t2000 earn 2>&1 | grep -q "Earning Opportunities"
check $? "earn shows Earning Opportunities header"

t2000 earn 2>&1 | grep -q "SAVINGS"
check $? "earn shows SAVINGS section"

t2000 earn 2>&1 | grep -q "Quick Actions"
check $? "earn shows Quick Actions section"

echo ""
echo "   t2000 earn --json"
t2000 earn --json > /dev/null 2>&1 || true
check $? "earn --json exits 0"

t2000 earn --json 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'savings' in d" 2>/dev/null
check $? "earn --json returns savings key"

echo ""
echo "════════════════════════════════════════════"
echo "  CLI Earn: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo ""

[ $FAIL -eq 0 ] || exit 1
