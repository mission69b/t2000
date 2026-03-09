#!/bin/bash
# CLI Test: rebalance command
# Run: T2000_PIN=your-pin bash scripts/cli/test-rebalance.sh

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
echo "── CLI: Rebalance Command ──"

echo ""
echo "   t2000 rebalance --dry-run"
OUTPUT=$(t2000 rebalance --dry-run 2>&1) || true
echo "$OUTPUT" | grep -qE "Rebalance Plan|Already optimized|No savings"
check $? "rebalance dry-run exits cleanly"

echo ""
echo "   t2000 rebalance --dry-run --json"
OUTPUT=$(t2000 rebalance --dry-run --json 2>&1) || true
echo "$OUTPUT" | grep -q "executed"
check $? "rebalance dry-run json contains executed field"

echo ""
echo "   t2000 rebalance --dry-run --min-diff 50"
OUTPUT=$(t2000 rebalance --dry-run --min-diff 50 2>&1) || true
echo "$OUTPUT" | grep -qE "Already optimized|No savings"
check $? "rebalance with high min-diff skips (already optimized)"

echo ""
echo "════════════════════════════════════════════"
echo "  CLI Rebalance: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo ""

[ $FAIL -eq 0 ] || exit 1
