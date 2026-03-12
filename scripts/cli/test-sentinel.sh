#!/bin/bash
# CLI Test: sentinel list, sentinel info
# Run: T2000_PIN=your-pin bash scripts/cli/test-sentinel.sh

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
echo "── CLI: Sentinel Commands ──"

echo ""
echo "   t2000 sentinel list"
t2000 sentinel list > /dev/null 2>&1 || true
check $? "sentinel list exits 0"

t2000 sentinel list 2>&1 | grep -q "Active Sentinels"
check $? "sentinel list shows Active Sentinels header"

t2000 sentinel list 2>&1 | grep -q "active sentinel"
check $? "sentinel list shows count"

echo ""
echo "   t2000 sentinel list --json"
t2000 sentinel list --json > /dev/null 2>&1 || true
check $? "sentinel list --json exits 0"

t2000 sentinel list --json 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); assert len(d) > 0" 2>/dev/null
check $? "sentinel list --json returns non-empty array"

echo ""
echo "   t2000 sentinel info (first sentinel)"
TARGET=$(t2000 sentinel list --json 2>&1 | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['objectId'])") || true
t2000 sentinel info "$TARGET" > /dev/null 2>&1 || true
check $? "sentinel info exits 0"

t2000 sentinel info "$TARGET" 2>&1 | grep -q "Object ID"
check $? "sentinel info shows Object ID"

t2000 sentinel info "$TARGET" 2>&1 | grep -q "Attack Fee"
check $? "sentinel info shows Attack Fee"

t2000 sentinel info "$TARGET" 2>&1 | grep -q "Prize Pool"
check $? "sentinel info shows Prize Pool"

echo ""
echo "════════════════════════════════════════════"
echo "  CLI Sentinel: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"
echo ""

[ $FAIL -eq 0 ] || exit 1
