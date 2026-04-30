#!/usr/bin/env bash
#
# One-time admin sweep of the deprecated Move treasury (B5 v2, 2026-04-30).
#
# What this does:
#   1. Switches sui client to the admin keypair (gracious-chrysoberyl).
#   2. Reads the current Treasury<USDC> balance.
#   3. Calls treasury::withdraw_fees, which sends the funds to ctx.sender()
#      (= the admin address = T2000_OVERLAY_FEE_WALLET).
#   4. Verifies the treasury is empty afterwards.
#
# Why we still need it:
#   The legacy Move treasury holds residual fees from before the B5 v2
#   architecture cutover. After this sweep, the on-chain Treasury<USDC>
#   object is dormant and the only fee path is the indexer-fed wallet.
#
# Why it uses the abandoned package (0xab92e9f1...):
#   The Treasury<USDC> object was created by the original t2000 package,
#   which has since been superseded by 0xd775fcc6 (current). Move call
#   resolution is by package ID, so we have to call the old package to
#   touch the old object.
#
# Idempotent: re-running on an empty treasury exits cleanly with code 0.

set -euo pipefail

TREASURY_PACKAGE=0xab92e9f1fe549ad3d6a52924a73181b45791e76120b975138fac9ec9b75db9f3
TREASURY_ID=0x3bb501b8300125dca59019247941a42af6b292a150ce3cfcce9449456be2ec91
USDC_TYPE=0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC
ADMIN_ADDR=0x5366efbf2b4fe5767fe2e78eb197aa5f5d138d88ac3333fbf3f80a1927da473a
ADMIN_ALIAS=gracious-chrysoberyl
# AdminCap for the abandoned package (lives in admin's wallet).
# Verified via suix_getOwnedObjects filtered by 0xab92e9f1::core::AdminCap.
ADMIN_CAP_ID=0x863d1b02cba1b93d0fe9b87eb92d58b60c1e85c001022cb2a760e07bade47e65

echo "=== B5 v2 treasury sweep ==="
echo ""

echo "Step 1: ensure active address = admin"
ACTIVE=$(sui client active-address)
if [ "$ACTIVE" != "$ADMIN_ADDR" ]; then
  echo "  switching from $ACTIVE → $ADMIN_ADDR ($ADMIN_ALIAS)"
  sui client switch --address "$ADMIN_ALIAS" >/dev/null
else
  echo "  already on admin"
fi
echo "  active = $(sui client active-address)"
echo ""

echo "Step 2: read treasury balance"
# sui CLI 1.62 emits a [warning] line for client/server version mismatch.
# Don't suppress stderr (the CLI writes back to its config when stderr is
# closed, which can fail under sandboxing); just filter the warning out.
BAL=$(sui client object "$TREASURY_ID" --json 2>&1 | grep -v '^\[warning\]' | jq -r '.content.fields.balance')
if [ -z "$BAL" ] || [ "$BAL" = "null" ]; then
  echo "  ✗ could not read treasury — object may not exist"
  exit 1
fi
USDC=$(awk -v b="$BAL" 'BEGIN { printf "%.6f", b/1000000 }')
echo "  balance = $BAL raw ($USDC USDC)"
if [ "$BAL" -le "0" ]; then
  echo "  ✓ already empty — nothing to sweep"
  exit 0
fi
echo ""

echo "Step 3: withdraw_fees(treasury, admin_cap, $BAL) → admin = treasury wallet"
# On-chain ABI (from package 0xab92e9f1, NOT current source):
#   withdraw_fees<T>(treasury: &mut Treasury<T>, cap: &AdminCap, amount: u64, ctx: &mut TxContext)
# The current treasury.move source uses a different signature (no AdminCap),
# but the deployed object is from the older package — call ABI must match.
sui client call \
  --package "$TREASURY_PACKAGE" \
  --module treasury \
  --function withdraw_fees \
  --type-args "$USDC_TYPE" \
  --args "$TREASURY_ID" "$ADMIN_CAP_ID" "$BAL" \
  --gas-budget 10000000
echo ""

echo "Step 4: verify treasury empty"
NEW_BAL=$(sui client object "$TREASURY_ID" --json 2>&1 | grep -v '^\[warning\]' | jq -r '.content.fields.balance')
echo "  balance now = $NEW_BAL"
if [ "$NEW_BAL" = "0" ]; then
  echo "  ✓ sweep complete"
else
  echo "  ⚠️ unexpected residual: $NEW_BAL — re-run to sweep again"
  exit 1
fi
