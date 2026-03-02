#!/bin/bash
# Run All CLI Integration Tests
#
# Usage:
#   T2000_PIN=your-pin bash scripts/cli/run-all.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0
RESULTS=""

echo "╔══════════════════════════════════════════╗"
echo "║   t2000 CLI — Integration Suite          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

for test in "$DIR"/test-*.sh; do
  name=$(basename "$test" .sh | sed 's/test-//')
  START=$(date +%s)

  echo "═══════════════════════════════════════════"
  echo "  Running: $name"
  echo "═══════════════════════════════════════════"

  if bash "$test"; then
    ELAPSED=$(( $(date +%s) - START ))
    RESULTS="$RESULTS   ✓ $name (${ELAPSED}s)\n"
    PASS=$((PASS + 1))
  else
    ELAPSED=$(( $(date +%s) - START ))
    RESULTS="$RESULTS   ✗ $name (${ELAPSED}s)\n"
    FAIL=$((FAIL + 1))
  fi
done

echo "╔══════════════════════════════════════════╗"
echo "║   Summary                               ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo -e "$RESULTS"
echo "   $PASS passed, $FAIL failed"
echo ""

[ $FAIL -eq 0 ] || exit 1
