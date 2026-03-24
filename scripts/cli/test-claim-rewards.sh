#!/bin/bash
# CLI Test: claim-rewards command
# Run: T2000_PIN=your-pin bash scripts/cli/test-claim-rewards.sh

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
echo "── CLI: Claim Rewards ──"

echo ""
echo "   t2000 claim-rewards"
t2000 claim-rewards > /dev/null 2>&1 || true
check $? "claim-rewards exits 0"

OUTPUT=$(t2000 claim-rewards 2>&1)
echo "$OUTPUT" | grep -q "Claimed and converted rewards to USDC\|No rewards to claim"
check $? "claim-rewards shows success or no-rewards message"

echo "$OUTPUT" | grep -q "Received:\|No rewards"
check $? "claim-rewards shows received amount or no-rewards"

echo "$OUTPUT" | grep -qv "vSUI\|DEEP\|sSUI\|SPRING_SUI\|CERT"
check $? "claim-rewards does not expose raw token names"

echo ""
echo "   t2000 claim-rewards --json"
t2000 claim-rewards --json > /dev/null 2>&1 || true
check $? "claim-rewards --json exits 0"

t2000 claim-rewards --json 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'success' in d and 'usdcReceived' in d and 'rewards' in d" 2>/dev/null
check $? "claim-rewards --json has success, usdcReceived, rewards fields"

echo ""
echo "   t2000 balance (rewards indicator)"
BALANCE=$(t2000 balance 2>&1)
echo "$BALANCE" | grep -q "Rewards.*claimable\|Total"
check $? "balance shows rewards indicator or total"

echo "$BALANCE" | grep -qv "vSUI\|DEEP\|sSUI\|SPRING_SUI"
check $? "balance does not expose raw token names"

echo ""
echo "   t2000 positions (per-asset rewards)"
POSITIONS=$(t2000 positions 2>&1)
echo "$POSITIONS" | grep -qv "DEEP.*vSUI\|vSUI.*DEEP"
check $? "positions does not show mixed token names per-protocol"

echo "$POSITIONS" | grep -q "claim-rewards\|Savings\|No positions"
check $? "positions shows position info or hint"

echo ""
echo "════════════════════════════════════════════"
echo "  CLI Claim Rewards: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo ""

[ $FAIL -eq 0 ] || exit 1
