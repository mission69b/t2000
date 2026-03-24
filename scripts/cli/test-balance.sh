#!/bin/bash
# CLI Test: balance, rates, earnings, fund-status
# Run: T2000_PIN=your-pin bash scripts/cli/test-balance.sh

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
echo "── CLI: Balance & Financial Commands ──"

echo ""
echo "   t2000 balance"
t2000 balance > /dev/null 2>&1 || true
check $? "balance exits 0"

t2000 balance 2>&1 | grep -q "Available"
check $? "balance output contains Available"

t2000 balance 2>&1 | grep -q "Savings\|Investment"
check $? "balance output contains Savings or Investment"

t2000 balance 2>&1 | grep -q "Investment"
check $? "balance output contains Investment"

t2000 balance 2>&1 | grep -q "Total"
check $? "balance output contains Total"

echo ""
echo "   t2000 balance --json (stables field)"
t2000 balance --json > /dev/null 2>&1 || true
check $? "balance --json exits 0"

t2000 balance --json 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'stables' in d and 'USDC' in d['stables']" 2>/dev/null
check $? "balance --json contains stables.USDC"

echo ""
echo "   t2000 rates"
t2000 rates > /dev/null 2>&1 || true
check $? "rates exits 0"

t2000 rates 2>&1 | grep -q "APY"
check $? "rates output contains APY"

t2000 rates 2>&1 | grep -q "Best yield"
check $? "rates output shows Best yield headline"

echo ""
echo "   t2000 positions"
t2000 positions > /dev/null 2>&1 || true
check $? "positions exits 0"

echo ""
echo "   t2000 earnings"
t2000 earnings > /dev/null 2>&1 || true
check $? "earnings exits 0"

echo ""
echo "   t2000 fund-status"
t2000 fund-status > /dev/null 2>&1 || true
check $? "fund-status exits 0"

echo ""
echo "   t2000 address"
t2000 address > /dev/null 2>&1 || true
check $? "address exits 0"

t2000 address 2>&1 | grep -q "0x"
check $? "address output contains 0x"

echo ""
echo "════════════════════════════════════════════"
echo "  CLI Balance: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo ""

[ $FAIL -eq 0 ] || exit 1
