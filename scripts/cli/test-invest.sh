#!/bin/bash
# CLI Test: invest buy, portfolio, invest sell, investment locking
# Run: T2000_PIN=your-pin bash scripts/cli/test-invest.sh

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
echo "── CLI: Investment Commands ──"

echo ""
echo "   t2000 invest buy 1 SUI"
OUTPUT=$(t2000 invest buy 1 SUI 2>&1)
echo "$OUTPUT" | grep -q "Bought"
check $? "invest buy succeeds"

echo "$OUTPUT" | grep -q "SUI"
check $? "invest buy output contains SUI"

echo "$OUTPUT" | grep -q "Tx:"
check $? "invest buy output shows transaction link"

echo ""
echo "   t2000 portfolio"
OUTPUT=$(t2000 portfolio 2>&1)
echo "$OUTPUT" | grep -q "SUI"
check $? "portfolio shows SUI position"

echo "$OUTPUT" | grep -q "Total invested"
check $? "portfolio shows Total invested"

echo "$OUTPUT" | grep -q "Unrealized"
check $? "portfolio shows Unrealized P&L"

echo ""
echo "   t2000 portfolio --json"
t2000 portfolio --json > /dev/null 2>&1
check $? "portfolio --json exits 0"

t2000 portfolio --json 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'positions' in d" 2>/dev/null
check $? "portfolio --json contains positions"

echo ""
echo "   t2000 balance (investment line)"
OUTPUT=$(t2000 balance 2>&1)
echo "$OUTPUT" | grep -q "Investment"
check $? "balance shows Investment line"

echo ""
echo "   t2000 invest sell all SUI"
OUTPUT=$(t2000 invest sell all SUI 2>&1)
echo "$OUTPUT" | grep -q "Sold"
check $? "invest sell all succeeds"

echo "$OUTPUT" | grep -q "Proceeds"
check $? "invest sell shows Proceeds"

echo "$OUTPUT" | grep -q "Tx:"
check $? "invest sell shows transaction link"

echo ""
echo "   t2000 portfolio (empty after sell)"
OUTPUT=$(t2000 portfolio 2>&1)
echo "$OUTPUT" | grep -q "No investments"
check $? "portfolio shows no investments message"

echo ""
echo "════════════════════════════════════════════"
echo "  CLI Invest: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo ""

[ $FAIL -eq 0 ] || exit 1
